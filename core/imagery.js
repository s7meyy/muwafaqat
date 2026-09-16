// معجمُ الصور الشعرية — البابُ الذي سُمّي في أوّل الطلب: «المعنى والموضوع
// ★ والصور الشعرية ★».
//
// والصورةُ في الشعر العربي تشبيهٌ أو استعارةٌ تتكرّر عند الشعراء وتتحوّل:
//   «المنيّة سهمٌ» · «الشيبُ صبحٌ» · «الدهرُ غادرٌ» · «الكفُّ بحرٌ»
// والباحثُ يجمع أبياتَها ليرى ★ تطوّرها ★ لا ليقرأ أبياتًا متفرّقة.
//
// ★ والمنهج هنا كالمنهج في كلّ الموقع: لا يُختلق شيء. ★ لا تُسمّى الصورةُ
// باسمٍ من عندنا، ولا يُحكم على بيتٍ بأنه استعارة. وإنما يُقال ما يُرى في
// النصّ: ★ أيُّ لفظين من ألفاظ الصور اجتمعا في بيت ★ — «المنيّة» و«سهم» —
// ثم تُجمع الأبيات التي اجتمع فيها اللفظان أنفسهما. فما خرج فهو ★ اقترانٌ
// مرصود ★ لا تصنيفٌ مزعوم، ويُقال للقارئ ذلك صراحة.

import { normalize, poetKey } from './normalize.js';

// حقولُ الصور: كلماتٌ يدور عليها التصوير في الشعر العربي.
// (وهي مفاتيحُ رصدٍ لا قائمةَ أغراض: ما اجتمع منها في بيتٍ رُصد، وما لا فلا.)
export const FIELDS = {
  'الموت والمنية': ['المنية', 'المنايا', 'الموت', 'الحمام', 'الردى', 'القبر', 'اللحد', 'المقادير'],
  'الدهر والزمان': ['الدهر', 'الزمان', 'الأيام', 'الليالي', 'الحدثان', 'صروف', 'ريب'],
  'الشيب والشباب': ['الشيب', 'المشيب', 'الشباب', 'الصبا', 'البياض', 'الفود', 'المفرق'],
  'الجود والكرم': ['الجود', 'الكرم', 'الندى', 'العطاء', 'النوال', 'السماح', 'الكف', 'اليمين'],
  'الحرب والشجاعة': ['الحرب', 'السيف', 'الرمح', 'الطعن', 'الضرب', 'الكماة', 'الوغى', 'اللقاء'],
  'الفراق والشوق': ['البين', 'الفراق', 'النوى', 'الشوق', 'الحنين', 'الرحيل', 'الظعن'],
  'الطلل والديار': ['الطلل', 'الديار', 'الربع', 'الدمن', 'المنزل', 'الرسم', 'الأطلال'],
  'المجد والسعي': ['المجد', 'العلا', 'المعالي', 'السعي', 'الكد', 'الجد', 'المطالب'],
};

// المشبَّه به: ما تُستعار له الصورة
export const VEHICLES = {
  'سهم': ['سهم', 'سهام', 'نبل', 'رمية'],
  'بحر': ['بحر', 'بحار', 'يم', 'غيث', 'سحاب'],
  'صبح': ['صبح', 'فجر', 'نهار', 'ضوء', 'نور'],
  'ليل': ['ليل', 'ظلام', 'دجى', 'سواد'],
  'بدر': ['بدر', 'هلال', 'قمر', 'شمس'],
  'أسد': ['أسد', 'ليث', 'ضرغام', 'هزبر'],
  'نار': ['نار', 'لهيب', 'جمر', 'حريق'],
  'سيف': ['سيف', 'حسام', 'صارم', 'مهند'],
  'ظل': ['ظل', 'ظلال', 'سراب'],   // ★ و«فيء» تُطبَّع «في» فتلتقي بحرف الجرّ ★
  'ثوب': ['ثوب', 'رداء', 'حلة', 'قميص'],
};

const MAX_TOKENS = 40;

