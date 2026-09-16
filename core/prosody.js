// العَروض — البحر والقافية والرويّ.
//
// ★ ولمَ هما في موقعٍ للموافقات: ★ المعارضة بابٌ أصيل في الشعر العربي — أن
// يُنظم على بحر قصيدةٍ ورويِّها. والباحث الذي يجمع أبياتًا في معنًى واحد أوّلُ
// ما يكتب في بطاقته: البحر والرويّ. وهما يُحسبان حسابًا، لا يُسألان من نموذج.
//
// ★ وشرطُ الصدق فيهما: ★ التقطيع لا يقوم إلا على نصٍّ مشكول. والفهرس فيه
// المشكول وغيره، فما لم يُشكَل ★ لا يُخمَّن له بحر ★ — ويُقال «لم يُقطَّع لأنه
// غير مشكول»، وهو خبرٌ صادق خيرٌ من اسم بحرٍ مكذوب.

import { stripDiacritics } from './normalize.js';

const HARAKAT = 'َُِ';                  // فتحة ضمة كسرة
const TANWIN = 'ًٌٍ';                   // تنوين
const SUKUN = 'ْ';
const SHADDA = 'ّ';
const LETTER = /[ء-غـ-ي]/;
const SUN = 'تثدذرزسشصضطظلن';

/**
 * تقطيعُ البيت إلى متحرّكٍ (١) وساكنٍ (٠).
 * يُرجع { pattern, vocalized } — و`vocalized` نسبةُ الحروف المضبوطة، فما نقص
 * عنها لا يُبنى عليه حكم.
 */
export function scan(text) {
  const raw = String(text ?? '').replace(/\s*(?:\.{3}|…)\s*/g, ' ').trim();
  if (!raw) return { pattern: '', vocalized: 0 };

  const words = raw.split(/\s+/).filter(Boolean);

  // ★ في النصّ المشكول، خلوُّ الحرف من العلامة حكمٌ لا نقص: ★ هو ساكن.
  //   (وكان يُحسب مجهولًا فيضيع التقطيع كلُّه.) فنقيس كثافةَ الضبط أولًا:
  //   فإن كان النصّ مشكولًا حُمل غيرُ المعلَّم على السكون، وإلّا تُرك «؟».
  const marks = [...raw].filter((c) => HARAKAT.includes(c) || TANWIN.includes(c)
    || c === SUKUN || c === SHADDA).length;
  const letterCount = [...raw].filter((c) => LETTER.test(c)).length || 1;
  const density = marks / letterCount;
  const SHAKL = density >= 0.5;    // نصٌّ مشكول
  let out = '';
  // ★ لا يُقاس الضبطُ بعدد الحركات: ★ حروفُ المدّ لا تُحرَّك أصلًا، وآخرُ البيت
  //   يُسكَّن بالوقف. فالمقياس: كم حرفًا اضطُرِرنا فيه إلى التخمين.
  let letters = 0, guessed = 0;

  words.forEach((word, wi) => {
    const chars = [...word].filter((c) => LETTER.test(c) || HARAKAT.includes(c)
      || TANWIN.includes(c) || c === SUKUN || c === SHADDA || c === 'ٱ' || c === 'آ');

    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (!LETTER.test(c) && c !== 'آ') continue;
      letters++;

      // ★ همزةُ الوصل تسقط في الدرج ★ — «الحمد» بعد كلمةٍ: لا تُنطق ألفُها
      if (c === 'ا' && i === 0 && wi > 0 && chars[1] === 'ل') { continue; }

      // ★ لامُ «ال» الشمسية لا تُنطق ★ — «الشمس» = «اشّمس»
      if (c === 'ل' && i === 1 && chars[0] === 'ا' && SUN.includes(chars[2] ?? '')) {
        if (chars[3] === SHADDA || !HARAKAT.includes(chars[3] ?? '')) continue;
      }

      const next = chars[i + 1];
      const after = chars[i + 2];

      if (c === 'آ') { out += '10'; continue; }      // ألفٌ ممدودة

      if (next === SHADDA) {
        // المشدّد حرفان: ساكنٌ ثمّ متحرّك
        out += '0';
        const h = after;
        if (HARAKAT.includes(h)) { out += '1'; i += 2; }
        else if (TANWIN.includes(h)) { out += '10'; i += 2; }
        else { out += '1'; i += 1; }
        continue;
      }

      if (HARAKAT.includes(next)) {
        out += '1';
        // حرفُ مدٍّ بعد حركةٍ مجانسة يُعدّ ساكنًا
        if ((after === 'ا') || (after === 'و' && next === 'ُ') || (after === 'ي' && next === 'ِ')) {
          out += '0'; i += 2; letters++;
        } else i += 1;
        continue;
      }
      if (TANWIN.includes(next)) { out += '10'; i += 1; continue; }
      if (next === SUKUN) { out += '0'; i += 1; continue; }

      // ألفٌ أو واوٌ أو ياءٌ بلا ضبطٍ بعد متحرّك: مدٌّ ساكن
      if ('اوىي'.includes(c) && out.endsWith('1')) { out += '0'; continue; }

      // ★ حرفٌ لم يُضبط ولا قامت قرينةٌ عليه ★ — يُحسب متحرّكًا ويُخصم من الثقة.
      //   وآخرُ حرفٍ في البيت مستثنًى: الوقف يُسكّنه، والشعر يصله بالمدّ.
      const isLast = wi === words.length - 1 && !chars.slice(i + 1).some((x) => LETTER.test(x));
      if (isLast) { out += '1'; continue; }        // الرويّ يُشبع بعدُ
      guessed++;
      // ★ ولا يُفرض على الحرف حكمٌ لم يَقُله النصّ ★ — «؟» يحتمل الأمرين
      out += '?';
    }
  });

  // ★ الرويّ المطلق يُشبع: ★ آخرُ البيت متحرّكٌ يتبعه مدٌّ في التقطيع
  if (out.endsWith('1')) out += '0';

  return { pattern: out, vocalized: letters ? 1 - guessed / letters : 0, shakl: SHAKL };
}

