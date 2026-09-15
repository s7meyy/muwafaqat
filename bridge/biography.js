// تأريخ الشاعر: سنة وفاته — ومعها مصدرها.
//
// طريقان، أوثقهما أولًا، وكلاهما يعطي سندًا يُراجَع:
//
//  ١) فهرس مؤلّفي الشاملة — دقيقٌ حين يطابق، لكنه فهرسُ مؤلّفي كتبٍ لا شعراء:
//     «جرير» فيه لأن له ديوانًا، و«المتنبي» و«الشريف الرضي» ليسا فيه أصلًا.
//     وفيه فخٌّ: «شوقي» يعيد ثلاثةً أوّلهم «شوقي ضيف» الناقد (ت ١٤٢٦) لا الشاعر
//     (ت ١٣٥١)، وبدرجاتٍ متساوية. فلا يُقبل منه إلا مطابقٌ قاطع، وما اشتبه تُرك.
//
//  ٢) «الأعلام» للزركلي — يترجم لأكثر من في العربية، بصيغةٍ منتظمة، وبصفحةٍ تُذكر.
//
// وما لم يُوجد في الطريقين: «غير معروف». والفراغ لا يُملأ بتخمين.

import { findLifespanFor } from '../core/lifespan.js';
import { normalize } from '../core/normalize.js';
import { hijriToGregorian } from '../core/eras.js';

const ALAAM_BOOK_ID = 12286; // الأعلام للزركلي

export class Biography {
  constructor(client) {
    this.client = client;
    this.cache = new Map();
  }

  async deathYearOf(poetName) {
    if (!poetName) return null;
    const key = normalize(poetName);
    if (!key) return null;
    if (this.cache.has(key)) return this.cache.get(key);

    let out = null;
    try { out = (await this.fromAuthorIndex(poetName)) ?? (await this.fromAlaam(poetName)); }
    catch { out = null; }

    this.cache.set(key, out);
    return out;
  }

  /** (١) فهرس المؤلّفين — ولا يُقبل إلا المطابق القاطع. */
  async fromAuthorIndex(poetName) {
    const res = await this.client.callTool('shamela_resolve', {
      query: poetName, type: 'author', limit: 5, response_format: 'json',
    });
    const authors = (res?.authors ?? []).filter((a) => a?.death_year);
    if (!authors.length) return null;

    const wanted = normalize(poetName);
    const exact = authors.filter((a) => normalize(a.author_name) === wanted);

    // ★ مطابقٌ واحدٌ تامٌّ فقط. اثنان فأكثر = اشتباه، والاشتباه يُترك ولا يُرجَّح.
    if (exact.length !== 1) return null;

    const a = exact[0];
    return {
      deathYear: Number(a.death_year),
      gregorian: hijriToGregorian(Number(a.death_year)),
      matchedName: a.author_name,
      confidence: 'exact',
      source: { kind: 'shamela-authors', label: 'فهرس مؤلّفي المكتبة الشاملة' },
    };
  }

  /** (٢) «الأعلام» للزركلي — والسنة تُقرأ من عنوان الترجمة لا من جوارها. */
  async fromAlaam(poetName) {
    const res = await this.client.callTool('shamela_search_pages', {
      query: poetName, limit: 5, response_format: 'json',
      scope: { book_ids: [ALAAM_BOOK_ID] },
    });
    for (const hit of res?.results ?? []) {
      let page;
      try {
        page = await this.client.callTool('shamela_get_page', {
          book_id: hit.book_id, page_id: hit.page_id, response_format: 'json',
        });
      } catch { continue; }
      const found = findLifespanFor(poetName, page?.body ?? '');
      if (!found) continue;

      return {
        deathYear: found.deathYear,
        birthYear: found.birthYear,
        gregorian: found.gregorian?.death ?? hijriToGregorian(found.deathYear),
        matchedName: found.headword,
        confidence: 'alaam',
        source: {
          kind: 'shamela-page',
          label: 'الأعلام للزركلي',
          bookId: hit.book_id,
          pageId: hit.page_id,
          printedPage: hit.printed_page,
          quote: found.context,   // ★ نصُّ الترجمة نفسه، ليُراجَع ★
        },
      };
    }
    return null;
  }
}
