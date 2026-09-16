// طبقة الشاملة: من استعلامٍ إلى أبياتٍ موثَّقة.
//
// البحث ← جلب الصفحات ← اقتناص الأبيات ← نسبتها إلى قائليها ← بوابة التحقّق
// ← سنة الوفاة والعصر ← إزالة المكرَّر ← إسنادٌ كامل لكل بيت.

import { McpStdioClient } from './mcp-client.js';
import { Biography } from './biography.js';
import { expand } from './council.js';
import { collectFromWeb, webSearchAvailable } from './web.js';
import { embed, embeddingsAvailable, embeddingsProvider } from './providers/embeddings.js';
import { rankBySimilarity, rankingNote } from '../core/semantic.js';
import { extractVerses } from '../core/verses.js';
import { attributeVerses } from '../core/attribution.js';
import { gate } from '../core/verify.js';
import { dedupe } from '../core/dedupe.js';
import { eraOf } from '../core/eras.js';
import { TRUST, shamelaUrl } from '../core/trust.js';
import { detectRegister } from '../core/register.js';
import { normalize, fingerprint } from '../core/normalize.js';
import { similarity } from '../core/dedupe.js';

// التصنيفات التي يسكنها الشعر في الشاملة — البحث خارجها يُتعب ولا يُثمر.
//
// ★ والتراجمُ منها: ★ بُنيت لها في الجولة الثانية قراءةُ «صاحب الترجمة» من
//   فهرس الكتاب (فكتبُ الأعيان تُصدّر المترجَم مرّةً ثم تسوق شعره صفحاتٍ)،
//   وجُرّبت على «أعيان العصر» فأخرجت واحدًا وعشرين بيتًا منسوبةً كلُّها —
//   ثمّ بقي البابُ مغلقًا لأن تصنيفها ليس في هذه القائمة. فالعملُ مبنيٌّ
//   والحصادُ متروك: خمسُ مئةٍ وتسعةٌ وسبعون كتابًا.
export const POETRY_CATEGORIES = [
  34, // الشعر ودواوينه
  32, // الأدب — الأغاني والعقد والأمالي والحماسة
  30, // الغريب والمعاجم — تستشهد بالبيت وتشرح معناه
  31, // النحو والصرف — كتب الشواهد
  35, // البلاغة — الأبيات مبوَّبةٌ على المعاني
  33, // العروض والقوافي
  23, // الرقائق والآداب — شعر الزهد والحكمة
  26, // التراجم والطبقات — صاحبُ الترجمة قائلُ شعرها
];

// ★ وهذه فيها شعرٌ كثيرٌ ولا تُفهرَس افتراضًا. ★
// شروح الحديث وحدها فيها ١٣٩١ صفحةً فيها «قول الشاعر» من المنزَّل. والقرارُ
// لصاحب المكتبة (‎--categories‎)، لكنّ الموقع ★ يقول للباحث ما لم يُبحث فيه ★
// فلا يحسب سكوتَ الفهرس سكوتَ الشعر.
export const POETRY_ELSEWHERE = [
  { id: 7, name: 'شروح الحديث' },
  { id: 3, name: 'التفسير' },
  { id: 25, name: 'التاريخ' },
  { id: 29, name: 'كتب اللغة' },
  { id: 27, name: 'الأنساب' },
  { id: 28, name: 'البلدان والرحلات' },
];

const MAX_PAGES_PER_QUERY = 12;
const COUNCIL_PAGE_BUDGET = 60;   // أربعة عشر استعلامًا × اثنتي عشرة صفحة = مكتبةٌ تُقرأ مرّتين

export class Shamela {
  constructor(opts) {
    this.client = new McpStdioClient(opts);
    this.pageCache = new Map();   // `${book}:${page}` ← نصّ الصفحة
    this.biography = new Biography(this.client);
  }

  async health() {
    return this.client.callTool('shamela_health', { response_format: 'json' });
  }

  async search(query, { mode = 'near', distance = 10, limit = 20, categories = POETRY_CATEGORIES } = {}) {
    const scope = categories?.length ? { category_ids: categories } : undefined;
    if (mode === 'words') {
      return this.client.callTool('shamela_search_pages', {
        query, limit, response_format: 'json', ...(scope ? { scope } : {}),
      });
    }
    return this.client.callTool('shamela_search_phrase', {
      query, mode: mode === 'phrase' ? 'phrase' : 'near', distance, limit,
      response_format: 'json', ...(scope ? { scope } : {}),
    });
  }

  async page(bookId, pageId) {
    const key = `${bookId}:${pageId}`;
    if (this.pageCache.has(key)) return this.pageCache.get(key);
    const r = await this.client.callTool('shamela_get_page', {
      book_id: bookId, page_id: pageId, response_format: 'json',
    });
    this.pageCache.set(key, r);
    return r;
  }

