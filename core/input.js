// قراءة ما يكتبه المستخدم.
//
// وجدتُ في الجولة أن المستخدم يكتب بيته بسبع صيغٍ مختلفة، وأنه — كما قال صاحب
// المشروع — قد يُدخل «أبياتًا» لا بيتًا. وكان الموقع يعامل الأبيات الثلاثة نصًّا
// واحدًا فلا يجد شيئًا، ويسكت عن السبب.

import { normalize, stripDiacritics, wordCount, isMostlyArabic } from './normalize.js';

const SEPARATORS = /\s(?:\.{3}|…|\*{2,}|-{2,}|\|)\s|\t| {2,}| {4,}/;

/** أهذا نصٌّ عربيٌّ أصلًا؟ يميّز «لا نتيجة» عن «هذا ليس بيتًا». */
export function looksArabic(text) {
  const t = stripDiacritics(text).trim();
  if (!t) return false;
  return isMostlyArabic(t, 0.5) && wordCount(t) >= 2;
}

/**
 * يقسم ما أدخله المستخدم إلى أبياتٍ مستقلّة.
 *
 * السطرُ بيتٌ. فإن كان النصّ سطرًا واحدًا بلا فاصلٍ فهو بيتٌ أو شطر — يُبحث به كما هو.
 * وإن كان سطرين بلا فاصلٍ في أيٍّ منهما فهما شطرا بيتٍ واحد، لا بيتان.
 */
export function splitVerses(text) {
  const lines = String(text ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (!lines.length) return [];
  if (lines.length === 1) return lines;

  // سطران بلا فاصلٍ ظاهر = شطران لبيتٍ واحد
  const anyHasSeparator = lines.some((l) => SEPARATORS.test(l));
  if (lines.length === 2 && !anyHasSeparator) return [`${lines[0]} ... ${lines[1]}`];

  if (anyHasSeparator) return lines;

  // أسطرٌ كثيرةٌ بلا فواصل: تُقرن اثنين اثنين (شطرٌ فشطر)
  const out = [];
  for (let i = 0; i < lines.length; i += 2) {
    out.push(lines[i + 1] ? `${lines[i]} ... ${lines[i + 1]}` : lines[i]);
  }
  return out;
}

/** وصفٌ يُعرض للمستخدم: «ثلاثة أبيات» أو «شطرٌ واحد». */
export function describeInput(text) {
  const verses = splitVerses(text);
  const single = verses.length === 1 && !SEPARATORS.test(verses[0]);
  return { verses, count: verses.length, isHemistich: single, arabic: looksArabic(text) };
}
