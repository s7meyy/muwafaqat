// «أرِني القصيدة» — أن يرى الباحث البيتَ في سياقه لا مبتورًا.
//
// ★ والبيتُ وحده يُقرأ خطأً. ★ فالباحث في الموافقات يسأل: أهذا معناه حقًّا،
// أم أنّ ما قبله يقلبه؟ وكم من بيتٍ ظُنَّ فخرًا وهو في سياقه هجاء.
//
// ولسنا ندّعي أنّنا نعرف حدود القصيدة — الكتبُ لا تقول ذلك دائمًا. فالذي
// نملكه: أبياتٌ استُخرجت من صفحةٍ بعينها بترتيب ورودها فيها. فنجمعها
// ★ بالموضع ★ (كتابٌ وصفحة)، ونقطع الجمعَ حين يتغيّر الرويُّ أو البحر —
// فالقافيةُ أمارةُ القصيدة الواحدة عند العرب. ويُقال للقارئ ما هو: «ما ورد
// معه في الصفحة»، لا «قصيدتُه» — فدعوى ما لم نتحقّقه خيانةُ النقل.

import { rhyme } from './prosody.js';

/** مفتاحُ الموضع: كتابٌ وصفحة. */
export function placeKey(v) {
  const s = v?.source ?? {};
  return s.bookId && s.pageId ? `${s.bookId}:${s.pageId}` : null;
}

/** رويُّ البيت — أمارةُ وحدة القصيدة. وما لم يُقرأ رويُّه لم يُقطع به. */
function rawiOf(text) {
  try { return rhyme(text)?.rawi ?? null; } catch { return null; }
}

/**
 * فهرسُ المواضع: { "كتاب:صفحة": [[أرقامُ متتابعةٍ في رويٍّ واحد], [...]] }
 *
 * `verses` أبياتٌ لها `id` بترتيب ورودها في الاستخراج — وهو ترتيبُ الصفحة.
 * وما وقع فردًا لا يُحفظ: بيتٌ وحده في صفحةٍ لا سياقَ له يُعرض.
 */
export function buildPoemIndex(verses, { maxRun = 60 } = {}) {
  const pages = new Map();
  for (const v of verses) {
    const key = placeKey(v);
    if (!key || !v.id) continue;
    if (!pages.has(key)) pages.set(key, []);
    pages.get(key).push(v);
  }

  const out = {};
  for (const [key, list] of pages) {
    const runs = [];
    let run = [];
    let rawi = null, meter = null;
    for (const v of list) {
      const r = rawiOf(v.text);
      const m = v.meter ?? null;
      // ★ يُقطع الجمعُ عند تغيّر الرويّ أو البحر ★ — وصفحةُ المختارات فيها
      //   قصائدُ شتّى، فجمعُها كلَّها «سياقًا» تضليل.
      const broken = run.length
        && ((r && rawi && r !== rawi) || (m && meter && m !== meter) || run.length >= maxRun);
      if (broken) { runs.push(run); run = []; rawi = null; meter = null; }
      run.push(v.id);
      rawi ??= r; meter ??= m;
    }
    if (run.length) runs.push(run);
    const kept = runs.filter((x) => x.length > 1);
    if (kept.length) out[key] = kept;
  }
  return out;
}

/** الأبياتُ الواردةُ مع هذا البيت في موضعه — وفيها هو، بترتيب الصفحة. */
export function runFor(index, verse) {
  const key = placeKey(verse);
  if (!key || !verse?.id || !index?.[key]) return null;
  return index[key].find((run) => run.includes(verse.id)) ?? null;
}
