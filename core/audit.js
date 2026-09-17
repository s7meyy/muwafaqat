// التدقيقُ بالعيّنة — أن يقيس الموقعُ خطأه ويَنشره.
//
// ★ مشروعٌ شعارُه الصدقُ في النقل ينبغي أن يُعلن نسبةَ خطئه، لا أن ينفيه. ★
// وكلُّ ما قيل في هذه الوثائق من «لا يُعرض بيتٌ إلا وُجد نصُّه في مصدر» دعوى،
// ما لم تُقَس. فهذا الملفّ يقيسها: يُعاد فتحُ صفحةِ البيت في الشاملة، ويُطلب
// نصُّه فيها حرفًا بحرف، وتُطلب نسبتُه في نثرها.
//
// والحكمُ صارم: ما لم يوجد نصُّه ★ عُدَّ خطأً ★ ولو كان الفارق حرفًا — فالباحث
// ينقل عنّا إلى رسالته، والحرفُ عنده حكم.

import { normalize, stripDiacritics, poetKey } from './normalize.js';

/** نصُّ الصفحة مطبَّعًا مرّةً واحدة — فالمقارنة تتكرّر عليه. */
export function preparePage(pageText) {
  return normalize(String(pageText ?? '').replace(/\s+/g, ' '));
}

/**
 * تدقيقُ بيتٍ واحدٍ في صفحته.
 * يُرجع { verbatim, poet, reason } — و`poet` ∈ found | absent | none (لا نسبة له)
 */
export function auditVerse(verse, pageText, prevText = null) {
  const page = preparePage(pageText);
  // ★ النسبةُ الموروثةُ تُدقَّق في صفحتها التي جاءت منها ★ — «شرح الحماسة»
  //   يُصدِّر «وقال زفر بن الحرث» في آخر صفحةٍ ثم يسوق شعره في التالية، فاسمُه
  //   ليس في صفحة البيت أصلًا. فقياسُها على صفحة البيت وحدها يُدين قاعدةً
  //   صحيحة، وإهمالُها يُجمّل الرقم. فتُطلب في الصفحة السابقة، وإن لم تكن
  //   عندنا قيل «لم تُدقَّق» وأُعلن عددُها.
  const prev = prevText == null ? null : preparePage(prevText);
  if (!page) return { verbatim: false, poet: 'none', reason: 'الصفحة فارغة أو تعذّر جلبها' };

  // ★ المقارنة على الشطرين لا على النصّ الموصول: ★ الكتب تفصل بينهما بـ«...»
  //   وقد تفصل بفراغاتٍ أو سطر، فالفاصلُ نفسُه ليس جزءًا من النصّ المنقول.
  const [sadr, ajz] = String(verse.text ?? '').split(/\s*(?:\.{3}|…)\s*/);
  const parts = [sadr, ajz].filter((p) => p && p.trim()).map((p) => normalize(p));
  if (!parts.length) return { verbatim: false, poet: 'none', reason: 'لا نصّ في السجلّ' };

  const missing = parts.filter((p) => !page.includes(p));
  const verbatim = missing.length === 0;

  // ★ ولا يُطلب اسمُ القائل في الصفحة إلا إن ادّعينا أنّنا قرأناه منها. ★
  //   أوّلُ تشغيلٍ للتدقيق أعطى «صفر بالمئة» في النسبة — والعلّةُ في المقياس
  //   لا في الفهرس: أبياتُ الديوان منسوبةٌ إلى صاحبه من ★ عنوان الكتاب ★،
  //   واسمُه لا يتكرّر في كلّ صفحة. فيُقاس كلٌّ بمصدره الذي ادّعاه.
  let poet = 'none';
  if (verse.poet) {
    const name = poetKey(verse.poet).split(' ').slice(0, 2).join(' ');
    const source = verse.poetSource ?? null;
    // ★ ونسبةٌ بلا مصدرٍ مسجَّلٍ لا تُدقَّق ولا تُدان: ★ تُعدّ «غير قابلةٍ
    //   للتدقيق» ويُعلن عددُها — فالسكوتُ عنها يُجمّل الرقم، وإدانتُها ظلم.
    if (!source) return { verbatim, poet: 'no-source', reason: 'نسبةٌ بلا مصدرٍ مسجَّل' };
    if (source === 'book' || source === 'book-numbered') {
      // ادّعاؤنا أن الكتاب ينسب نفسه — فيُطلب الاسمُ في عنوانه
      const title = poetKey(verse.source?.bookName ?? '');
      poet = name && title.includes(name.split(' ')[0]) ? 'from-title' : 'absent';
    } else if (source === 'carry' || source === 'inherit' || source === 'entry') {
      if (name && page.includes(name)) poet = 'found';
      else if (prev === null) poet = 'carry-unchecked';
      else poet = prev.includes(name) ? 'from-prev' : 'absent';
    } else {
      poet = name && page.includes(name) ? 'found' : 'absent';
    }
  }

  const tail = verbatim ? tailAfterVerse(pageText, verse.text) : null;
  return {
    verbatim,
    poet,
    // ما بقي من سطر البيت بعد عجزه — دليلُ بترٍ إن كان كلامًا عربيًّا
    truncated: tail ? true : undefined,
    tail: tail ? stripDiacritics(tail).slice(0, 40) : undefined,
    reason: verbatim ? null : `لم يوجد في الصفحة: «${stripDiacritics(missing[0]).slice(0, 40)}…»`,
  };
}

