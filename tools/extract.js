#!/usr/bin/env node
// استخراج الأبيات من المكتبة الشاملة إلى ملفٍ واحد.
//
// يُشغَّل مرّةً على جهاز صاحب المكتبة، وقد يستغرق ساعات — ★ فهو يُستأنف. ★
// كل كتابٍ فُرغ منه يُسجَّل، فإن انقطع (أو أُغلق الجهاز) استأنف من حيث وقف.
//
//   node tools/extract.js --out index/verses.jsonl
//   node tools/extract.js --categories 34,32 --limit-books 5   (تجربةٌ سريعة)
//
// ولا يُفهرَس كلُّ الشاملة: تصنيفاتُ الشعر وحدها — ففيها الأبيات، وما عداها
// يُضخّم العمل بلا حصاد.

import fs from 'node:fs';
import path from 'node:path';
import { McpStdioClient } from '../bridge/mcp-client.js';
import { extractVerses } from '../core/verses.js';
import { attributeVerses, entrySubject } from '../core/attribution.js';
import { POETRY_CATEGORIES } from '../bridge/shamela.js';
import { toArabicDigits } from '../core/normalize.js';
import { Biography } from '../bridge/biography.js';

const args = parseArgs(process.argv.slice(2));
const OUT = args.out ?? 'index/verses.jsonl';
const STATE = OUT + '.state.json';
const CATEGORIES = (args.categories ?? '').split(',').filter(Boolean).map(Number);
const PAGES_PER_CALL = 20;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    out[key] = next && !next.startsWith('--') ? (i++, next) : true;
  }
  return out;
}

const MAX_ATTEMPTS = 3;

function loadState() {
  try {
    const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    st.attempts ??= {};
    st.givenUp ??= [];
    return st;
  } catch { return { doneBooks: [], verses: 0, pages: 0, attempts: {}, givenUp: [] }; }
}
function saveState(s) {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
}

const NO_DATES = Boolean(args.noDates);

const client = new McpStdioClient({
  command: process.env.SHAMELA_MCP_CMD || 'shamela-mcp',
  args: (process.env.SHAMELA_MCP_ARGS || '').split(' ').filter(Boolean),
  timeoutMs: Number(process.env.MCP_TIMEOUT_MS || 120_000),
});

async function booksIn(categoryId) {
  const books = [];
  let offset = 0;
  for (;;) {
    const r = await client.callTool('shamela_list_downloaded_books', {
      category_id: categoryId, limit: 100, offset, response_format: 'json',
    });
    const page = r?.books ?? r?.results ?? [];
    books.push(...page.filter((b) => b.content_status !== 'downloaded_no_pages'));
    if (!r?.has_more) break;
    offset = r.next_offset ?? offset + 100;
  }
  return books;
}

// ★ يُرفع علمٌ حين ينقطع القراءة، لا أن تُبتلع صامتة. ★
let readFailed = false;

async function* pagesOf(bookId) {
  let start = 1;
  for (;;) {
    let r;
    try {
      r = await client.callTool('shamela_get_pages_range', {
        book_id: bookId, start_page_id: start, count: PAGES_PER_CALL, response_format: 'json',
      });
    } catch { readFailed = true; return; }
    const pages = r?.pages ?? [];
    if (!pages.length) return;
    for (const p of pages) yield p;
    if (!r.has_more) return;
    start = r.next_start_page_id ?? (pages[pages.length - 1].page_id + 1);
  }
}

// ★ كتبٌ مبناها على التراجم: صاحبُ الترجمة هو قائل شعرها. ★
// وفهرس الكتاب نفسه يسمّي صاحب كل ترجمة وصفحتَها، فنبني منه خريطة
// «صفحة ← صاحب ترجمتها». ولا يُستعمل هذا في الدواوين، فعناوين فهارسها
// قوافٍ وأبوابٌ لا أسماءَ شعراء.
const ENTRY_CATEGORIES = new Set([25, 26, 27]); // التاريخ · التراجم والطبقات · الأنساب
const MAX_TOC_TITLES = 50_000;

