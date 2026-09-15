// طبقة الشاملة: من استعلامٍ إلى أبياتٍ موثَّقة.
//
// البحث ← جلب الصفحات ← اقتناص الأبيات ← نسبتها إلى قائليها ← بوابة التحقّق
// ← سنة الوفاة والعصر ← إزالة المكرَّر ← إسنادٌ كامل لكل بيت.

import { McpStdioClient } from './mcp-client.js';
import { Biography } from './biography.js';
import { expand } from './council.js';
import { extractVerses } from '../core/verses.js';
import { attributeVerses } from '../core/attribution.js';
import { gate } from '../core/verify.js';
import { dedupe } from '../core/dedupe.js';
import { eraOf } from '../core/eras.js';
import { normalize, fingerprint } from '../core/normalize.js';
import { similarity } from '../core/dedupe.js';

// التصنيفات التي يسكنها الشعر في الشاملة — البحث خارجها يُتعب ولا يُثمر.
export const POETRY_CATEGORIES = [
  34, // الشعر ودواوينه
  32, // الأدب — الأغاني والعقد والأمالي والحماسة
  30, // الغريب والمعاجم — تستشهد بالبيت وتشرح معناه
  31, // النحو والصرف — كتب الشواهد
  35, // البلاغة — الأبيات مبوَّبةٌ على المعاني
  33, // العروض والقوافي
  23, // الرقائق والآداب — شعر الزهد والحكمة
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
        if (terms.length) {
          const nv = normalize(v.text);
          const matched = terms.filter((t) => nv.includes(t)).length;
          if (matched < Math.min(terms.length, Math.max(1, terms.length - 1))) continue;
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
  async finalize(ctx, { excludeVerse = null } = {}) {
    const { passed, rejectedCount } = gate(ctx.candidates, ctx.documents);

    // البيت الذي سألتَ به ليس موافقةً له — فيُستبعد هو ورواياته
    const excludeFp = excludeVerse ? fingerprint(excludeVerse) : null;
    const kept = excludeFp
      ? passed.filter((v) => fingerprint(v.text) !== excludeFp && similarity(v.text, excludeVerse) < 0.9)
      : passed;

    const merged = dedupe(kept);

    for (const v of merged) {
      const info = v.poet ? await this.deathYearOf(v.poet) : null;
      v.deathYear = info?.deathYear ?? null;
      v.deathYearGregorian = info?.gregorian ?? null;
      v.era = eraOf(info?.deathYear ?? null);
      v.poetResolved = info?.matchedName ?? null;
      v.lifespanSource = info?.source ?? null;

      // الترتيب: المداخل التي بلغته أولًا (تُجمع في dedupe)، ثم تعدّد مصادره،
      // ثم كونه معروف القائل. ولا شيء من هذا يُدخل بيتًا لم يمرّ بالبوابة.
      v.score = ((v.matchedQueries?.length || 1) * 2) + (v.sources?.length ?? 1) + (v.poet ? 1 : 0);
    }
    merged.sort((a, b) => b.score - a.score);

    return { verses: merged, rejectedCount, pagesRead: ctx.documents.length, budgetExhausted: ctx.budgetExhausted };
  }

  /** بحثٌ باستعلامٍ واحدٍ — المرحلة الأولى، وما زال يعمل كما هو. */
  async verses(query, opts = {}) {
    const ctx = this.newContext(MAX_PAGES_PER_QUERY);
    const totalHits = await this.collect(query, ctx, opts);
    const out = await this.finalize(ctx, { excludeVerse: opts.excludeVerse ?? null });
    return { query, mode: opts.mode ?? 'near', totalHits, ...out };
  }

  /**
   * ★ مجلس النماذج ★ — بيتٌ يدخل، فتقرؤه عدّةُ نماذجَ ويقترح كلٌّ منها مدخلًا
   * للمعنى، ثم تُبحث الشاملةُ بها كلها، ثم تحرس البوابةُ الخرج.
   */
  async council(verse, env = process.env, opts = {}) {
    const plan = await expand(verse, env, { limit: opts.queryLimit ?? 14 });
    const ctx = this.newContext(opts.pageBudget ?? COUNCIL_PAGE_BUDGET);

    const perQuery = [];
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
      perQuery.push({ ...q, totalHits, found: ctx.candidates.length - before });
    }

    const out = await this.finalize(ctx, { excludeVerse: verse });
    return { verse, council: { ...plan, perQuery }, ...out };
  }
}
