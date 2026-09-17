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

  return {
    verbatim,
    poet,
    reason: verbatim ? null : `لم يوجد في الصفحة: «${stripDiacritics(missing[0]).slice(0, 40)}…»`,
  };
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
  return {
    checked,
    verbatim,
    textAccuracy: checked ? Number((verbatim / checked).toFixed(3)) : null,
    named: named.length,
    poetFound, fromPage, fromTitle, fromPrev, unverifiable,
    poetAccuracy: named.length ? Number((poetFound / named.length).toFixed(3)) : null,
    failures: results.filter((r) => !r.verbatim).slice(0, 20),
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
