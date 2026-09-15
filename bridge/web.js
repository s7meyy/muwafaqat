// المصدر الثاني: الشبكة — ومعها النبطي.
//
// ما يخرج من هنا يمرّ ببوابة التحقّق نفسها التي يمرّ بها الفصيح من الشاملة:
// نصُّ البيت لا بدّ أن يوجد في الصفحة التي جُلبت فعلًا. والفرق ليس في الحراسة
// بل في ★ درجة التوثيق ★: كتابٌ محقَّقٌ ليس كتغريدة، وكلاهما يُعرض بشارته.

import { webSearch, webSearchAvailable, webSearchProvider } from './providers/websearch.js';
import { fetchPage } from './fetch-page.js';
import { htmlToText, titleOf } from '../core/html.js';
import { extractVerses, extractVersesFromLines } from '../core/verses.js';
import { attributeVerses, poetFromWebPage } from '../core/attribution.js';
import { trustOf, siteNameOf } from '../core/trust.js';
import { detectRegister } from '../core/register.js';
import { normalize } from '../core/normalize.js';

const MAX_PAGES = 6;
const CONCURRENCY = 3;

export { webSearchAvailable, webSearchProvider };

async function pooled(tasks, limit) {
  const out = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      try { out[i] = { ok: true, value: await tasks[i]() }; }
      catch (e) { out[i] = { ok: false, error: String(e?.message ?? e) }; }
    }
  }));
  return out;
}

/**
 * يجمع مرشَّحي الأبيات من الشبكة داخل السياق المشترك (نفس سياق الشاملة).
 * فالبوابة واحدة، وإزالة المكرَّر واحدة، والبيت الواحد في كتابٍ وموقعٍ يُجمع.
 */
export async function collectFromWeb(query, ctx, env = process.env, { maxPages = MAX_PAGES, lookup } = {}) {
  const results = await webSearch(query, env, { count: maxPages * 2 });
  const terms = normalize(query).split(' ').filter(Boolean);

  const seen = new Set(ctx.documents.map((d) => d.id));
  const targets = results.filter((r) => r.url && !seen.has(`web:${r.url}`)).slice(0, maxPages);

  const fetched = await pooled(targets.map((r) => () => fetchPage(r.url, { lookup })), CONCURRENCY);
  const failed = [];

  fetched.forEach((f, i) => {
    const hit = targets[i];
    if (!f?.ok) { failed.push({ url: hit.url, error: f?.error ?? 'تعذّر الجلب' }); return; }

    const text = htmlToText(f.value.html);
    if (!text) return;
    const docId = `web:${f.value.url}`;
    ctx.documents.push({ id: docId, text });

    const title = titleOf(f.value.html) ?? hit.title ?? '';
    const pagePoet = poetFromWebPage({ title, text, url: f.value.url });
    const trust = trustOf(f.value.url);

    // طريقان: الفاصل الصريح «...»، وقرنُ الأسطر المتوازنة المتّفقة الرويّ
    const bySeparator = attributeVerses(text, extractVerses(text), { bookName: title });
    const byLines = extractVersesFromLines(text);
    const all = [...bySeparator, ...byLines];

    for (const v of all) {
      if (terms.length) {
        const nv = normalize(v.text);
        const matched = terms.filter((t) => nv.includes(t)).length;
        if (matched < Math.min(terms.length, Math.max(1, terms.length - 1))) continue;
      }
      const reg = detectRegister(v.text);
      ctx.candidates.push({
        ...v,
        poet: v.poet ?? pagePoet.poet ?? null,
        poetSource: v.poet ? v.poetSource : pagePoet.poetSource,
        register: reg.register,
        registerConfidence: reg.confidence,
        registerMarkers: reg.markers.map((m) => m.word),
        matchedQueries: [query],
        source: {
          kind: 'web',
          trust: trust.key,              // 🟡 منشور · 🟠 متداوَل
          trustNote: trust.note ?? null,
          documentId: docId,
          url: f.value.url,
          siteName: siteNameOf(f.value.url),
          pageTitle: title || null,
          retrievedAt: new Date().toISOString(),
          // ★ ما جاء بقرن الأسطر أضعفُ دلالةً ممّا جاء بفاصلٍ صريح — يُذكر لا يُخفى
          pairing: v.pairing ?? 'separator',
        },
      });
    }
  });

  return { searched: results.length, fetched: targets.length, failed, provider: webSearchProvider(env) };
}
