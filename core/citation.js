// الإحالة — ما ينسخه الباحث إلى حاشية بحثه.
//
// ★ وكان ينسخها بيده من ثلاثة مواضع في البطاقة ★، ويعيد ترتيبها، ويُخطئ في
// الترقيم العربيّ. وهي أكثرُ ما يتكرّر في عمله: بيتٌ واحدٌ قد يُحيل إليه مرارًا.
//
// وفيها أمانةٌ لا تُترك: ★ الشاملة ترقّم بعض الكتب آليًّا ★، وليس ذلك ترقيمَ
// المطبوع. فمن أحال به إلى صفحةٍ في نسخةٍ ورقية أخطأ، فيُقال له.

import { toArabicDigits } from './normalize.js';

const AUTO_NOTE = 'بترقيم الشاملة آليًّا لا ترقيم المطبوع';

/**
 * إحالةٌ عربيةٌ جاهزة:
 *   «لبيد بن ربيعة — "ألا كل شيء…"، الصفدي، أعيان العصر، ص ١/ ٤٣٦.»
 * وما نقص منها يُحذف ولا يُختلق.
 */
export function citationOf(v, { verse = null, style = 'ar' } = {}) {
  const s = v?.source ?? {};
  if (style === 'bibtex') return bibtex(v);

  const bits = [];
  if (verse) bits.push(`«${String(verse).replace(/\s*\.\.\.\s*/, ' ... ')}»`);
  const poet = v?.poet ?? (v?.disputedPoets?.length ? `اختُلف في نسبته (${v.disputedPoets.join('، ')})` : null);
  // ★ ولا تُلصق لامُ الجرّ بالاسم ★ — «لـلبيد» و«لـلمتنبي» شائنٌ في حاشيةٍ
  //   تُنشر، والتصريح بالكلمة أسلم: «القائل: …».
  bits.push(poet ? `القائل: ${poet}` : 'القائل غير معروف');
  if (v?.deathYear) bits.push(`(ت ${toArabicDigits(String(v.deathYear))}هـ)`);

  const where = [];
  if (s.bookAuthor) where.push(s.bookAuthor);
  if (s.bookName) where.push(s.bookName);
  if (s.printedPage) where.push(`ص ${toArabicDigits(String(s.printedPage))}`);
  else if (s.pageId) where.push(`الصفحة ${toArabicDigits(String(s.pageId))}`);
  if (where.length) bits.push(`— ${where.join('، ')}`);

  let out = bits.join(' ').replace(/\s+/g, ' ').trim() + '.';
  if (s.autoNumbered) out += ` (${AUTO_NOTE})`;
  if (s.url) out += `\n${s.url}`;
  return out;
}

/** لمن يستعمل Zotero وأخواتِه. */
function bibtex(v) {
  const s = v?.source ?? {};
  const key = (s.bookName ?? 'verse').replace(/[^ء-يa-zA-Z0-9]+/g, '-').slice(0, 40);
  const lines = [`@incollection{${key}-${s.pageId ?? 0},`];
  if (s.bookAuthor) lines.push(`  author = {${s.bookAuthor}},`);
  if (s.bookName) lines.push(`  booktitle = {${s.bookName}},`);
  if (v?.poet) lines.push(`  note = {البيت لـ${v.poet}${v.deathYear ? ` (ت ${v.deathYear}هـ)` : ''}},`);
  if (s.printedPage) lines.push(`  pages = {${s.printedPage}},`);
  if (s.url) lines.push(`  url = {${s.url}},`);
  lines.push('}');
  return lines.join('\n');
}
