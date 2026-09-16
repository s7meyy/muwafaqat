// تقريرُ صحّةِ الاستخراج — عينٌ على الأداة وهي تعمل.
//
// ★ الدرس الذي تكرّر ست مرّات: كلُّ بِنيةِ كتابٍ جديدة تكسر شيئًا بصمت. ★
//   «أعيان العصر» أخرج واحدًا وعشرين بيتًا ولم يُعرف قائلُ واحدٍ منها، و«شرح
//   الفارضي» أخرج أبيات الألفية كلَّها «غير معروف» — ولم يقل شيءٌ من ذلك كلمة.
//   والعملُ يمتدّ ساعاتٍ على آلاف الكتب، فما لم يُقَل وقتَه لم يُعرف أبدًا.
//
// فهذا الملفّ لا يُصلح شيئًا — يُخبر وحده: كم أخرج الكتاب، وكم نُسب، وما أغربُ
// ما خرج منه من الأسماء. والحكم بعدُ لصاحب المكتبة.

import { normalize, stripDiacritics, toArabicDigits } from './normalize.js';
import { countLabel, VERSE, PAGE, PAGES_READ } from './plural.js';

// حدودٌ لا يُنبَّه دونها، كي لا يغرق التقرير في كتبٍ صغيرة
const MIN_VERSES_FOR_FLAG = 20;
const MIN_PAGES_FOR_FLAG = 30;
const LOW_ATTRIBUTION = 0.2;
const LOW_DATING = 0.25;
const ODD_NAMES_SHOWN = 10;

// كلماتٌ لا تقع في اسم شاعرٍ قطّ — وهي التي خرجت فعلًا في التشغيلات الحقيقية:
// «في كلمته» · «كيف ينعم» · «أم حزرة وبنيها» · «يمدح عبد الملك».
const PROSE_WORDS = new Set([
  'في','من','عن','الي','علي','الذي','التي','كيف','ماذا','اين','متي','لماذا','هل',
  'اراد','يريد','قال','قوله','يقول','كان','وهو','وهي','معناه','اي','ثم','حيث',
  'يمدح','يرثي','يصف','انشد','كقول','نحو','مثل','ايضا','قد','لما','وقد','انه',
]);

/**
 * اسمٌ يشبه أسماء الناس؟
 * ليس تحقُّقًا — بل ترشيحٌ لما يستحقّ نظرةَ عين. والخطأ هنا لا يُتلف شيئًا،
 * إنما يُطيل قائمةَ المراجعة أو يُقصرها.
 * ★ ولا يُشترط فيه عددُ الكلمات: ★ «جرير» و«لبيد» و«بشار» أسماءُ شعراء،
 *   والذي يفضح النثرَ الملتقَط وجودُ أداةٍ أو فعلٍ فيه، أو شدّةُ قِصَره («فظه»).
 */
export function looksLikeName(name) {
  const t = stripDiacritics(String(name ?? '')).trim();
  if (!t) return false;
  const words = normalize(t).split(' ').filter(Boolean);
  if (!words.length) return false;
  if (words.some((w) => PROSE_WORDS.has(w))) return false;
  if (words.length === 1 && words[0].length <= 3) return false;
  return true;
}

/**
 * صحّةُ كتابٍ واحد.
 * `verses` أبياتُه المستخرجة كما خرجت: { poet, poetSource, deathYear }
 */
export function bookHealth({ bookId, bookName, pages = 0, verses = [], expectVerses = false } = {}) {
  const total = verses.length;
  const named = verses.filter((v) => v.poet);
  const dated = named.filter((v) => v.deathYear);

  const counts = new Map();
  for (const v of named) counts.set(v.poet, (counts.get(v.poet) ?? 0) + 1);

  // الأسماء النادرة أولى بالنظر: المتكرّر مئةَ مرّةٍ صاحبُ الكتاب غالبًا،
  // والوارد مرّةً واحدةً هو الذي يحتمل أن يكون نثرًا التُقط.
  const oddNames = [...counts.entries()]
    .map(([name, count]) => ({ name, count, suspect: !looksLikeName(name) }))
    .sort((a, b) => (b.suspect - a.suspect) || (a.count - b.count) || a.name.localeCompare(b.name, 'ar'))
    .slice(0, ODD_NAMES_SHOWN);

  const attributedRatio = total ? named.length / total : 0;
  const datedRatio = named.length ? dated.length / named.length : 0;

  const flags = [];
  if (expectVerses && pages >= MIN_PAGES_FOR_FLAG && total === 0) {
    flags.push({ kind: 'no-verses', text: 'كتابُ شعرٍ لم يخرج منه بيتٌ واحد — بِنيتُه غير معروفة للأداة' });
  }
  if (total >= MIN_VERSES_FOR_FLAG && named.length === 0) {
    flags.push({ kind: 'no-attribution', text: 'أخرج أبياتًا ولم يُعرف قائلُ واحدٍ منها — النسبة فيه تُقرأ بغير ما تعرفه الأداة' });
  } else if (total >= MIN_VERSES_FOR_FLAG && attributedRatio < LOW_ATTRIBUTION) {
    flags.push({ kind: 'low-attribution', text: 'أكثرُ أبياتِه بلا قائل' });
  }
  if (named.length >= MIN_VERSES_FOR_FLAG && datedRatio < LOW_DATING) {
    flags.push({ kind: 'low-dating', text: 'أسماءُ شعرائه لا تُطابق التراجم — فأكثرُها بلا عصر' });
  }
  if (oddNames.some((o) => o.suspect)) {
    flags.push({ kind: 'odd-names', text: 'أسماءٌ لا تشبه أسماء الناس خرجت منه' });
  }

  return {
    bookId, bookName, pages, verses: total,
    versesPerPage: pages ? Number((total / pages).toFixed(2)) : 0,
    attributed: named.length,
    attributedRatio: Number(attributedRatio.toFixed(2)),
    datedRatio: Number(datedRatio.toFixed(2)),
    poets: counts.size,
    oddNames,
    flags,
  };
}

/** سطرٌ عربيّ واحدٌ يصف الكتاب — يُطبع أثناء العمل. */
export function healthLine(h) {
  // ★ «٦ صفحة» خطأ. ★ والجمعُ ستُّ صيغٍ لا صيغتان، وهو مطبوعٌ على شاشةِ
  //   صاحب المكتبة ساعاتٍ متّصلة، فلا يُقبل فيه ما لا يُقبل في الموقع.
  const bits = [`${countLabel(h.verses, VERSE)} ${countLabel(h.pages, PAGES_READ)}`];
  if (h.verses) bits.push(`نُسب ${toArabicDigits(String(Math.round(h.attributedRatio * 100)))}٪`);
  const mark = h.flags.length ? ' ★ ' + h.flags.map((f) => f.text).join(' · ') : '';
  return bits.join(' · ') + mark;
}

/** خلاصةُ التشغيل كلِّه: ما يستحقّ المراجعة أولًا. */
export function needsReview(reports) {
  return reports
    .filter((r) => r.flags.length)
    .sort((a, b) => b.verses - a.verses);
}
