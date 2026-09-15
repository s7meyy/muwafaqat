// استخراج نسبة البيت إلى قائله.
//
// ★ القاعدة التي لا تُخرَق: مؤلِّف الكتاب ليس قائل البيت. ★
// صفحةُ «علم المعاني» لعبد العزيز عتيق (ت ١٣٩٦هـ) فيها أبياتٌ للفرزدق وجرير والشريف
// الرضي وشوقي وابن نباتة. فمن نسب البيت إلى مؤلّف الكتاب فقد كذب على تسعة شعراء في صفحة.
//
// والنسبة تُقرأ من النثر المحيط بالبيت، وفيه ثلاثة أحوال:
//   «وقول جرير:»        ← نسبةٌ صريحة
//   «وقوله:»            ← ضميرٌ يعود على من قبله، فيُورَّث
//   «ولآخر في الفخر:»   ← تصريحٌ بالجهل، فيُكتب «غير معروف» ولا يُخمَّن
//
// وما لم يكن له سبب — لا يُنسب. «غير معروف» جوابٌ صادق، والتخمين ليس جوابًا.

import { normalize, stripDiacritics } from './normalize.js';

const SEPARATOR = /\s(?:\.{3}|…|\*{3})\s/;

// ضميرٌ يعود على القائل السابق: «وقوله:» «وله أيضًا:» «ومن قوله:»
const PRONOUN = /^(?:و)?(?:ومن\s+)?(?:قوله|له|قال\s+أيضا|وقال\s+أيضا|من\s+قوله|أيضا)\s*:?\s*$/;

// تصريحٌ بالجهل بالقائل — وهو نسبةٌ صادقة إلى «لا أحد»
const ANONYMOUS = /(?:^|\s)(?:و?ل?آخر|و?لبعضهم|بعضهم|الشاعر|شاعر|بعض\s+الشعراء|بعض\s+العرب|أعرابي|و?لغيره)(?:\s|$|:)/;

// أدوات النسبة. آخرُ ما يظهر منها في السطر هو الذي يعوَّل عليه،
// لأن «٦ - الحث على السعي والجد: كقول شوقي:» فيها نقطتان، والنسبة عند الثانية.
const CUES = /(?:^|[\s:،؛\-])(?:(?:ك|ف|و)?(?:قول|قال|أنشد|ينشد|يقول)(?:ها|هما|هم|نا|ني|ه)?)\s+/g;

// لام النسبة ملتصقةٌ بالاسم بلا فراغ: «وللشريف الرضي:» «ولآخر:» «وللمتنبي:».
// وهذه أخطر حالة: إغفالها يُورِّث البيتَ قائلًا سابقًا — فتُنسب أبيات الشريف الرضي إلى جرير.
const LAM_CUE = /(?:^|[\s:،؛\-])(و?لل?[\u0621-\u064A]{2,})/g;

// كلماتٌ تبدأ بلامٍ وليست نسبةً إلى أحد
const LAM_FALSE = new Set([
  'لكن','لكنه','لما','لان','لانه','لذلك','لهذا','لئن','لعل','لولا','لقد','لو','له','لها','لهم',
  'ليس','لدى','لدن','لئلا','لاسيما','للا','لم','لن','لئلّا','للناس','للغاية','لغة','لغير',
]);

// ما يقطع اسم القائل: صفةٌ أو ظرفٌ لا جزءٌ من الاسم
// ما يقطع اسم القائل: صفةٌ أو ظرفٌ أو دعاءٌ أو تشكيكٌ — لا جزءٌ من الاسم.
// وصفحاتُ المنتديات تُكثر من «والله أعلم» و«على ما أظن» بعد النسبة.
const NAME_STOP = /(?:^|\s)(?:في|من|عن|حين|لما|يصف|يمدح|يرثي|وهو|رحمه|رضي|قوله|أيضا|وقد|إذ|والله|أعلم|اعلم|تعالى|عليه|وقيل|ولعله|أظن|اظن|على)(?:\s|$)/;

const MAX_NAME_WORDS = 6;

