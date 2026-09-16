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
// ما ينتهي عنده صدرُ البيت من جهة اليسار (أي: ما يسبق البيت من نثر).
// ★ والشرطة منها: ★ المعاجم تفصل أمثلتها بها داخل الاقتباس الواحد —
// «الحريَّة مطلبُ الناس جميعهم- وما نيل المطالب بالتمنِّي ... ولكن تؤخذ الدنيا»
// فكان المثال النثريّ يلتصق بصدر البيت ويُعرض كأنه منه.
// وهي حدٌّ ★ مرشَّح ★ لا قاطع: «تعلل - وهي ساغبة - بنيها» شرطتاها من البيت،
// والموازنة بين الشطرين هي التي تحتكم (bestPair)، فتردّ القطع الذي يُخلّ بها.
const PROSE_BOUNDARY = /[:：«»"”“\)\(\]\[]|(?<=[\u0621-\u064A])\s*[-–—]\s*|(?:^|\s)(?:قال|قوله|كقول|وقول|يقول|أنشد|أنشدنا|أنشدني|وأنشد|فقال|ومنه|ومنها|كقوله|نحو|مثل)(?:\s|$)/g;

// ما لا يكون في بيتٍ شعريّ أصلًا
const NOT_VERSE = /(?:رحمه الله|صلى الله عليه|رضي الله عن|انظر|ينظر|تحقيق|الناشر|الطبعة|ص\s*\d|ج\s*\d|\d{3,})/;

// ترقيم المحقّق للأبيات. ★ وليس كلُّ ديوانٍ يرقّم بالشرطة: ★
// «ديوان امرئ القيس» يكتب «٣١ - فقالتْ»، و«ديوان جرير» يكتب «١ أتصحو» بلا شرطة.
// واشتراطُ الشرطة كان يُبقي الرقم داخل نصّ البيت، فيمنع دمجَ روايتين للبيت
// الواحد («ألستم خير من ركب المطايا» و«١٥ ألستم خير…» يُعدّان بيتين).
const NUMBER_PREFIX = /^\s*[\u0660-\u0669\u06F0-\u06F90-9]{1,3}\s*(?:[-–—.)]\s*|\s)/;

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
  // ★ ترقيم المحقّق للأبيات جزءٌ من السطر لا من البيت. ★
  //   «٣١ - فقالتْ: يَمينَ الله…» بيتُه يبدأ بـ«فقالت»، وإبقاءُ الرقم يُفسد
  //   المطابقة مع رواية الكتاب الآخر، ويُظهر في البطاقة ما ليس من الشعر.
  const tail = before.slice(-MAX_SCAN).replace(NUMBER_PREFIX, '');
  const cuts = [0];
  PROSE_BOUNDARY.lastIndex = 0;
  let m;
  while ((m = PROSE_BOUNDARY.exec(tail)) !== null) cuts.push(m.index + m[0].length);
  return cuts.map((c) => tail.slice(c).trim()).filter(Boolean);
}

/**
 * اقتصاص عجز البيت.
 * ★ ولا يُؤخذ بأول حدٍّ يُصادَف ★ — كما لا يُؤخذ به في الصدر: شروح الألفية
 * تضع النقطتين داخل الشطر نفسه:
 *   «٩ - واحده: كلمة والقول: عم ... وكلمة: بها كلام قد يؤم»
 * فالوقوف عند نقطتي «وكلمة:» يجعل العجز كلمةً واحدة، فيُردّ البيت كلُّه ويسقط
 * من الفهرس. فنجمع حدود العجز مرشَّحاتٍ ونحتكم إلى موازنة الشطرين.
 */