async function entryMapOf(bookId) {
  let r;
  try {
    r = await client.callTool('shamela_get_toc', {
      book_id: bookId, parent_id: 0, depth: 5, response_format: 'json',
    });
  } catch { return null; }
  const titles = flattenTitles(r?.titles ?? []);
  if (!titles.length || titles.length > MAX_TOC_TITLES) return null;
  const entries = titles
    .map((t) => ({ pageId: Number(t.page_id), name: entrySubject(t.title_text) }))
    .filter((e) => Number.isFinite(e.pageId))
    .sort((a, b) => a.pageId - b.pageId);
  return entries.length ? entries : null;
}

function flattenTitles(nodes, out = []) {
  for (const n of nodes) {
    out.push(n);
    if (Array.isArray(n.children)) flattenTitles(n.children, out);
  }
  return out;
}

/** صاحبُ الترجمة التي تقع فيها الصفحة — وهو آخر عنوانٍ قبلها. */
function subjectAt(entries, pageId) {
  if (!entries) return null;
  let found = null;
  for (const e of entries) {
    if (e.pageId > pageId) break;
    found = e;                    // ★ حتى لو كان عنوانًا غير ترجمة (name=null) ★
  }                               //   فهو يقطع ما قبله، ولا يُورَّث عبره.
  return found?.name ?? null;
}

// ★ سنةُ الوفاة تُستخرج مع البيت لا بعده. ★
// الفهرس الساكن لا خادمَ خلفه يسأل عن التراجم وقت البحث، فإن لم تُخزَّن السنة
// هنا ظهرت كلُّ بطاقةٍ في الموقع بـ«عصره غير معروف» — وهو نقضٌ لأصل المشروع.
// والطلبُ يُكرَّر للشاعر مرّةً واحدةً مهما تكرّر اسمه (Biography يخزّن).
const biography = new Biography(client);