// البحور بتفاعيلها الأصلية (١ متحرّك · ٠ ساكن)، ومعها ما يُتسامح فيه من زحاف.
// (سبب عملٍ بالأنماط لا بالتفاعيل: الزحافُ يغيّر التفعيلة ولا يُخرج البيت عن بحره،
//  والمقارنةُ بالنمط مع مسافةٍ صغيرة أقربُ إلى الواقع من جدول تفاعيلَ جامد.)
// التفاعيل بالترميز المعروف: الحركة ١ والسكون ٠.
//   فعولن //٠/٠ · مفاعيلن //٠/٠/٠ · مستفعلن /٠/٠//٠ · فاعلن /٠//٠
//   فاعلاتن /٠//٠/٠ · متفاعلن ///٠//٠ · مفاعلتن //٠///٠ · مفعولات /٠/٠/٠/
const FEET = {
  'فعولن':   '11010',
  'مفاعيلن': '1101010',
  'مستفعلن': '1010110',
  'فاعلن':   '10110',
  'فاعلاتن': '1011010',
  'متفاعلن': '1110110',
  'مفاعلتن': '1101110',
  'مفعولات': '1010101',
};

const BUHUR = [
  { name: 'الطويل', feet: ['فعولن', 'مفاعيلن', 'فعولن', 'مفاعيلن'] },
  { name: 'المديد', feet: ['فاعلاتن', 'فاعلن', 'فاعلاتن'] },
  { name: 'البسيط', feet: ['مستفعلن', 'فاعلن', 'مستفعلن', 'فاعلن'] },
  { name: 'الوافر', feet: ['مفاعلتن', 'مفاعلتن', 'فعولن'] },
  { name: 'الكامل', feet: ['متفاعلن', 'متفاعلن', 'متفاعلن'] },
  { name: 'الهزج', feet: ['مفاعيلن', 'مفاعيلن'] },
  { name: 'الرجز', feet: ['مستفعلن', 'مستفعلن', 'مستفعلن'] },
  { name: 'الرمل', feet: ['فاعلاتن', 'فاعلاتن', 'فاعلاتن'] },
  { name: 'السريع', feet: ['مستفعلن', 'مستفعلن', 'فاعلن'] },
  { name: 'الخفيف', feet: ['فاعلاتن', 'مستفعلن', 'فاعلاتن'] },
  { name: 'المتقارب', feet: ['فعولن', 'فعولن', 'فعولن', 'فعولن'] },
  { name: 'المتدارك', feet: ['فاعلن', 'فاعلن', 'فاعلن', 'فاعلن'] },
];

function patternOf(bahr) {
  return bahr.feet.map((f) => FEET[f]).join('');
}

// «؟» حرفٌ لم يضبطه النصّ، فهو يحتمل الحركة والسكون. ★ ويُثمَّن قليلًا: ★
// المجهول يوافق كلَّ بحرٍ فلو كان مجّانًا لتساوت البحور، ولمَا حُكم بشيء.
// فتُقدَّم القراءةُ التي يفسّرها ما ★ ضُبط ★ من النصّ، لا ما سُكت عنه.
const UNKNOWN_COST = 0.35;
const cost = (x, y) => (x === y ? 0 : (x === '?' || y === '?' ? UNKNOWN_COST : 1));

