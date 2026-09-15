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
import { attributeVerses } from '../core/attribution.js';
import { POETRY_CATEGORIES } from '../bridge/shamela.js';
import { toArabicDigits } from '../core/normalize.js';

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

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); }
  catch { return { doneBooks: [], verses: 0, pages: 0 }; }
}
function saveState(s) {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
}

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

async function* pagesOf(bookId) {
  let start = 1;
  for (;;) {
    let r;
    try {
      r = await client.callTool('shamela_get_pages_range', {
        book_id: bookId, start_page_id: start, count: PAGES_PER_CALL, response_format: 'json',
      });
    } catch { return; }
    const pages = r?.pages ?? [];
    if (!pages.length) return;
    for (const p of pages) yield p;
    if (!r.has_more) return;
    start = r.next_start_page_id ?? (pages[pages.length - 1].page_id + 1);
  }
}

async function main() {
  const state = loadState();
  const done = new Set(state.doneBooks);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const sink = fs.createWriteStream(OUT, { flags: 'a' });

  const categories = CATEGORIES.length ? CATEGORIES : POETRY_CATEGORIES;
  let allBooks = [];
  for (const c of categories) allBooks.push(...(await booksIn(c)).map((b) => ({ ...b, category_id: c })));
  if (args.limitBooks) allBooks = allBooks.slice(0, Number(args.limitBooks));

  const todo = allBooks.filter((b) => !done.has(b.book_id));
  log(`كتبٌ في النطاق: ${toArabicDigits(String(allBooks.length))} · بقي منها: ${toArabicDigits(String(todo.length))}`);

  for (const [n, book] of todo.entries()) {
    let bookVerses = 0, bookPages = 0;
    for await (const page of pagesOf(book.book_id)) {
      const body = page?.body ?? '';
      bookPages++;
      if (!body) continue;
      const found = attributeVerses(body, extractVerses(body), { bookName: book.book_name });
      for (const v of found) {
        sink.write(JSON.stringify({
          text: v.text, poet: v.poet, poetSource: v.poetSource,
          source: {
            bookId: book.book_id, bookName: book.book_name, bookAuthor: book.author_name,
            category: book.category ?? book.category_id, pageId: page.page_id, printedPage: page.printed_page,
          },
        }) + '\n');
        bookVerses++;
      }
    }
    state.doneBooks.push(book.book_id);
    state.verses += bookVerses;
    state.pages += bookPages;
    saveState(state);
    log(`[${toArabicDigits(String(n + 1))}/${toArabicDigits(String(todo.length))}] ${book.book_name} — `
      + `${toArabicDigits(String(bookVerses))} بيتًا من ${toArabicDigits(String(bookPages))} صفحة`);
  }

  sink.end();
  log(`تمّ. ${toArabicDigits(String(state.verses))} بيتًا من ${toArabicDigits(String(state.pages))} صفحة ← ${OUT}`);
  client.stop();
}

function log(msg) { process.stdout.write(msg + '\n'); }

main().catch((e) => { process.stderr.write(`تعذّر: ${e.message}\n`); client.stop(); process.exit(1); });