// سوابقُ العربية الملتصقة — تُولَّد صورُ الكلمة بها، فلا يُجرَّد نصُّ البيت
// تجريدًا يُلبس كلمةً بكلمة («فيء» تُطبَّع «في»، فلو جُرّدت التقت بحرف الجرّ).
const PREFIXES = [
  '', 'ال', 'ب', 'ك', 'ف', 'و', 'ل',
  'بال', 'كال', 'فال', 'وال', 'لل', 'وب', 'وك', 'ول', 'فب', 'فل',
  'وبال', 'فبال', 'وكال', 'ولل', 'فلل',
];

/** صورُ الكلمة الواحدة كما ترد في الشعر — مطبَّعةً. */
function formsOfWord(word) {
  const w = normalize(word);
  const out = new Set();
  for (const p of PREFIXES) out.add(p + w);
  // والمعرَّفُ يُجرَّد كذلك: «الدهر» ← «دهر» وصورُه
  if (w.startsWith('ال')) for (const p of PREFIXES) out.add(p + w.slice(2));
  return out;
}

// جدولٌ مبنيٌّ مرّةً: صورةُ الكلمة ← اسمُ حقلها أو مشبَّهها
function compile(table) {
  const map = new Map();
  for (const [name, words] of Object.entries(table)) {
    for (const word of words) for (const form of formsOfWord(word)) {
      if (!map.has(form)) map.set(form, new Set());
      map.get(form).add(name);
    }
  }
  return map;
}

const FIELD_FORMS = compile(FIELDS);
const VEHICLE_FORMS = compile(VEHICLES);

function tokensOf(text) {
  return new Set(normalize(text).split(' ').filter(Boolean).slice(0, MAX_TOKENS));
}

function hitsIn(tokens, map) {
  const found = new Set();
  for (const t of tokens) for (const name of map.get(t) ?? []) found.add(name);
  return [...found];
}

/**
 * صورُ البيت: اقترانُ حقلٍ بمشبَّهٍ به، كما رُصد في لفظه.
 * يُرجع [{ field, vehicle, label }] — و«label» ما يُعرض: «المنية ← سهم».
 */
export function imagesOf(text) {
  const tokens = tokensOf(text);
  const fields = hitsIn(tokens, FIELD_FORMS);
  const vehicles = hitsIn(tokens, VEHICLE_FORMS);
  const out = [];
  for (const field of fields) {
    for (const vehicle of vehicles) {
      out.push({ field, vehicle, label: `${field} ← ${vehicle}` });
    }
  }
  return out;
}

/**
 * ★ معجمُ الصور: ★ يجمع أبياتَ كلّ صورةٍ مرتَّبةً بالأقدم، فيُرى تطوّرُها.
 * `verses` = [{ text, poet, deathYear, source }]
 * يُرجع [{ label, field, vehicle, verses, poets, first, span }] مرتَّبةً بالأكثر.
 */
export function buildImageryIndex(verses, { minVerses = 2 } = {}) {
  const groups = new Map();
  for (const v of verses) {
    for (const img of imagesOf(v.text)) {
      if (!groups.has(img.label)) groups.set(img.label, { ...img, verses: [] });
      groups.get(img.label).verses.push(v);
    }
  }

  const out = [];
  for (const g of groups.values()) {
    if (g.verses.length < minVerses) continue;
    const dated = g.verses.filter((v) => Number.isFinite(v.deathYear));
    const sorted = [...g.verses].sort((a, b) => (a.deathYear ?? Infinity) - (b.deathYear ?? Infinity));
    const years = dated.map((v) => v.deathYear);
    out.push({
      ...g,
      verses: sorted,
      poets: [...new Set(g.verses.map((v) => v.poet).filter(Boolean).map(poetKey))].length,
      first: sorted[0] ?? null,
      span: years.length ? { from: Math.min(...years), to: Math.max(...years) } : null,
    });
  }
  return out.sort((a, b) => b.verses.length - a.verses.length);
}
