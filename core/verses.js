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
        pairing: 'separator',
      });
    }
  });

  return out;
}

/**
 * القافية: الرويُّ ووصلُه — ★ حرفان لا حرف. ★
 *
 * الحرف الواحد ضعيفٌ جدًّا: ستةُ أسطرِ نثرٍ تتّفق أواخرها صدفةً («يشبهه»/«جنسه»
 * كلاهما ينتهي بهاء)، فيُقرأ النثر شعرًا. والحرفان يفصلان: «هه» ليست «سه».
 * وهما في الشعر الحقيقيّ متّفقان: «القضاء/بقاء/الوفاء» ← «اء»،
 * و«غلابا/ركابا» ← «با»، و«صبر/الخبر» ← «بر».
 *
 * ★ ولا يُطبَّع النصّ هنا ★ — التطبيع يحذف الهمزة، وقافيةُ «القضاء» هي الهمزة نفسها.
 */
export function rhymeOf(text) {
  const t = stripDiacritics(text)
    .replace(/[^\u0621-\u064A]+$/, '')
    .replace(/ة$/, 'ه');            // هاء الوصل تُكتب بالوجهين
  if (!t) return null;
  return t.length >= 2 ? t.slice(-2) : t;
}

/**
 * اقتناصُ الأبيات من صفحات الشبكة.
 *
 * مواقعُ الشعر لا تكتب «...» بين الشطرين — تضع كلَّ شطرٍ في عنصرٍ مستقل،
 * فيصير الشطران سطرين متجاورين. فنقرن السطرين المتجاورين بشرطين:
 * توازنُهما في عدد الكلمات، ووقوعُهما في ★ تتابعٍ ★ من أمثالهما —
 * لأن القصيدة أبياتٌ متتالية، والنثرَ لا يجيء أسطرًا قصيرةً متوازنةً متتابعة.
 *
 * ★ والفاصلُ الحاسم بين الشعر والنثر: القافية. ★ أعجازُ أبيات القصيدة تتّفق
 * في حرف رويّها، وأسطرُ النثر لا تتّفق. فلا يُقبل زوجٌ إلا وافق رويُّه رويَّ
 * زوجٍ آخر في تتابعه — وبهذا لا يُعرض نثرٌ على أنه شعر، وذاك كذبٌ وإن مرّ بالبوابة.
 *
 * وما جاء بهذا الطريق يُوسم `pairing: 'lines'` تمييزًا له عمّا جاء بالفاصل
 * الصريح، فيؤخَّر عنه في الترتيب — فهو أضعفُ دلالةً وإن مرّ بالبوابة.
 */
export function extractVersesFromLines(pageText, { minRun = 2 } = {}) {
  const lines = String(pageText ?? '').replace(/\r/g, '').split('\n');
  const isHemistich = (line) => {
    const t = line.trim();
    if (!t || SEPARATOR.test(t)) return false;
    const w = wordCount(t);
    return w >= MIN_WORDS && w <= 10 && isMostlyArabic(t) && !NOT_VERSE.test(normalize(t));
  };

  // نجمع مواضع الأسطر الصالحة المتتابعة
  const runs = [];
  let run = [];
  lines.forEach((line, i) => {
    if (isHemistich(line)) run.push(i);
    else { if (run.length) runs.push(run); run = []; }
  });
  if (run.length) runs.push(run);

  /** يقرن أسطر التتابع ابتداءً من موضعٍ ما، ويقيسه بعدد ما اتّفق من قوافيه. */
  const pairFrom = (r, offset) => {
    const pairs = [];
    for (let k = offset; k + 1 < r.length; k += 2) {
      const sadr = lines[r[k]].trim();
      const ajz = lines[r[k + 1]].trim();
      if (!acceptable(sadr, ajz)) continue;
      pairs.push({ sadr, ajz, lineIndex: r[k], rhyme: rhymeOf(ajz) });
    }
    const counts = new Map();
    for (const p of pairs) if (p.rhyme) counts.set(p.rhyme, (counts.get(p.rhyme) ?? 0) + 1);
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
    return { pairs, dominant };
  };

  const out = [];
  for (const r of runs) {
    if (r.length < minRun * 2) continue;

    // ★ سطرٌ دخيلٌ قبل القصيدة يُزيح اقترانَ الأشطر كلها فتختلف القوافي —
    //   وهذا يقع كثيرًا («السلام عليكم، وجدت هذي الأبيات…» قبل بيتٍ في منتدى).
    //   فنجرّب الاقتران من الموضعين ونحتكم إلى القافية: أكثرُهما اتّفاقًا هو الصواب.
    const a = pairFrom(r, 0);
    const b = pairFrom(r, 1);
    const best = (b.dominant?.[1] ?? 0) > (a.dominant?.[1] ?? 0) ? b : a;
    const { pairs, dominant } = best;

    if (pairs.length < 2) continue;
    if (!dominant || dominant[1] < 2) continue;   // لا قافيةَ مشتركة ⇒ ليس شعرًا

    for (const p of pairs) {
      if (p.rhyme !== dominant[0]) continue;
      out.push({
        sadr: p.sadr, ajz: p.ajz,
        text: `${p.sadr} ... ${p.ajz}`,
        plain: `${stripDiacritics(p.sadr).trim()} ... ${stripDiacritics(p.ajz).trim()}`,
        lineIndex: p.lineIndex,
        column: 0,
        pairing: 'lines',
        rhyme: p.rhyme,
      });
    }
  }
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