/** «للشريف» ← «الشريف» · «لآخر» ← «آخر» · «وللمتنبي» ← «المتنبي» */
function undoLamPrefix(word) {
  if (/^لل/.test(word)) return 'ال' + word.slice(2);
  if (/^ل/.test(word)) return word.slice(1);
  return word;
}

function cleanName(raw) {
  let name = stripDiacritics(raw).trim();
  name = name.replace(/^[\s:،؛\-]+/, '').replace(/[\s:،؛\.]+$/, '');
  const stop = NAME_STOP.exec(' ' + name);
  if (stop && stop.index > 0) name = name.slice(0, stop.index).trim();
  const words = name.split(/\s+/).filter(Boolean).slice(0, MAX_NAME_WORDS);
  name = words.join(' ').replace(/[\s:،؛\.]+$/, '');
  if (normalize(name).length < 3) return null;
  return name;
}

/**
 * يقرأ سطرًا نثريًّا: هل هو نسبة؟ ولمن؟
 * `requireColon` يُشترط في السطر المستقلّ (فالنسبة تنتهي بنقطتين دائمًا)، ويُرفع حين
 * تكون النسبة في صدر سطرٍ فيه البيت نفسه.
 */
export function readAttributionLine(line, { requireColon = false } = {}) {
  const text = stripDiacritics(String(line ?? '')).trim()
    .replace(/^[٠-٩0-9]+\s*[-–—]\s*/, ''); // ترقيم المؤلّف «٦ - »
  if (!text) return null;

  if (PRONOUN.test(text)) return { kind: 'inherit' };

  const anonymous = ANONYMOUS.test(' ' + text);

  // (أ) أداةٌ فعلية: «كقول شوقي:» — وآخر ما يظهر منها هو المعتبَر
  let last = null;
  CUES.lastIndex = 0;
  let m;
  while ((m = CUES.exec(text)) !== null) last = m;
  if (last) {
    const after = text.slice(last.index + last[0].length);
    if (anonymous || ANONYMOUS.test(' ' + after)) return { kind: 'anonymous' };
    const name = cleanName(after);
    if (name) return { kind: 'named', name };
  }

  // (ب) لامٌ ملتصقة: «وللشريف الرضي:» — ولا تُقبل إلا في سطرٍ ينتهي بنقطتين
  if (!requireColon || /:\s*$/.test(text)) {
    let lamLast = null;
    LAM_CUE.lastIndex = 0;
    while ((m = LAM_CUE.exec(text)) !== null) {
      const bare = m[1].replace(/^و/, '');
      if (LAM_FALSE.has(normalize(bare))) continue;
      lamLast = m;
    }
    if (lamLast) {
      if (anonymous) return { kind: 'anonymous' };
      const rest = text.slice(lamLast.index + lamLast[0].length - lamLast[1].length);
      const words = rest.split(/\s+/).filter(Boolean);
      words[0] = undoLamPrefix(words[0].replace(/^و/, ''));
      const name = cleanName(words.join(' '));
      if (name) return { kind: 'named', name };
    }
  }

  if (anonymous) return { kind: 'anonymous' };
  return null;
}

/** «شرح ديوان المتنبي للواحدي» ← المتنبي. الديوان ينسب نفسه. */
export function poetFromBookName(bookName) {
  const t = stripDiacritics(String(bookName ?? ''));
  const m = /(?:^|\s)(?:شرح\s+)?ديوان\s+(.+?)(?:\s+ل[ء-ي]|\s*[-–—]|$)/.exec(t);
  if (!m) return null;
  return cleanName(m[1]);
}

/**
 * قائلُ القصيدة في صفحة ويب.
 * عناوين مواقع الشعر تحمل النسبة غالبًا: «دع الأيام — الشافعي» أو «قصائد المتنبي».
 * وما لم يُصرَّح به في العنوان أو أوّل الصفحة: لا يُخمَّن، ويبقى «غير معروف».
 */