async function main() {
  const state = loadState();
  const done = new Set(state.doneBooks);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const sink = fs.createWriteStream(OUT, { flags: 'a' });

  const categories = CATEGORIES.length ? CATEGORIES : POETRY_CATEGORIES;
  let allBooks = [];
  for (const c of categories) allBooks.push(...(await booksIn(c)).map((b) => ({ ...b, category_id: c })));
  if (args.limitBooks) allBooks = allBooks.slice(0, Number(args.limitBooks));

  // الكتاب الذي فشل ثلاثًا يُترك ويُذكر — لا يُعاد إليه في كل تشغيلٍ أبدًا
  const givenUp = new Set(state.givenUp);
  const todo = allBooks.filter((b) => !done.has(b.book_id) && !givenUp.has(b.book_id));
  if (givenUp.size) log(`(${toArabicDigits(String(givenUp.size))} كتابًا تُرك بعد ${toArabicDigits(String(MAX_ATTEMPTS))} محاولات)`);
  log(`كتبٌ في النطاق: ${toArabicDigits(String(allBooks.length))} · بقي منها: ${toArabicDigits(String(todo.length))}`);

  const incomplete = [];

  for (const [n, book] of todo.entries()) {
    let bookVerses = 0, bookPages = 0;
    readFailed = false;

    // ★ موضعُ الكتابة قبل الكتاب — إليه نرجع إن انقطعت قراءته. ★
    //   وإلّا أُعيدت أبياتُه في التشغيل التالي فتكرّرت في الملف. (الفهرسة
    //   تُزيل المكرَّر، لكن الملف ينتفخ بلا فائدة في عملٍ يمتدّ ساعات.)
    const mark = fs.existsSync(OUT) ? fs.statSync(OUT).size : 0;
    // النسبة تعبر حدّ الصفحة داخل الكتاب الواحد (قصيدةٌ في ثلاث صفحات)، ولا تعبر
    // حدّ الكتاب البتّة.
    let carry = null;
    let lastSubject;
    const entries = ENTRY_CATEGORIES.has(Number(book.category_id)) ? await entryMapOf(book.book_id) : null;
    for await (const page of pagesOf(book.book_id)) {
      const body = page?.body ?? '';
      bookPages++;
      if (!body) continue;
      const entryPoet = subjectAt(entries, page.page_id);
      // ★ ترجمةٌ جديدة تقطع ميراثَ النسبة. ★ وإلا انسابت نسبةُ المترجَم قبله
      //   إلى شعر هذا، وهو كذبٌ على رجلين في سطرٍ واحد.
      if (entries && entryPoet !== lastSubject) carry = null;
      lastSubject = entryPoet;
      const found = attributeVerses(body, extractVerses(body), {
        bookName: book.book_name, carry, entryPoet,
      });
      carry = found.carry ?? carry;
      for (const v of found) {
        const life = (!NO_DATES && v.poet) ? await biography.deathYearOf(v.poet) : null;
        sink.write(JSON.stringify({
          text: v.text, poet: v.poet, poetSource: v.poetSource,
          deathYear: life?.deathYear ?? null,
          lifespanSource: life?.source ? { label: life.source.label } : null,
          source: {
            bookId: book.book_id, bookName: book.book_name, bookAuthor: book.author_name,
            category: book.category ?? book.category_id, pageId: page.page_id, printedPage: page.printed_page,
          },
        }) + '\n');
        bookVerses++;
      }
    }
    // ★ الكتاب الذي انقطعت قراءته لا يُعدّ منجَزًا. ★
    //   وإلّا سُجِّل تامًّا ولم يُعَد إليه أبدًا — وضاع ما فيه بلا كلمة.
    //   (خادم الشاملة قد يموت في منتصف كتاب، والعميل يعيد تشغيله فيمضي
    //    العمل كأن شيئًا لم يكن، والكتاب مكتوبٌ في المنجَز وهو فارغ.)
    const broken = readFailed || bookPages === 0;
    if (broken) {
      // نرجع بالملف إلى ما كان قبل الكتاب، فلا يُكتب شطرُه مرّتين
      await new Promise((r) => sink.write('', r));
      try { fs.truncateSync(OUT, mark); } catch { /* الملف قد يكون جديدًا */ }
      bookVerses = 0;

      const tries = (state.attempts[book.book_id] ?? 0) + 1;
      state.attempts[book.book_id] = tries;
      if (tries >= MAX_ATTEMPTS) state.givenUp.push(book.book_id);
      incomplete.push({ id: book.book_id, name: book.book_name, tries, gaveUp: tries >= MAX_ATTEMPTS });
    } else {
      state.doneBooks.push(book.book_id);
      delete state.attempts[book.book_id];
    }

    state.verses += bookVerses;
    state.pages += bookPages;
    state.incomplete = incomplete.map((b) => b.id);
    saveState(state);
    const tries = state.attempts[book.book_id] ?? 0;
    log(`[${toArabicDigits(String(n + 1))}/${toArabicDigits(String(todo.length))}] ${book.book_name} — `
      + (broken
        ? (tries >= MAX_ATTEMPTS
          ? `★ فشل ${toArabicDigits(String(tries))} مرّات، فتُرك`
          : `★ انقطعت قراءته (المحاولة ${toArabicDigits(String(tries))})، وسيُعاد إليه`)
        : `${toArabicDigits(String(bookVerses))} بيتًا من ${toArabicDigits(String(bookPages))} صفحة`));
  }

  sink.end();
  const dated = biography.cache ? [...biography.cache.values()].filter(Boolean).length : 0;
  log(`تمّ. ${toArabicDigits(String(state.verses))} بيتًا من ${toArabicDigits(String(state.pages))} صفحة`
    + ` · عُرفت وفياتُ ${toArabicDigits(String(dated))} شاعرًا ← ${OUT}`);

  if (incomplete.length) {
    log('');
    const retry = incomplete.filter((b) => !b.gaveUp);
    const dropped = incomplete.filter((b) => b.gaveUp);
    if (retry.length) {
      log(`★ ${toArabicDigits(String(retry.length))} كتابًا لم تتمّ قراءته — أعِد التشغيل ليُستأنف:`);
      for (const b of retry) log(`   - ${b.name} (${toArabicDigits(String(b.id))})`);
    }
    if (dropped.length) {
      log(`★ ${toArabicDigits(String(dropped.length))} كتابًا تُرك بعد ${toArabicDigits(String(MAX_ATTEMPTS))} محاولات:`);
      for (const b of dropped) log(`   - ${b.name} (${toArabicDigits(String(b.id))})`);
    }
  }
  client.stop();
}

function log(msg) { process.stdout.write(msg + '\n'); }

main().catch((e) => { process.stderr.write(`تعذّر: ${e.message}\n`); client.stop(); process.exit(1); });
