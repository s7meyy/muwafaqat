// ما يحفظه المستخدم — في متصفّحه وحده، ويُصدَّر بضغطة.
//
// لا حساب ولا خادم: من جمع موافقاتٍ لبحثٍ أو خطبةٍ أراد أن تبقى معه،
// ★ وأراد أن يأخذها معه ★ — فالتصدير ليس زينة، هو ما يمنع حبسَ عمله في متصفّح.

import { toArabicDigits } from '../../core/normalize.js';

const KEY = 'muwafaqat.saved';
const NO_KEY = 'muwafaqat.rejected';
const FIX_KEY = 'muwafaqat.corrections';
const HIST_KEY = 'muwafaqat.history';

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
function write(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* تخزينٌ ممتلئ أو محظور */ }
}

export const DEFAULT_GROUP = 'محفوظاتي';

export const saved = {
  all: (group = null) => read(KEY).filter((v) => !group || (v.group ?? DEFAULT_GROUP) === group),
  has: (text) => read(KEY).some((v) => v.text === text),
  groups() {
    const g = [...new Set(read(KEY).map((v) => v.group ?? DEFAULT_GROUP))];
    return g.length ? g : [DEFAULT_GROUP];
  },
  toggle(verse, group = DEFAULT_GROUP) {
    const list = read(KEY);
    const i = list.findIndex((v) => v.text === verse.text);
    if (i >= 0) list.splice(i, 1);
    else list.unshift({ ...verse, group, savedAt: new Date().toISOString() });
    write(KEY, list);
    return i < 0;
  },
  clear: () => write(KEY, []),
};

/**
 * ★ تصحيحُ النسبة ★ — إن رأى المستخدم نسبةً خاطئةً صوّبها.
 * يُحفظ ببصمة البيت لا بنصّه، فيثبت التصحيح ولو اختلفت الرواية في حرف.
 * ويُعرض موسومًا «صحّحتَها أنت» — فلا يُخلط تصحيحُ المستخدم بنقلِ المصدر.
 */
export const corrections = {
  all: () => read(FIX_KEY),
  get(fingerprint) { return read(FIX_KEY).find((c) => c.fp === fingerprint) ?? null; },
  set(fingerprint, poet, note = '') {
    const list = read(FIX_KEY).filter((c) => c.fp !== fingerprint);
    if (poet) list.unshift({ fp: fingerprint, poet, note, at: new Date().toISOString() });
    write(FIX_KEY, list);
  },
  clear: () => write(FIX_KEY, []),
};

/** تاريخُ ما بحثتَ عنه — عشرةٌ تُستعاد بنقرة. */
export const history = {
  all: () => read(HIST_KEY),
  add(query) {
    const list = read(HIST_KEY).filter((q) => q !== query);
    list.unshift(query);
    write(HIST_KEY, list.slice(0, 10));
  },
  clear: () => write(HIST_KEY, []),
};

/** «ليس موافقًا» — يُخفيه ويُذكر، فلا يعود في بحثٍ آخر. */
export const rejected = {
  all: () => read(NO_KEY),
  has: (text) => read(NO_KEY).includes(text),
  add(text) { const l = read(NO_KEY); if (!l.includes(text)) { l.push(text); write(NO_KEY, l); } },
  remove(text) { write(NO_KEY, read(NO_KEY).filter((t) => t !== text)); },
  clear: () => write(NO_KEY, []),
};

/** نصٌّ يُنسخ: البيت وقائله ومصدره — لا البيت وحده. */
export function verseToText(v) {
  const parts = [v.text];
  const who = v.poet ?? 'قائله غير معروف';
  const life = v.deathYear ? ` (ت ${toArabicDigits(String(v.deathYear))}هـ${v.era?.name ? ' · ' + v.era.name : ''})` : '';
  parts.push(`— ${who}${life}`);
  const s = v.source ?? {};
  const where = s.bookName
    ? `${s.bookName}${s.printedPage ? `، ص ${toArabicDigits(String(s.printedPage))}` : ''}`
    : (s.siteName ?? '');
  if (where) parts.push(where);
  if (s.url) parts.push(s.url);
  return parts.join('\n');
}

/** تصديرٌ نصّيّ لكل المحفوظ، مبوَّبًا بالمجموعات — يُفتح في أي محرّر. */
export function exportText() {
  const list = saved.all();
  if (!list.length) return 'لا محفوظات.';
  const groups = new Map();
  for (const v of list) {
    const g = v.group ?? DEFAULT_GROUP;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(v);
  }
  const out = ['الموافقات — المحفوظات', '='.repeat(28), ''];
  for (const [name, items] of groups) {
    out.push(`《 ${name} 》`, '');
    items.forEach((v, i) => out.push(`${i + 1}.`, verseToText(v), ''));
  }
  return out.join('\n');
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
