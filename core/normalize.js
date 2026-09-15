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
  const chars = String(text ?? '').replace(/\s/g, '');
  if (!chars.length) return false;
  const arabic = (chars.match(/[ء-ي]/g) || []).length;
  return arabic / chars.length >= threshold;
}
