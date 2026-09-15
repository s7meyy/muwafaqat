// ما يحفظه المستخدم — في متصفّحه وحده، ويُصدَّر بضغطة.
//
// لا حساب ولا خادم: من جمع موافقاتٍ لبحثٍ أو خطبةٍ أراد أن تبقى معه،
// ★ وأراد أن يأخذها معه ★ — فالتصدير ليس زينة، هو ما يمنع حبسَ عمله في متصفّح.

import { toArabicDigits } from '../../core/normalize.js';

const KEY = 'muwafaqat.saved';
const NO_KEY = 'muwafaqat.rejected';

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}
function write(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* تخزينٌ ممتلئ أو محظور */ }
}

export const saved = {
  all: () => read(KEY),
  has: (text) => read(KEY).some((v) => v.text === text),
  toggle(verse) {
    const list = read(KEY);
    const i = list.findIndex((v) => v.text === verse.text);
    if (i >= 0) list.splice(i, 1);
    else list.unshift({ ...verse, savedAt: new Date().toISOString() });
    write(KEY, list);
    return i < 0;
  },
  clear: () => write(KEY, []),
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
    ? `${s.bookName}${s.printedPage ? `، ص ${s.printedPage}` : ''}`
    : (s.siteName ?? '');
  if (where) parts.push(where);
  if (s.url) parts.push(s.url);
  return parts.join('\n');
}

/** تصديرٌ نصّيّ لكل المحفوظ — يُفتح في أي محرّر. */
export function exportText() {
  const list = saved.all();
  if (!list.length) return 'لا محفوظات.';
  return ['الموافقات — المحفوظات', '='.repeat(28), '']
    .concat(list.map((v, i) => `${i + 1}.\n${verseToText(v)}\n`))
    .join('\n');
}

export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
