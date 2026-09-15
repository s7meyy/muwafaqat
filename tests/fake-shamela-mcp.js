#!/usr/bin/env node
// خادم شاملةٍ مُزيَّف يتكلّم MCP على stdio ويعيد صفحةً حقيقيةً محفوظة.
// الغرض: اختبار الجسر كله — العميل والطبقة والخادم — بلا حاجةٍ إلى المكتبة نفسها.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const page = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/maani-66.json'), 'utf8'));
const alaam = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/alaam-shawqi.json'), 'utf8'));
const ALAAM_ID = 12286;

// بياناتٌ حقيقيةٌ من فهرس مؤلّفي الشاملة. لاحظ «شوقي»: ثلاثةٌ بدرجاتٍ متساوية،
// أوّلهم الناقدُ لا الشاعر — وهذا الفخّ الذي يجب أن يسقط فيه من يأخذ الأول.
const AUTHOR_INDEX = {
  'شوقي': [
    { author_id: 1406, author_name: 'شوقي ضيف', death_year: 1426 },
    { author_id: 2443, author_name: 'شوقي بشير', death_year: null },
    { author_id: 1270, author_name: 'أحمد شوقي', death_year: 1351 },
  ],
  'جرير': [
    { author_id: 2959, author_name: 'جرير', death_year: 110 },
    { author_id: 59, author_name: 'ابن جرير الطبري', death_year: 310 },
  ],
  'المتنبي': [],          // ليس في فهرس المؤلّفين أصلًا
  'الشريف الرضي': [],     // ولا هو
};

function handle(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return { jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'fake-shamela', version: '0' } } };
  }
  if (method !== 'tools/call') return null;
  const { name, arguments: args } = params;
  let structured;

  if (name === 'shamela_health') {
    structured = { status: 'ok', downloaded_books: 1, note: 'خادمٌ مزيَّف للاختبار' };
  } else if (name === 'shamela_search_phrase' || name === 'shamela_search_pages') {
    const books = args?.scope?.book_ids ?? [];
    if (books.includes(ALAAM_ID)) {
      structured = { total_hits: alaam.pages.length, results: alaam.pages.map((p) => ({
        book_id: ALAAM_ID, book_name: 'الأعلام للزركلي', author_name: 'خير الدين الزركلي',
        category: 'التراجم والطبقات', page_id: p.page_id, printed_page: p.printed_page,
      })) };
    } else {
      structured = { total_hits: 1, results: [{
        book_id: page.book_id, book_name: page.book_name, author_name: page.author_name,
        category: page.category_path[0], page_id: page.page_id, printed_page: page.printed_page,
      }] };
    }
  } else if (name === 'shamela_get_page') {
    if (args.book_id === ALAAM_ID) {
      const p = alaam.pages.find((x) => x.page_id === args.page_id);
      structured = p ? { book_id: ALAAM_ID, book_name: 'الأعلام للزركلي', ...p } : {};
    } else {
      structured = { ...page, citation: `${page.author_name}، ${page.book_name}، ص ${page.printed_page}.` };
    }
  } else if (name === 'shamela_resolve') {
    structured = { authors: AUTHOR_INDEX[String(args.query).trim()] ?? [] };
  } else {
    return { jsonrpc: '2.0', id, error: { code: -32601, message: `أداة مجهولة: ${name}` } };
  }

  return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(structured) }], structuredContent: structured } };
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  buf += c;
  let i;
  while ((i = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    const out = handle(msg);
    if (out) process.stdout.write(JSON.stringify(out) + '\n');
  }
});
