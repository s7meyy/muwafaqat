#!/usr/bin/env node
// خادم شاملةٍ مُزيَّف يتكلّم MCP على stdio ويعيد صفحةً حقيقيةً محفوظة.
// الغرض: اختبار الجسر كله — العميل والطبقة والخادم — بلا حاجةٍ إلى المكتبة نفسها.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const page = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/maani-66.json'), 'utf8'));

const AUTHORS = {
  'شوقي': { author_id: 901, author_name: 'أحمد شوقي', death_year: 1351 },
  'جرير': { author_id: 902, author_name: 'جرير', death_year: 110 },
  'الفرزدق': { author_id: 903, author_name: 'الفرزدق', death_year: 110 },
  'الشريف الرضي': { author_id: 904, author_name: 'الشريف الرضي', death_year: 406 },
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
    structured = { total_hits: 1, results: [{
      book_id: page.book_id, book_name: page.book_name, author_name: page.author_name,
      category: page.category_path[0], page_id: page.page_id, printed_page: page.printed_page,
    }] };
  } else if (name === 'shamela_get_page') {
    structured = { ...page, citation: `${page.author_name}، ${page.book_name}، ص ${page.printed_page}.` };
  } else if (name === 'shamela_resolve') {
    const a = AUTHORS[String(args.query).trim()];
    structured = { authors: a ? [a] : [] };
  } else if (name === 'shamela_get_author') {
    const a = Object.values(AUTHORS).find((x) => x.author_id === args.author_id);
    structured = a ?? {};
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