function ajzCandidates(after) {
  const head = after.slice(0, MAX_SCAN);
  const cuts = [];
  PROSE_BOUNDARY.lastIndex = 0;
  let m;
  while ((m = PROSE_BOUNDARY.exec(head)) !== null) cuts.push(m.index);
  cuts.push(head.length);
  const out = [];
  for (const c of cuts) {
    const t = head.slice(0, c).trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** يقصّ المرشَّح إلى ما لا يزيد كثيرًا على الصدر — فما زاد نثرٌ لصق بالبيت. */
function capAjz(candidate, sadrWords) {
  const words = candidate.split(/\s+/).filter(Boolean);
  const cap = Math.max(MIN_WORDS, Math.round(sadrWords * 1.6));
  return (words.length > cap ? words.slice(0, cap).join(' ') : candidate).trim();
}

function cutAjz(after, sadrWords) {
  const list = ajzCandidates(after);
  return list.length ? capAjz(list[0], sadrWords) : '';
}

/** يختار من مرشَّحي الشطرين ما يوازن بعضه بعضًا، ويُرجع الزوج أو null. */
function bestPair(before, after) {
  const candidates = sadrCandidates(before);
  if (!candidates.length) return null;
  const ajzList = ajzCandidates(after);
  if (!ajzList.length) return null;
  const longest = candidates[0];
  const roughAjz = capAjz(ajzList[0], Math.min(MAX_WORDS, wordCount(longest) || MAX_WORDS));
  const target = wordCount(roughAjz);

  let best = null;
  for (const sadr of candidates) {
    const a = wordCount(sadr);
    for (const raw of ajzList) {
      const ajz = capAjz(raw, a);
      if (!acceptable(sadr, ajz)) continue;
      const b = wordCount(ajz);
      const score = Math.abs(a - (target || b)) + Math.abs(a - b);
      if (!best || score < best.score) best = { sadr, ajz, score };
    }
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
      const rawAfter = line.slice(m.index + m[0].length);

      // ★ رقمُ حاشية المحقّق يُقتطع قبل الموازنة. ★
      //   «تَدِفُّ دَفيفَ الرَّائحِ المُتَمَطِّرِ ★(٣)★» — كان الرقم يُحسب كلمةً
      //   من العجز فيرجّح قطعًا خاطئًا، ثم يبقى شطرُه في النصّ: «المُتَمَطِّرِ (٣».
      //   وهو في الحقيقة مفتاحُ الشرح: به تُعرف حاشيةُ هذا البيت من حواشي الصفحة.
      const footMatch = /\s*[\(\[]([\u0660-\u0669\u06F0-\u06F90-9]{1,3})[\)\]]\s*$/.exec(rawAfter);
      const after = footMatch ? rawAfter.slice(0, footMatch.index) : rawAfter;
      const footMark = footMatch?.[1] ?? null;

      const pair = bestPair(before, after);
      if (!pair) continue;
      const { sadr, ajz } = pair;

      // ★ الأقواس التي تحتضن البيت ليست منه. ★
      //   كتب الشواهد تضع الشاهد بين قوسين: «(وهل يعمن من كان … أحوال)»
      //   وقوسُ الفتح كان يبقى في النصّ فيُعرض ويُفسد المطابقة.
      // ★ ولا يُقصّ قوسٌ له قرينٌ في الشطر نفسه. ★
      //   «وقُولا هوَ المرءُ الذي لا [خَليلَهُ] ... أضاعَ» — كان القصُّ يبتلع
      //   المعقوفةَ الخاتمة (لأنها في آخر الشطر) ويُبقي الفاتحة، فيُعرض البيت
      //   مكسورًا: «لا [خَليلَهُ ... أضاعَ». والمعقوفتان هنا من المطبوع:
      //   روايةٌ اختارها المحقّق، فلا تُمحى ولا تُبتر.
      const trim = (t) => {
        let out = String(t);
        out = out.replace(/^[\s(\[«"“،]+/, (m) => {
          // ما كان له قرينٌ في بقيّة الشطر يُترك كما هو
          const rest = out.slice(m.length);
          return [...m].filter((c) => {
            if (c === '[') return rest.includes(']');
            if (c === '(') return rest.includes(')');
            return false;
          }).join('');
        });
        out = out.replace(/[\s)\]»"”،.]+$/, (m, at) => {
          const head = out.slice(0, at);
          return [...m].filter((c) => {
            if (c === ']') return head.includes('[');
            if (c === ')') return head.includes('(');
            return false;
          }).join('');
        });
        return out.trim();
      };

      // ★ المعقوفتان تُطبقان على البيت كلِّه حكمٌ لا زينة: ★ المحقّق يقول بهما
      //   إن البيت زائدٌ أو مشكوكٌ في نسبته («٢١ - [فَتى لا تَراهُ النّابُ …]»
      //   في ديوان ليلى الأخيلية). وقصُّهما صامتًا إخفاءُ حكمٍ علميّ، لا تنظيفُ نصّ.
      const doubted = /^\s*(?:[\u0660-\u0669\u06F0-\u06F90-9]{1,3}\s*[-–—.)]?\s*)?\[/.test(before)
        && /\]\s*$/.test(after.trim());

      const tadweer = detectTadweer(trim(sadr), trim(ajz));
      const cleanSadr = trim(sadr);
      const cleanAjz = trim(ajz);
      out.push({
        doubted,
        footnote: footMark,
        sadr: cleanSadr,
        ajz: cleanAjz,
        text: `${cleanSadr} ... ${cleanAjz}`,
        // نصٌّ موصولٌ للمطابقة وحدها — والمعروض يبقى كما طُبع
        joined: tadweer ? `${tadweer.joinedSadr} ... ${tadweer.joinedAjz}` : null,
        mudawwar: Boolean(tadweer),
        splitWord: tadweer?.word ?? null,
        plain: `${stripDiacritics(cleanSadr).trim()} ... ${stripDiacritics(cleanAjz).trim()}`,
        offset: lineStart + Math.max(0, m.index - sadr.length),
        column: Math.max(0, m.index - sadr.length), // موضع البيت في سطره — ما قبله نثرٌ لا شعر
        lineIndex,
        pairing: 'separator',
        // ★ ترقيم المحقّق علامةٌ صادقة: في الديوان المحقَّق تُرقَّم أبياتُ صاحبه،
        //   والشواهدُ المنقولة في الشرح لا تُرقَّم. وبه نفرّق بين شعره وشعر غيره.
        numbered: NUMBER_PREFIX.test(line.slice(0, m.index).slice(-MAX_SCAN)),
      });
    }
  });

  return out;
}