  /** سنة وفاة الشاعر — من فهرس المؤلّفين أو «الأعلام»، ومعها سندها. */
  deathYearOf(poetName) {
    return this.biography.deathYearOf(poetName);
  }

  /**
   * يجمع مرشَّحي بيتٍ من استعلامٍ واحد داخل سياقٍ مشترك (وثائق وميزانية صفحات).
   * السياق مشترَك عمدًا: الاستعلامات تتقاطع، والصفحةُ تُقرأ مرّةً لا مرّاتٍ بعددها.
   */
  async collect(query, ctx, { mode = 'near', distance = 10, limit = 20, categories = POETRY_CATEGORIES } = {}) {
    const search = await this.search(query, { mode, distance, limit, categories });
    const hits = search?.results ?? [];
    const terms = normalize(query).split(' ').filter(Boolean);

    for (const hit of hits.slice(0, MAX_PAGES_PER_QUERY)) {
      if (ctx.pagesLeft <= 0) { ctx.budgetExhausted = true; break; }
      const docId = `shamela:${hit.book_id}:${hit.page_id}`;

      let body = ctx.bodies.get(docId);
      if (body === undefined) {
        let pg;
        try { pg = await this.page(hit.book_id, hit.page_id); } catch { continue; }
        body = pg?.body ?? '';
        ctx.bodies.set(docId, body);
        ctx.citations.set(docId, pg?.citation ?? null);
        ctx.pagesLeft--;
        if (body) ctx.documents.push({ id: docId, text: body });
      }
      if (!body) continue;

      const found = attributeVerses(body, extractVerses(body), { bookName: hit.book_name });
      for (const v of found) {
        // كلمتان تكفيان — والعلّة نفسها: اشتراطُ «كلّها إلا واحدة» يُسقط كلَّ
        // شيءٍ حين يكون السؤال بيتًا كاملًا. (انظر verse-index.js)
        if (terms.length) {
          const nv = normalize(v.text);
          const matched = terms.filter((t) => nv.includes(t)).length;
          if (matched < 1) continue;
        }
        ctx.candidates.push({
          ...v,
          matchedQueries: [query],
          source: {
            kind: 'shamela',
            trust: 'documented',
            documentId: docId,
            bookId: hit.book_id,
            bookName: hit.book_name,
            bookAuthor: hit.author_name,   // ★ مؤلّف الكتاب، لا قائل البيت ★
            category: hit.category,
            pageId: hit.page_id,
            printedPage: hit.printed_page,
            citation: ctx.citations.get(docId),
            // ★ رابطٌ للتأكّد — طلبٌ صريح. يُبنى من رقمَي الكتاب والصفحة،
            //   ويُعرض موسومًا لأن ترقيم الموقع قد يخالف ترقيم النسخة المحلّية.
            url: shamelaUrl(hit.book_id, hit.page_id),
            urlNote: 'رابطٌ إلى الشاملة على الشبكة — يقطع بالكتاب ويقارب في الصفحة.',
          },
        });
      }
    }
    return search?.total_hits ?? hits.length;
  }

  newContext(pageBudget) {
    return {
      documents: [], candidates: [], bodies: new Map(), citations: new Map(),
      pagesLeft: pageBudget, budgetExhausted: false,
    };
  }

