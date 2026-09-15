// قراءة سنَتَي المولد والوفاة من نصّ التراجم.
//
// «الأعلام» للزركلي يكتبها بصيغةٍ منتظمة:
//   أَبُو الطَّيِّبِ المُتَنَبِّي. (٣٠٣ - ٣٥٤ هـ = ٩١٥ - ٩٦٥ م)
// فسنةُ الوفاة تصير مقتبسةً من صفحةٍ تُذكر، لا رقمًا يظهر بلا سند.
//
// ولمَ احتجنا هذا: فهرس مؤلّفي الشاملة فهرسُ مؤلّفي كتبٍ لا شعراء —
// المتنبي والشريف الرضي ليسا فيه أصلًا، وجريرٌ فيه لأن له ديوانًا.

import { stripDiacritics, toWesternDigits, normalize } from './normalize.js';

// (٣٠٣ - ٣٥٤ هـ = ٩١٥ - ٩٦٥ م)  ·  (٠٠٠ - ٣٥٤ هـ)  ·  (ت ٣٥٤ هـ)
const FULL = /\(\s*(\d{1,4})\s*[-–—]\s*(\d{1,4})\s*ه\s*(?:=\s*(\d{1,4})\s*[-–—]\s*(\d{1,4})\s*م\s*)?\)/;
const DEATH_ONLY = /\(\s*(?:ت|المتوفى|توفي)\s*\.?\s*(\d{1,4})\s*ه\s*\)/;

/** يُسوّي النصّ لقراءة الأرقام: بلا تشكيلٍ ولا كشيدة، وبأرقامٍ غربية. */
function plainify(text) {
  return toWesternDigits(stripDiacritics(String(text ?? ''))).replace(/\s+/g, ' ');
}

/** يقرأ أول ترجمةٍ في نصّ. يُرجع { birthYear, deathYear, gregorian } أو null. */
export function parseLifespan(text) {
  const t = plainify(text);

  const m = FULL.exec(t);
  if (m) {
    const birth = Number(m[1]);
    const death = Number(m[2]);
    if (!death) return null;
    return {
      birthYear: birth > 0 ? birth : null,     // «٠٠٠» = مولدٌ غير معروف
      deathYear: death,
      gregorian: m[4] ? { birth: Number(m[3]) || null, death: Number(m[4]) } : null,
    };
  }

  const d = DEATH_ONLY.exec(t);
  if (d) return { birthYear: null, deathYear: Number(d[1]), gregorian: null };

  return null;
}

/**
 * عنوان الترجمة: ما بين آخر نهاية جملةٍ والقوس الذي فيه السنتان.
 * «… الشافعيّ (١) . أبو الطيب المتنبي. (٣٠٣ - ٣٥٤ هـ)» ← «أبو الطيب المتنبي»
 * والشافعيُّ ذيلُ الترجمة السابقة، فلا تُنسب إليه وفاةُ من بعده.
 */
function headwordBefore(plain, index, radius) {
  let before = plain.slice(Math.max(0, index - radius), index).replace(/[\s.،:]+$/, '');
  const cut = Math.max(before.lastIndexOf('.'), before.lastIndexOf('\n'), before.lastIndexOf(')'));
  const head = cut >= 0 ? before.slice(cut + 1) : before;
  return head.trim().slice(-80);
}

/**
 * يقرأ الترجمة التي تخصّ هذا الاسم وحده.
 * صفحة «الأعلام» فيها تراجمُ عدّة، فلا تُؤخذ أول سنةٍ تُصادَف — ولا كلُّ اسمٍ
 * وقع في الجوار. الاسم يجب أن يكون ★ عنوانَ الترجمة ★ لا جارًا لها.
 */
export function findLifespanFor(name, pageText, { radius = 160 } = {}) {
  const wanted = normalize(name);
  if (!wanted) return null;
  const plain = plainify(pageText);
  const norm = normalize(pageText);
  if (!norm.includes(wanted)) return null;

  const pattern = new RegExp(`${FULL.source}|${DEATH_ONLY.source}`, 'g');
  let m;
  while ((m = pattern.exec(plain)) !== null) {
    const head = headwordBefore(plain, m.index, radius);
    if (normalize(head).includes(wanted)) {
      const parsed = parseLifespan(m[0]);
      if (parsed) return { ...parsed, headword: head, context: `${head} ${m[0]}`.trim() };
    }
  }
  return null;
}