export function poetFromWebPage({ title = '', text = '', url = '' } = {}) {
  const t = stripDiacritics(String(title)).replace(/\s+/g, ' ').trim();

  const patterns = [
    // اللام تُلتقط مع الاسم ثم تُحلّ بـundoLamPrefix — «للمتنبي» ← «المتنبي»
    /(?:قصيدة|أبيات|قصائد|ديوان|شعر)\s+(?:.*?\s)?(ل[\u0621-\u064A][^|\-–—:]{2,40})/,
    /(?:للشاعر|بقلم|الشاعر)\s*:?\s*([\u0621-\u064A][^|\-–—:]{2,40})/,
    /^(?:.*?)[|\-–—]\s*([\u0621-\u064A][^|\-–—]{2,40})\s*$/,   // «القصيدة — الشاعر»
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (!m) continue;
    const words = m[1].trim().split(/\s+/);
    if (/^لل?[\u0621-\u064A]/.test(words[0])) words[0] = undoLamPrefix(words[0]);
    const name = cleanName(words.join(' '));
    // نستبعد أسماء المواقع نفسها
    if (name && !/الديوان|أدب|بوابة|موسوعة|موقع|منتدى|شبكة|مدونة/.test(name)) {
      return { poet: name, poetSource: 'title' };
    }
  }

  // أوّل أسطر الصفحة قد تحمل نسبةً صريحة
  for (const line of String(text).split('\n').slice(0, 12)) {
    const read = readAttributionLine(line, { requireColon: false });
    if (read?.kind === 'named') return { poet: read.name, poetSource: 'page' };
    if (read?.kind === 'anonymous') return { poet: null, poetSource: 'anonymous' };
  }

  return { poet: null, poetSource: null };
}

/**
 * يمرّ على صفحةٍ سطرًا سطرًا فيُلحق بكل بيتٍ قائلَه.
 * النسبة تسري على الأبيات المتتالية حتى تَرِد نسبةٌ جديدة — لأن «وللشريف الرضي:»
 * تخدم ثلاثة أبياتٍ بعدها لا بيتًا واحدًا.
 *
 * يُرجع لكل بيت: { poet, poetSource } حيث poetSource ∈ line | inherit | book | null
 * وpoet = null معناه «غير معروف»، ويُعرض هكذا صراحةً.
 */
export function attributeVerses(pageText, verses, { bookName } = {}) {
  const lines = String(pageText ?? '').replace(/\r/g, '').split('\n');
  const byLine = new Map();
  for (const v of verses) {
    if (!byLine.has(v.lineIndex)) byLine.set(v.lineIndex, []);
    byLine.get(v.lineIndex).push(v);
  }

  const bookPoet = poetFromBookName(bookName);
  let current = null;        // { name } أو null للمجهول
  let currentSource = null;
  const result = [];

  lines.forEach((line, i) => {
    const versesHere = byLine.get(i);
    const hasVerse = Boolean(versesHere);

    // السطر الذي فيه بيتٌ قد يحمل النسبة في نثره الذي يسبق البيت — وما بعد ذلك شِعرٌ لا نثر.
    // فلا نقرأ «ما قبل الفاصل» (فذاك الشطر الأول نفسه)، بل «ما قبل البيت» وحده.
    // وإلا قرأنا لام «لمن تعبا» لامَ نسبة، فحرمنا البيت إرثه من شوقي.
    const prose = hasVerse ? line.slice(0, versesHere[0].column) : line;
    const read = prose.trim() ? readAttributionLine(prose, { requireColon: true }) : null;

    if (read) {
      if (read.kind === 'named') { current = read.name; currentSource = 'line'; }
      else if (read.kind === 'anonymous') { current = null; currentSource = 'anonymous'; }
      else if (read.kind === 'inherit' && current) { currentSource = 'inherit'; }
    }

    if (hasVerse) {
      for (const v of versesHere) {
        result.push({
          ...v,
          poet: current ?? bookPoet ?? null,
          poetSource: current ? currentSource : (bookPoet ? 'book' : null),
        });
      }
    }
  });

  return result;
}
