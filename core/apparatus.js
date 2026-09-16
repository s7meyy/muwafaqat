// جهازُ المحقّق — ما كتبه محقّقُ الكتاب حول البيت، لا البيت نفسه.
//
// ★ الكشفُ الذي دعا إلى هذا الملفّ: ★ ديوان لبيد يكتب فوق كلّ قصيدة بحرَها
// بين معقوفتين — «فتىً كان ★[الطويل]★» — ثم مناسبتَها — «أنشد ★يرثي أخاه
// أربد★:» — ثم يشرح غريبَها في الحاشية — «(٣) الشطبة: هي الفرس الطويلة» —
// ثم يذكر الروايةَ الأخرى — «وما بين قوسين يروى بلفظ: [بغير]».
//
// فكلُّ ما كان الموقعُ يعجز عنه أو يخمّنه ★ مكتوبٌ في الكتاب نفسه ★:
//   البحرُ الذي امتنعتُ عن إعلانه لأن التقطيع الآليّ لا يفصل بين البحور،
//   والغرضُ الذي كان يحتاج نموذجًا، وشرحُ الغريب الذي يحتاجه الباحث في
//   الصور الشعرية قبل كلّ شيء، والرواياتُ التي هي مادّةُ بحثٍ لا ضجيج.
//
// ولا يُستنبط منها شيء: ما لم يقله المحقّق لا يُقال عنه.

import { stripDiacritics } from './normalize.js';

const BUHUR = [
  'الطويل', 'المديد', 'البسيط', 'الوافر', 'الكامل', 'الهزج', 'الرجز', 'الرمل',
  'السريع', 'المنسرح', 'الخفيف', 'المضارع', 'المقتضب', 'المجتث', 'المتقارب',
  'المتدارك', 'المحدث', 'الخبب',
];

// «[الطويل]» في الدواوين · «[من الوافر]» في كتب التراجم · «(من البسيط)»
const METER_LINE = new RegExp(
  '[\\[\\(]\\s*(?:من\\s+)?(?:ال)?(' + BUHUR.map((b) => b.slice(2)).join('|') + ')\\s*[\\]\\)]',
);

/** بحرُ القصيدة كما كتبه الكتاب — أو لا شيء. */
export function meterFromHeading(line) {
  const m = METER_LINE.exec(stripDiacritics(String(line ?? '')));
  if (!m) return null;
  const name = `ال${m[1]}`;
  return BUHUR.includes(name) ? name : null;
}

// ★ الغرضُ يُقرأ من فعلِ المناسبة، لا يُخمَّن. ★
// «يرثي» ← رثاء · «يهجو» ← هجاء — وهذه مقابلةٌ لغويّةٌ لا حكمَ فيها.
const PURPOSES = [
  { purpose: 'رثاء', re: /(?:^|\s)(?:يرثي|يرثيه|رثى|مرثي|يندب|ينعى|ينعي|يبكي|في\s+رثاء)/ },
  { purpose: 'مدح', re: /(?:^|\s)(?:يمدح|مدح|في\s+مدح|يمتدح|مادحا)/ },
  { purpose: 'هجاء', re: /(?:^|\s)(?:يهجو|هجا|في\s+هجاء|هاجيا)/ },
  { purpose: 'غزل', re: /(?:^|\s)(?:يتغزل|يشبب|في\s+الغزل|في\s+التشبيب|تشبيبا)/ },
  { purpose: 'فخر', re: /(?:^|\s)(?:يفتخر|مفاخرا|في\s+الفخر|المنافرة|ينافر|نافر)/ },
  { purpose: 'وصف', re: /(?:^|\s)(?:يصف|في\s+وصف|واصفا)/ },
  { purpose: 'عتاب', re: /(?:^|\s)(?:يعاتب|في\s+عتاب|معاتبا)/ },
  { purpose: 'اعتذار', re: /(?:^|\s)(?:يعتذر|في\s+الاعتذار|معتذرا)/ },
  { purpose: 'حكمة', re: /(?:^|\s)(?:يوصي|وصية|في\s+الحكمة|الحكم|يعظ|واعظا)/ },
  { purpose: 'حماسة', re: /(?:^|\s)(?:يحرض|في\s+الحماسة|يوم\s+الوقعة)/ },
];

// أسطرُ المناسبة تبدأ بفعل قولٍ ثم تصف الحال: «وقال يخاطب ابنتيه لما حضرته الوفاة:»
const OCCASION = /^\s*(?:و?(?:قال|أنشد|يقول|قالت|أنشدت|كتب))\s+(.{3,90}?)\s*:\s*$/;

/**
 * مناسبةُ القصيدة وغرضُها من السطر الذي يسبقها.
 * يُرجع { occasion, purpose } — و`purpose` قد يكون null فلا يُخمَّن.
 */
export function occasionOf(line) {
  const t = stripDiacritics(String(line ?? '')).replace(/\s+/g, ' ').trim();
  const m = OCCASION.exec(t);
  if (!m) return null;
  const occasion = m[1].trim();
  if (!occasion || occasion.split(' ').length > 14) return null;
  const hit = PURPOSES.find((p) => p.re.test(' ' + occasion));
  return { occasion, purpose: hit?.purpose ?? null };
}

// «(٣) الشطبة: هي الفرس الطويلة. تدف: أي تطير.» — رقمٌ ثم شروحٌ مفصولةٌ بنقطة
const FOOT_LINE = /^\s*[\(\[]?([٠-٩۰-۹0-9]{1,3})[\)\]]?\s*[-:]?\s*(.+)$/;
const GLOSS = /([^.،؛]{2,30}?)\s*:\s*([^.]{2,120})/g;
// «وما بين قوسين يروى بلفظ: [بغير]» — الروايةُ الأخرى مصرَّحًا بها
const VARIANT = /يروى\s+بلفظ\s*:?\s*[\[\(]?\s*([^\]\)\.]{2,40})/;

/**
 * حواشي الصفحة مفهرسةً برقم التعليق.
 * يُرجع Map<'٣', { text, glosses: [{ word, gloss }], variant }>
 */
export function parseFootnotes(footText) {
  const out = new Map();
  for (const raw of String(footText ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = FOOT_LINE.exec(line);
    if (!m) continue;
    const [, marker, body] = m;

    const glosses = [];
    GLOSS.lastIndex = 0;
    let g;
    while ((g = GLOSS.exec(body)) !== null) {
      const word = g[1].trim().replace(/^(?:و|ف)/, '');
      const gloss = g[2].trim().replace(/^(?:هو|هي|أي|هم)\s+/, '');
      // سطرُ الروايةِ ليس شرحَ غريب: «وما بين قوسين يروى بلفظ: [بغير]»
      if (!word || !gloss || /يروى|يروي|رواية/.test(word) || word.split(' ').length > 4) continue;
      glosses.push({ word, gloss });
    }
    const variant = VARIANT.exec(body)?.[1]?.trim() ?? null;
    out.set(normalizeDigits(marker), { text: body.trim(), glosses, variant });
  }
  return out;
}

/** «٣» و«3» رقمٌ واحد. */
export function normalizeDigits(s) {
  return String(s ?? '').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06F0));
}
