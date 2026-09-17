// التطبيع — الدالّة التي يتوقّف عليها كل شيء في «الموافقات».
//
// نصوص الشاملة مشكولة: «الْمَعَالِي»، «السَّهَرُ». ومواقع الشبكة تكتبها بلا شكل،
// وبهمزاتٍ مختلفة، وبألفٍ مقصورةٍ مكان الياء. فلا تلتقي نسختان من بيتٍ واحد إلا بعد التطبيع.
//
// ★ قاعدة: بوابة التحقّق (verify.js) وإزالة المكرَّر (dedupe.js) والاستخراج (verses.js)
//   تستعمل هذه الدالّة نفسها. نسختان من التطبيع = بيتٌ صحيحٌ يسقط في البوابة بلا سبب.

const DIACRITICS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g; // التشكيل وعلامات المصاحف
const TATWEEL = /ـ/g;                                            // الكشيدة ـــ
const ZERO_WIDTH = /[​-‏‪-‮⁦-⁩﻿]/g;

/** حذف التشكيل والكشيدة فقط — للعرض، لا للمطابقة. النصّ يبقى مقروءًا. */
export function stripDiacritics(text) {
  return String(text ?? '').replace(DIACRITICS, '').replace(TATWEEL, '').replace(ZERO_WIDTH, '');
}

/** تحويل الأرقام العربية-الهندية إلى غربية (للحساب الداخلي). */
export function toWesternDigits(text) {
  return String(text ?? '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
}

/** تحويل الأرقام الغربية إلى عربية-هندية (للعرض — الموقع عربيٌّ أصلًا). */
export function toArabicDigits(text) {
  return String(text ?? '').replace(/[0-9]/g, (d) => String.fromCharCode(0x0660 + Number(d)));
}

/**
 * التطبيع الكامل للمطابقة. يُفقِد النصَّ جمالَه ويُبقي هويّته.
 * «وَما نَيلُ المَطالِبِ بِالتَمَنّي» و«وما نيل المطالب بالتمنِّي» ← سواء.
 */
export function normalize(text) {
  let s = stripDiacritics(text).toLowerCase();
  s = s
    .replace(/[أإآٱٲٳٵ]/g, 'ا')
    .replace(/[ىۍ]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي')
    .replace(/ء/g, '')          // الهمزة المفردة تُكتب وتُترك، فلا يُعوَّل عليها
    .replace(/گ/g, 'ك')
    .replace(/[پ]/g, 'ب');
  s = toWesternDigits(s);
  // كل ما ليس حرفًا عربيًّا أو رقمًا أو حرفًا لاتينيًّا ← فراغ
  s = s.replace(/[^ء-ي0-9a-z]+/g, ' ');
  return s.trim().replace(/\s+/g, ' ');
}

/** بصمةٌ ثابتةٌ للبيت، يُبنى عليها كشف المكرَّر. */
export function fingerprint(text) {
  return normalize(text).replace(/\s+/g, '');
}

/** عدد الكلمات بعد التطبيع — مقياس توازن الشطرين. */
export function wordCount(text) {
  const n = normalize(text);
  return n ? n.split(' ').length : 0;
}

/** هل النصّ عربيٌّ في غالبه؟ يمنع أسطر الحواشي اللاتينية وأرقام الصفحات. */
export function isMostlyArabic(text, threshold = 0.6) {
  // ★ يُحذف التشكيل قبل القياس. ★ علاماته خارج مدى الحروف، فالبيت المشكول كاملًا
  // — وهو حال الدواوين كلها — كانت تُحسب نصفُ محارفه «غير عربية» فتُرفض عربيّتُه
  // ويُسقَط البيت صامتًا. «فَجِئْتُ وَقَدْ نَضَّتْ لنَومٍ ثيابَها» كانت تُقرأ ٤٧٪ عربية.
  const chars = stripDiacritics(text).replace(/\s/g, '');
  if (!chars.length) return false;
  const arabic = (chars.match(/[ء-ي]/g) || []).length;
  return arabic / chars.length >= threshold;
}

/**
 * ★ مفتاحُ اسم الشاعر — لتوحيد صوره. ★
 * ظهر في فهرس التجربة: «لبيد بن ربيعة العامري» و«لبيد» و«لبيد ابن ربيعة
 * العامري» — ثلاثةُ شعراءَ في عدّاد الموقع، وثلاثةُ مداخلَ في أيّ ترشيحٍ
 * بالشاعر، وثلاثُ ترجماتٍ تُطلب من «الأعلام». وهو رجلٌ واحد.
 * فيُوحَّد: «ابن» و«بن» سواء، والألقابُ الزائدة تُسقط عند المقارنة.
 */
export function poetKey(name) {
  // ★ و«\b» لا تعمل مع العربية في JS ★ — حدودُ الكلمة فيها للاتينية وحدها
  const t = normalize(name)
    .replace(/(^|\s)ابن(?=\s)/g, '$1بن')
    .replace(/\s+/g, ' ')
    .trim();
  return t;
}

/** أهما اسمٌ واحدٌ في صورتين؟ (أحدهما أطولُ نسبًا من الآخر) */
export function sameName(a, b) {
  const x = poetKey(a);
  const y = poetKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [long, short] = x.length >= y.length ? [x, y] : [y, x];
  // «لبيد» و«لبيد بن ربيعة العامري»: يُعدّان واحدًا إن كان القصير أوّلَ الطويل
  return short.length >= 3 && (long === short || long.startsWith(short + ' '));
}

// ★★ رقمُ الحاشية قد يلتصق بالكلمة بلا قوسٍ ولا فاصل. ★★
//
//   «الكامل» للمبرّد يكتبه هكذا: «أعرف منه★١★ قلة النعاس»، «قال أبو كبيرٍ★٢★
//   الهذلي:». فكان يبقى في نصّ البيت فيُعرض «الهوجل٣» ويُنقل إلى الرسالة،
//   ويُفسد المطابقة؛ ويبقى في اسم القائل فيُردّ الاسمُ كلُّه لأن فيه رقمًا،
//   فيخرج شعرُ أبي كبيرٍ الهذلي بلا قائل. والعربيةُ لا تُلصق رقمًا بحرفٍ إلا
//   أن يكون إحالةً على حاشية.
export const GLUED_MARK = /(?<=[\u0621-\u0652])[\u0660-\u0669\u06F0-\u06F90-9]{1,3}(?![\u0660-\u0669\u06F0-\u06F90-9])/g;

/** يقصّ أرقامَ الحواشي الملتصقة بالكلمات، ويترك ما سواها. */
export function stripGluedMarks(text) {
  return String(text ?? '').replace(GLUED_MARK, '');
}

/** آخرُ رقمِ حاشيةٍ ملتصقٍ في النصّ — مفتاحُ شرحه في الحاشية. */
export function lastGluedMark(text) {
  const all = String(text ?? '').match(GLUED_MARK);
  return all?.length ? all[all.length - 1] : null;
}
