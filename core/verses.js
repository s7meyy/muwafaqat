// اقتناص الأبيات من نصّ صفحة.
//
// المبدأ المستخرَج من الشاملة نفسها: الشطران يفصل بينهما «...» أو «…».
//   «وما نيل المطالب بالتمني ... ولكن تؤخذ الدنيا غلابا»
// وهذا ثابتٌ عبر الكتب — في البلاغة والعروض والأدب والمعاجم.
//
// والعلّة أن البيت قد يرد داخل نثر، فالسطر يحمل كلام المؤلّف والبيت معًا:
//   «٦ - الحث على السعي والجد: كقول شوقي: وما نيل ... ولكن تؤخذ الدنيا غلابا وما استعصى…»
// فنقتصّ حدَّي البيت بعلامتين: علامات النثر قبله، و★ توازن الشطرين ★ — فالشطران
// في العربية متقاربان في عدد الكلمات، وهذا أقوى فاصلٍ بين البيت وما التصق به.

import { normalize, wordCount, isMostlyArabic, stripDiacritics } from './normalize.js';

const SEPARATOR = /\s(?:\.{3}|…|\*{3}|؟؟)\s/;
const SEPARATOR_G = /\s(?:\.{3}|…|\*{3})\s/g;

// ما ينتهي عنده صدرُ البيت من جهة اليسار (أي: ما يسبق البيت من نثر)
const PROSE_BOUNDARY = /[:：«»"”“\)\(\]\[]|(?:^|\s)(?:قال|قوله|كقول|وقول|يقول|أنشد|أنشدنا|أنشدني|وأنشد|فقال|ومنه|ومنها|كقوله|نحو|مثل)(?:\s|$)/g;

// ما لا يكون في بيتٍ شعريّ أصلًا
const NOT_VERSE = /(?:رحمه الله|صلى الله عليه|رضي الله عن|انظر|ينظر|تحقيق|الناشر|الطبعة|ص\s*\d|ج\s*\d|\d{3,})/;

const MIN_WORDS = 2;
const MAX_WORDS = 14;
const BALANCE_MIN = 0.45; // نسبة كلمات الشطر الأقصر إلى الأطول
const MAX_SCAN = 220;     // أقصى ما نرجع إليه أو نمتدّ بحثًا عن حدّ

/**
 * اقتصاص صدر البيت.
 * لا نأخذ أوّل حدٍّ نصادفه — بل نجرّب كل الحدود ونختار ما يجعل الشطرين أقربَ توازنًا،
 * لأن «وقور: فلا الألحان تأسر عزمتي» نقطتاها من المحقّق، و«وقور» من البيت.
 * والقطع عند أول حدٍّ يُسقط كلمةً من شعر الشريف الرضي — وذاك نقصٌ في النقل لا يُحتمل.
 */
function sadrCandidates(before) {
  const tail = before.slice(-MAX_SCAN);
  const cuts = [0];
  PROSE_BOUNDARY.lastIndex = 0;
  let m;
  while ((m = PROSE_BOUNDARY.exec(tail)) !== null) cuts.push(m.index + m[0].length);
  return cuts.map((c) => tail.slice(c).trim()).filter(Boolean);
}

/** اقتصاص عجز البيت: نقف عند أول علامة نثر، ثم نقصّه إلى ما يوازن الصدر. */
function cutAjz(after, sadrWords) {
  const head = after.slice(0, MAX_SCAN);
  PROSE_BOUNDARY.lastIndex = 0;
  const m = PROSE_BOUNDARY.exec(head);
  let candidate = (m ? head.slice(0, m.index) : head).trim();

  // التوازن: العجز لا يزيد كثيرًا على الصدر. ما زاد فهو نثرٌ لصق بالبيت.
  const words = candidate.split(/\s+/).filter(Boolean);
  const cap = Math.max(MIN_WORDS, Math.round(sadrWords * 1.6));
  if (words.length > cap) candidate = words.slice(0, cap).join(' ');
  return candidate.trim();
}

/** يختار من مرشَّحي الصدر ما يوازن العجز، ويُرجع الزوج أو null. */
function bestPair(before, after) {
  const candidates = sadrCandidates(before);
  if (!candidates.length) return null;
  const longest = candidates[0];
  const roughAjz = cutAjz(after, Math.min(MAX_WORDS, wordCount(longest) || MAX_WORDS));
  const target = wordCount(roughAjz);

  let best = null;
  for (const sadr of candidates) {
    const ajz = cutAjz(after, wordCount(sadr));
    if (!acceptable(sadr, ajz)) continue;
    const a = wordCount(sadr);
    const b = wordCount(ajz);
    const score = Math.abs(a - (target || b)) + Math.abs(a - b);
    if (!best || score < best.score) best = { sadr, ajz, score };
  }
  return best;
}

function acceptable(sadr, ajz) {
  const a = wordCount(sadr);
  const b = wordCount(ajz);
  if (!a || !b) return false;
  if (a < MIN_WORDS || b < MIN_WORDS) return false;
  if (a > MAX_WORDS || b > MAX_WORDS) return false;
  if (Math.min(a, b) / Math.max(a, b) < BALANCE_MIN) return false;
  if (!isMostlyArabic(sadr) || !isMostlyArabic(ajz)) return false;
  if (NOT_VERSE.test(normalize(sadr)) || NOT_VERSE.test(normalize(ajz))) return false;
  return true;
}

/**
 * يستخرج أبيات نصٍّ ما.
 * يُرجع [{ sadr, ajz, text, offset, lineIndex }] — النصّ كما ورد (بشكله)، لا مطبَّعًا.
 * `offset` موضع البيت في النصّ الأصل، ويلزم لاستخراج النسبة ممّا قبله.
 */
export function extractVerses(pageText) {
  const text = String(pageText ?? '').replace(/\r/g, '');
  if (!text.trim()) return [];

  const out = [];
  const lines = text.split('\n');
  let cursor = 0;

  lines.forEach((line, lineIndex) => {
    const lineStart = cursor;
    cursor += line.length + 1;
    if (!SEPARATOR.test(line)) return;

    SEPARATOR_G.lastIndex = 0;
    let m;
    while ((m = SEPARATOR_G.exec(line)) !== null) {
      const before = line.slice(0, m.index);
      const after = line.slice(m.index + m[0].length);

      const pair = bestPair(before, after);
      if (!pair) continue;
      const { sadr, ajz } = pair;

      out.push({
        sadr: sadr.trim(),
        ajz: ajz.trim(),
        text: `${sadr.trim()} ... ${ajz.trim()}`,
        plain: `${stripDiacritics(sadr).trim()} ... ${stripDiacritics(ajz).trim()}`,
        offset: lineStart + Math.max(0, m.index - sadr.length),
        column: Math.max(0, m.index - sadr.length), // موضع البيت في سطره — ما قبله نثرٌ لا شعر
        lineIndex,
      });
    }
  });

  return out;
}

/** أبياتٌ متتاليةٌ في أسطرٍ متجاورة = مقطوعةٌ واحدة. يفيد في عرض السياق. */
export function groupIntoPieces(verses) {
  const pieces = [];
  let current = null;
  for (const v of verses) {
    if (current && v.lineIndex <= current.lastLine + 1) {
      current.verses.push(v);
      current.lastLine = v.lineIndex;
    } else {
      current = { verses: [v], firstLine: v.lineIndex, lastLine: v.lineIndex };
      pieces.push(current);
    }
  }
  return pieces;
}