// ★★ والنصُّ الصادقُ قد يكون ناقصًا. ★★
//
//   التدقيقُ بالحرف يُمسك التحريف ولا يُمسك البتر: «... إلى سَنَد» موجودةٌ في
//   صفحتها حرفًا بحرف، وتمامُ البيت «إلى سند مثل الرتاج المضبب». فيُطلب ما
//   بقي من سطر البيت بعد عجزه: إن بقي كلامٌ عربيٌّ قبل حدّ السطر أو القوس
//   الخاتم فالبيتُ مبتور، ويُعلن ذلك عددًا ومثالًا.
const ARABIC_WORD = /[\u0621-\u064A]{2,}/;
// ★ وما بعد البيت من كلام الكتاب ليس بترًا ★ — الشاهدُ يُساق داخل النثر،
//   فيَعقُبه في سطره «وقال فلان» و«يقول» و«أي». فلا يُعدّ ذلك نقصًا في البيت.
const PROSE_TAIL = /^(?:و?ف?قال|و?قوله|و?أنشد|يقول|يعني|أي|ثم|ومنه|ومنها|وهذا|وهو|فلما|قلت|انشد)(?:\s|$)/;
const TAIL_NOISE = /^[\s)\]»›"”.،:؛\u0640]*$/;

export function tailAfterVerse(pageText, verseText) {
  const [, ajzRaw] = String(verseText ?? '').split(/\s*(?:\.{3}|…)\s*/);
  const part = normalize(ajzRaw ?? verseText ?? '');
  if (!part) return null;
  for (const line of String(pageText ?? '').replace(/\r/g, '').split('\n')) {
    const flat = normalize(line.replace(/\s+/g, ' '));
    const at = flat.indexOf(part);
    if (at < 0) continue;
    let rest = flat.slice(at + part.length);
    // رقمُ الحاشية ليس من البيت، وكذلك القوسُ الخاتم وعلاماتُ الوقف
    rest = rest.replace(/[(\[«‹][\u0660-\u0669\u06F0-\u06F90-9]{1,3}[)\]»›]?/g, ' ');
    if (TAIL_NOISE.test(rest)) return null;
    const tail = rest.trim();
    if (PROSE_TAIL.test(tail)) return null;
    return ARABIC_WORD.test(tail) ? tail : null;
  }
  return null;
}

/** خلاصةُ العيّنة — أرقامٌ تُنشر كما هي. */
export function summarize(results) {
  const checked = results.length;
  const verbatim = results.filter((r) => r.verbatim).length;
  const unverifiable = results.filter((r) => r.poet === 'no-source' || r.poet === 'carry-unchecked').length;
  const named = results.filter((r) => !['none', 'no-source', 'carry-unchecked'].includes(r.poet));
  const SUPPORTED = ['found', 'from-title', 'from-prev'];
  const poetFound = named.filter((r) => SUPPORTED.includes(r.poet)).length;
  const fromPage = results.filter((r) => r.poet === 'found').length;
  const fromTitle = results.filter((r) => r.poet === 'from-title').length;
  const fromPrev = results.filter((r) => r.poet === 'from-prev').length;
  const truncated = results.filter((r) => r.truncated).length;
  return {
    checked,
    verbatim,
    textAccuracy: checked ? Number((verbatim / checked).toFixed(3)) : null,
    // ★ وتمامُ النصّ غيرُ صحّته ★ — بيتٌ مبتورٌ نصُّه حرفيٌّ وهو ناقص
    truncated,
    completeness: checked ? Number(((checked - truncated) / checked).toFixed(3)) : null,
    named: named.length,
    poetFound, fromPage, fromTitle, fromPrev, unverifiable,
    poetAccuracy: named.length ? Number((poetFound / named.length).toFixed(3)) : null,
    failures: results.filter((r) => !r.verbatim).slice(0, 20),
    truncations: results.filter((r) => r.truncated).slice(0, 20),
    poetMisses: named.filter((r) => r.poet === 'absent').slice(0, 20),
  };
}

/**
 * عيّنةٌ ثابتةٌ من الأبيات — ★ بذرةٌ ثابتة كي يُعاد القياسُ نفسُه ★
 * فيُعرف أتحسّن الفهرسُ أم ساء، لا أن تختلف العيّنة فتختلف النتيجة.
 */
export function sample(items, size, seed = 20260917) {
  const out = [...items];
  let s = seed >>> 0 || 1;
  const rand = () => {
    s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, Math.min(size, out.length));
}
