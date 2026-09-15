// طبقة الشاملة: من استعلامٍ إلى أبياتٍ موثَّقة.
//
// البحث ← جلب الصفحات ← اقتناص الأبيات ← نسبتها إلى قائليها ← بوابة التحقّق
// ← سنة الوفاة والعصر ← إزالة المكرَّر ← إسنادٌ كامل لكل بيت.

import { McpStdioClient } from './mcp-client.js';
import { extractVerses } from '../core/verses.js';
import { attributeVerses } from '../core/attribution.js';
import { gate } from '../core/verify.js';
import { dedupe } from '../core/dedupe.js';
import { eraOf, hijriToGregorian } from '../core/eras.js';
import { normalize } from '../core/normalize.js';

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

export class Shamela {
  constructor(opts) {
    this.client = new McpStdioClient(opts);
    this.pageCache = new Map();   // `${book}:${page}` ← نصّ الصفحة
    this.authorCache = new Map(); // اسم الشاعر ← { deathYear } | null
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

  /** سنة وفاة الشاعر من فهرس مؤلّفي الشاملة — لا من تخمين نموذج. */
  async deathYearOf(poetName) {
    if (!poetName) return null;
    const key = normalize(poetName);
    if (this.authorCache.has(key)) return this.authorCache.get(key);

    let out = null;
    try {
      const res = await this.client.callTool('shamela_resolve', {
        query: poetName, type: 'author', limit: 3, response_format: 'json',
      });
      const authors = res?.authors ?? res?.results ?? [];
      const hit = Array.isArray(authors) ? authors[0] : null;
      const id = hit?.author_id ?? hit?.id;
      if (id) {
        const a = await this.client.callTool('shamela_get_author', {
          author_id: id, include_books: false, response_format: 'json',
        });
        if (a?.death_year) {
          out = { deathYear: Number(a.death_year), authorId: id, matchedName: a.author_name ?? hit?.author_name ?? null };
        }
      }
    } catch { /* المجهول يبقى مجهولًا — ولا يُملأ بتخمين */ }

    this.authorCache.set(key, out);
    return out;
  }

  /**
   * ★ نقطة الجسر الأهمّ ★ — استعلامٌ يدخل، وأبياتٌ موثَّقةٌ تخرج.
   * كل بيتٍ في المخرَج مرَّ ببوابة التحقّق، ومعه كتابه وصفحته وقائله وعصره.
   */
  async verses(query, { mode = 'near', distance = 10, limit = 20, categories = POETRY_CATEGORIES, requireAllTerms = true } = {}) {
    const search = await this.search(query, { mode, distance, limit, categories });
    const hits = search?.results ?? [];
    const terms = normalize(query).split(' ').filter(Boolean);

    const documents = [];
    const candidates = [];

    for (const hit of hits.slice(0, MAX_PAGES_PER_QUERY)) {
      let pg;
      try { pg = await this.page(hit.book_id, hit.page_id); } catch { continue; }
      const body = pg?.body ?? '';
      if (!body) continue;

      const docId = `shamela:${hit.book_id}:${hit.page_id}`;
      documents.push({ id: docId, text: body });

      const found = attributeVerses(body, extractVerses(body), { bookName: hit.book_name });
      for (const v of found) {
        // البيت يعنينا إن حمل كلام الاستعلام — لا كل أبيات الصفحة
        if (requireAllTerms && terms.length) {
          const nv = normalize(v.text);
          const matched = terms.filter((t) => nv.includes(t)).length;
          if (matched < Math.min(terms.length, Math.max(1, terms.length - 1))) continue;
        }
        candidates.push({
          ...v,
          source: {
            kind: 'shamela',
            trust: 'documented',          // 🟢 كتابٌ محقَّقٌ بصفحته
            documentId: docId,
            bookId: hit.book_id,
            bookName: hit.book_name,
            bookAuthor: hit.author_name,  // ★ مؤلّف الكتاب، لا قائل البيت ★
            category: hit.category,
            pageId: hit.page_id,
            printedPage: hit.printed_page,
            citation: pg.citation ?? null,
          },
        });
      }
    }

    // ★ البوابة ★ — ولو كانت الأبيات مستخرَجةً من الوثائق نفسها، فالمسار واحدٌ
    //   لكل بيتٍ مهما كان مصدره، ومقترحات النماذج تمرّ من هنا بعينه.
    const { passed, rejectedCount } = gate(candidates, documents);
    const merged = dedupe(passed);

    // التأريخ يُطلب بعد إزالة المكرَّر، فلا نسأل عن شاعرٍ مرتين
    for (const v of merged) {
      const info = v.poet ? await this.deathYearOf(v.poet) : null;
      v.deathYear = info?.deathYear ?? null;
      v.deathYearGregorian = info?.deathYear ? hijriToGregorian(info.deathYear) : null;
      v.era = eraOf(info?.deathYear ?? null);
      v.poetResolved = info?.matchedName ?? null;
    }

    return {
      query,
      mode,
      totalHits: search?.total_hits ?? search?.total_count ?? hits.length,
      pagesRead: documents.length,
      verses: merged,
      rejectedCount,     // مقترحاتٌ لم تُثبَت — تُعرض رقمًا ولا تُخفى
    };
  }
}