// كلماتٌ عربيةٌ قائمةٌ بنفسها طولها حرفان — فلا تُعدّ كسرًا لكلمة.
const SHORT_WORDS = new Set([
  'ما', 'لا', 'من', 'في', 'عن', 'يا', 'هل', 'بل', 'لم', 'لن', 'قد', 'ثم', 'أو', 'او',
  'إن', 'ان', 'أن', 'كم', 'مذ', 'إذ', 'اذ', 'لو', 'كي', 'له', 'بك', 'بي', 'به', 'هي', 'هو',
]);

/**
 * ★ البيت المدوَّر ★ — الكلمة موزَّعةٌ على الشطرين.
 *
 * «ودعوا اليأس والتعلل بالوه ... م، ولا تركنوا إلى الأحلام»
 * ليس خطأ صفٍّ في المجلة: هو التدوير، والعروض يقتضيه. لكنّ نقلَه هكذا يُري
 * القارئ نصًّا مكسورًا، ويمنع مطابقة البيت برواية كتابٍ آخر كتبه موصولًا.
 *
 * فنكشفه: عجزٌ يبدأ بحرفٍ أو حرفين ليسا كلمةً قائمة ⇒ الكلمة مقطوعة.
 * ونُبقي الشطرين كما هما (فذاك هو المطبوع)، ونُخرج `joined` موصولةً للمطابقة،
 * ونسم البيت `mudawwar` ليُقال للقارئ ما هو، لا أن يُظنّ نصًّا معطوبًا.
 */
export function detectTadweer(sadr, ajz) {
  const head = stripDiacritics(ajz).trim().split(/\s+/)[0] ?? '';
  const bare = head.replace(/[^\u0621-\u064A]/g, '');
  if (!bare || bare.length > 2 || SHORT_WORDS.has(normalize(bare))) return null;

  const tail = stripDiacritics(sadr).trim().split(/\s+/).pop() ?? '';
  if (normalize(tail).length < 2) return null;     // الصدر نفسه مقطوع؟ نتركه

  const rest = ajz.trim().slice(head.length).replace(/^[\s،,.]+/, '');
  if (!rest) return null;
  return {
    word: `${tail}${bare}`,
    joinedSadr: sadr.trim().replace(/\S+$/, `${tail}${bare}`),
    joinedAjz: rest,
  };
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