/** مسافةُ ليفنشتاين — قدرُ ما بين النمطين من زحافٍ أو خطأٍ في الضبط. */
function distance(a, b) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost(a[i - 1], b[j - 1]));
    }
    prev = cur;
  }
  return prev[n];
}

const MIN_VOCALIZED = 0.55;  // ما دونه لا يُقطَّع — والمجهولُ «؟» لا يُفسد ما حوله

// ★★ لماذا لا يُعلَن البحر. ★★
//
// قِيس هذا على أبياتٍ حقيقيةٍ من الشاملة (ستّةٌ من الرجز في شرح الألفية، وبيتُ
// لبيدٍ من الطويل)، فكانت أخطاءُ البحور كلِّها متقاربةً بين ٠٫١٦ و٠٫٢١، والفرقُ
// بين الأوّل والثاني ٠٫٠١ إلى ٠٫٠٣ — وأصاب «الأقربُ» في أربعةٍ من سبعة.
//
// والعلّة معروفة: نصوصُ المكتبة ليست تامّةَ الشكل (٧٥٪–٩٤٪ من حروفها مضبوطة)،
// والزحافاتُ والعللُ تغيّر التفاعيل تغييرًا واسعًا، فمقياسُ المسافة لا يفصل.
//
// ★ فالبحرُ لا يُعلَن. ★ ويُعرض ما هو حقيقةٌ لا ترجيح: التقطيع نفسه والقافية.
// وإعلانُ بحرٍ خاطئٍ في بطاقةٍ يَنسخها باحثٌ إلى رسالته أسوأُ من السكوت.
// (والطريق إلى إعلانه: مطابقةٌ بجدول الزحافات والعلل لكل بحر، لا بمسافةِ نصّ —
//  ومعها نصوصٌ تامّةُ الشكل. وهو عملٌ قائمٌ بنفسه.)
const MAX_ERROR = 0.16;
const MARGIN = 0.04;

/**
 * تقطيعُ البيت وأقربُ البحور إليه.
 * ★ ولا يُرجع بحرًا ★ — `bahr` صفرٌ دائمًا في هذه النسخة، و`closest` للاستئناس
 * في لوحة التفصيل لا للعرض حكمًا. (انظر التعليق أعلاه.)
 */
export function meterOf(text) {
  const { pattern, vocalized } = scan(text);
  if (!pattern) return { bahr: null, pattern: '', reason: 'لا نصّ' };
  if (vocalized < MIN_VOCALIZED) {
    return { bahr: null, pattern, vocalized, reason: 'النصّ غير مشكول، فلا يُقطَّع' };
  }

  const scored = BUHUR.map((b) => {
    const p = patternOf(b);
    const full = p + p;   // الشطر يُقاس بنصف البيت، والبيتُ بالنمط مكرَّرًا
    const d = Math.min(distance(pattern, full) / full.length, distance(pattern, p) / p.length);
    return { name: b.name, error: Number(d.toFixed(3)) };
  }).sort((a, b) => a.error - b.error);

  const [first, second] = scored;
  const margin = second ? Number((second.error - first.error).toFixed(3)) : 1;
  return {
    bahr: null,
    pattern, vocalized,
    closest: first.name, error: first.error, margin,
    reason: (first.error > MAX_ERROR || margin < MARGIN)
      ? 'لم يُحكم ببحر: الأنماط متقاربةٌ ولا يفصل بينها التقطيع الآليّ'
      : 'لم يُحكم ببحر: التقطيع الآليّ لا يُغني عن جدول الزحافات',
  };
}

/**
 * القافية: الرويّ وما بعده.
 * ★ ولا تُطبَّع الكلمة قبلها ★ — التطبيع يُذهب الهمزة، والهمزة رويّ.
 */
export function rhyme(text) {
  const t = stripDiacritics(String(text ?? '')).replace(/[^ء-ي\s]/g, ' ').trim();
  if (!t) return null;
  const last = t.split(/\s+/).pop() ?? '';
  const letters = [...last].filter((c) => LETTER.test(c));
  if (letters.length < 2) return null;
  // حرفُ الرويّ: آخرُ حرفٍ صحيح — وحروفُ المدّ في آخره وصلٌ لا رويّ
  let i = letters.length - 1;
  while (i > 0 && 'اوىي'.includes(letters[i])) i--;
  return { rawi: letters[i], tail: letters.slice(i).join('') };
}