  /** البوابة ← المكرَّر ← التأريخ ← الترتيب. مسارٌ واحدٌ لكل بيتٍ مهما كان مصدره. */
  async finalize(ctx, { excludeVerse = null, queryCount = 1, env = process.env } = {}) {
    const { passed, rejectedCount } = gate(ctx.candidates, ctx.documents);

    // البيت الذي سألتَ به ليس موافقةً له — فيُستبعد هو ورواياته.
    // ★ وبالاحتواء لا بالتطابق: ★ السؤال قد يكون شطرًا منه أو روايةً ناقصة.
    const excludeFp = excludeVerse ? fingerprint(excludeVerse) : null;
    const isSame = (text) => {
      if (!excludeFp) return false;
      const fp = fingerprint(text);
      if (fp === excludeFp) return true;
      const [a, b] = fp.length >= excludeFp.length ? [fp, excludeFp] : [excludeFp, fp];
      return (b.length >= 12 && a.includes(b)) || similarity(text, excludeVerse) >= 0.9;
    };
    const kept = excludeFp ? passed.filter((v) => !isSame(v.text)) : passed;

    const merged = dedupe(kept);

    for (const v of merged) {
      const info = v.poet ? await this.deathYearOf(v.poet) : null;
      v.deathYear = info?.deathYear ?? null;
      v.deathYearGregorian = info?.gregorian ?? null;
      v.era = eraOf(info?.deathYear ?? null);
      v.poetResolved = info?.matchedName ?? null;
      v.lifespanSource = info?.source ?? null;

      if (!v.register) {
        const reg = detectRegister(v.text);
        v.register = reg.register;
        v.registerConfidence = reg.confidence;
      }

    }

    // ★ الترتيب بالمعنى (المرحلة ٦) ★ — والتضمينات إن وُجد مفتاحُها
    let embeddings = null, queryVector = null;
    if (excludeVerse && embeddingsAvailable(env) && merged.length) {
      try {
        const vectors = await embed([excludeVerse, ...merged.map((v) => v.text)], env);
        queryVector = vectors.get(excludeVerse) ?? null;
        if (queryVector) embeddings = vectors;
      } catch { /* الترتيب يتراجع إلى مداخل المجلس */ }
    }
    const ranked = rankBySimilarity(excludeVerse ?? '', merged, { embeddings, queryVector, queryCount });

    // درجةُ التوثيق وطريقةُ القراءة تُعدّلان الدرجة بعد قياس المعنى لا قبله
    for (const v of ranked) {
      const trustRank = (TRUST[v.source?.trust]?.rank ?? 1) * 0.01;
      const weakPairing = v.source?.pairing === 'lines' ? -0.05 : 0;
      v.score = Number((v.score + trustRank + weakPairing).toFixed(4));
    }
    ranked.sort((a, b) => b.score - a.score);

    return {
      verses: ranked, rejectedCount,
      pagesRead: ctx.documents.length, budgetExhausted: ctx.budgetExhausted,
      ranking: {
        basis: ranked[0]?.ranking?.basis ?? 'lexical',
        note: rankingNote(ranked[0]?.ranking?.basis ?? 'lexical'),
        provider: embeddings ? embeddingsProvider(env) : null,
      },
    };
  }

  /** بحثٌ باستعلامٍ واحدٍ — المرحلة الأولى، وما زال يعمل كما هو. */
  async verses(query, opts = {}) {
    const ctx = this.newContext(MAX_PAGES_PER_QUERY);
    const totalHits = await this.collect(query, ctx, opts);
    const out = await this.finalize(ctx, { excludeVerse: opts.excludeVerse ?? query, env: opts.env });
    return { query, mode: opts.mode ?? 'near', totalHits, ...out };
  }

  /**
   * ★ مجلس النماذج ★ — بيتٌ يدخل، فتقرؤه عدّةُ نماذجَ ويقترح كلٌّ منها مدخلًا
   * للمعنى، ثم تُبحث الشاملةُ بها كلها، ثم تحرس البوابةُ الخرج.
   */
  async council(verse, env = process.env, opts = {}) {
    const plan = await expand(verse, env, { limit: opts.queryLimit ?? 14 });
    const ctx = this.newContext(opts.pageBudget ?? COUNCIL_PAGE_BUDGET);

    const useWeb = opts.web !== false && webSearchAvailable(env);
    const webQueryLimit = opts.webQueryLimit ?? 4;
    const webStats = { enabled: useWeb, searched: 0, fetched: 0, failed: [], provider: null };

    const perQuery = [];
    let webUsed = 0;
    for (const q of plan.queries) {
      if (ctx.pagesLeft <= 0) { ctx.budgetExhausted = true; break; }
      const before = ctx.candidates.length;
      let totalHits = 0;
      try {
        totalHits = await this.collect(q.text, ctx, {
          mode: q.mode, distance: q.distance, limit: opts.limitPerQuery ?? 12,
          categories: opts.categories ?? POETRY_CATEGORIES,
        });
      } catch { /* استعلامٌ سقط، والمجلس يمضي */ }
      const fromShamela = ctx.candidates.length - before;

      // الشبكة أبطأ وأضعفُ توثيقًا، فتُستعمل في أقوى المداخل وحدها.
      // ★ والنبطي لا يكاد يوجد إلا فيها — فهي ليست تكميلًا بل هي مصدره الوحيد. ★
      let fromWeb = 0;
      if (useWeb && webUsed < webQueryLimit) {
        webUsed++;
        const mark = ctx.candidates.length;
        try {
          const st = await collectFromWeb(q.text, ctx, env, { maxPages: opts.webPages ?? 5 });
          webStats.searched += st.searched;
          webStats.fetched += st.fetched;
          webStats.failed.push(...st.failed);
          webStats.provider = st.provider;
        } catch (e) {
          webStats.failed.push({ query: q.text, error: String(e?.message ?? e) });
        }
        fromWeb = ctx.candidates.length - mark;
      }

      perQuery.push({ ...q, totalHits, found: fromShamela + fromWeb, fromShamela, fromWeb });
    }

    const out = await this.finalize(ctx, {
      excludeVerse: verse, queryCount: plan.queries.length, env,
    });
    return { verse, council: { ...plan, perQuery }, web: webStats, ...out };
  }
}
