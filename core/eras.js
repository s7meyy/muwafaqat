// العصر من سنة الوفاة. ولا يُخمَّن عصرٌ بلا سنةٍ معلومة.

import { toArabicDigits } from './normalize.js';

export const ERAS = [
  { key: 'jahili',   name: 'جاهلي',            from: null, to: 0 },
  { key: 'islami',   name: 'إسلامي (صدر الإسلام)', from: 1,   to: 40 },
  { key: 'umawi',    name: 'أموي',             from: 41,  to: 132 },
  { key: 'abbasi',   name: 'عباسي',            from: 133, to: 656 },
  { key: 'mamluki',  name: 'مملوكي وعثماني',   from: 657, to: 1213 },
  { key: 'hadith',   name: 'حديث ومعاصر',      from: 1214, to: null },
];

/** هجري ← ميلادي تقريبًا. ت ٣٥٤هـ ← ٩٦٥م. */
export function hijriToGregorian(h) {
  const y = Number(h);
  if (!Number.isFinite(y) || y <= 0) return null;
  return Math.round(y - y / 33 + 622);
}

/**
 * العصر من سنة الوفاة الهجرية.
 * `mukhadram: true` لمن أدرك الجاهلية والإسلام — لا يُستنبط من رقم، فيُمرَّر تمريرًا.
 * والمجهول يُرجع null، ويُعرض «غير معروف» ولا يُملأ بتخمين.
 */
export function eraOf(deathYearHijri, { mukhadram = false } = {}) {
  if (mukhadram) return { key: 'mukhadram', name: 'مخضرم' };
  const y = Number(deathYearHijri);
  if (!Number.isFinite(y) || y <= 0) return null;
  for (const e of ERAS) {
    if ((e.from === null || y >= e.from) && (e.to === null || y <= e.to)) return { key: e.key, name: e.name };
  }
  return null;
}

/** القرن الهجري — جوابٌ أخشن من العصر، ويُقال حين لا يُعرف غيره. */
export function hijriCentury(y) {
  const n = Number(y);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor((n - 1) / 100) + 1;
}

/** سطر التأريخ كما يُعرض في البطاقة: «ت ٣٥٤هـ / ٩٦٥م · عباسي» */
export function lifespanLabel(deathYearHijri, opts = {}) {
  const era = eraOf(deathYearHijri, opts);
  const h = Number(deathYearHijri);
  if (!Number.isFinite(h) || h <= 0) return era ? era.name : 'غير معروف';
  const hh = toArabicDigits(String(h));
  const gg = toArabicDigits(String(hijriToGregorian(h)));
  return `ت ${hh}هـ / ${gg}م · ${era ? era.name : 'غير معروف'}`;
}
