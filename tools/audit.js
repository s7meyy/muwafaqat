#!/usr/bin/env node
// تدقيقُ الفهرس بالعيّنة — يُشغَّل على جهاز صاحب المكتبة بعد الاستخراج.
//
//   node tools/audit.js --in index/verses.jsonl --size 100
//
// يأخذ عيّنةً ثابتةً من الأبيات، ويعيد فتح صفحةِ كلِّ بيتٍ في الشاملة، ويطلب
// نصَّه فيها حرفًا بحرف، ونسبتَه في نثرها. ثم يكتب `index/audit.json` ★ فيُنشر
// الرقمُ في الموقع كما هو ★ — نسبةُ خطأٍ مقيسةٌ لا دعوى صدق.
//
// ولا يُصلح شيئًا: يقيس ويقول. والإصلاحُ بعده على بيّنة.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { McpStdioClient } from '../bridge/mcp-client.js';
import { auditVerse, summarize, sample } from '../core/audit.js';
import { toArabicDigits as ar } from '../core/normalize.js';

const args = parseArgs(process.argv.slice(2));
const IN = args.in ?? 'index/verses.jsonl';
const OUT = args.out ?? 'index/audit.json';
const SIZE = Number(args.size ?? 100);

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

const log = (m) => process.stdout.write(m + '\n');

async function readVerses(file) {
  const out = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const v = JSON.parse(line);
      if (v?.source?.bookId && v?.source?.pageId) out.push(v);
    } catch { /* سطرٌ معطوب */ }
  }
  return out;
}

async function main() {
  if (!fs.existsSync(IN)) throw new Error(`لا ملفَّ أبياتٍ في ${IN}`);
  const all = await readVerses(IN);
  const chosen = sample(all, SIZE);
  log(`العيّنة: ${ar(String(chosen.length))} بيتًا من ${ar(String(all.length))} (بذرةٌ ثابتة، فالقياسُ يُعاد كما هو)`);

  const client = new McpStdioClient({
    command: process.env.SHAMELA_MCP_CMD || 'shamela-mcp',
    args: (process.env.SHAMELA_MCP_ARGS || '').split(' ').filter(Boolean),
    timeoutMs: Number(process.env.MCP_TIMEOUT_MS || 120_000),
  });

  const pages = new Map();
  const prevOf = new Map();          // صفحةُ البيت ← رقمُ سابقتها كما يقوله الكتاب
  const fetchPage = async (bookId, pageId) => {
    const key = `${bookId}:${pageId}`;
    if (pages.has(key)) return pages.get(key);
    let body = '';
    try {
      const r = await client.callTool('shamela_get_page', {
        book_id: bookId, page_id: pageId, response_format: 'json',
      });
      body = r?.body ?? r?.page?.body ?? '';
      const prev = r?.prev_page_id ?? r?.page?.prev_page_id ?? null;
      if (prev) prevOf.set(key, prev);
    } catch { body = ''; }
    pages.set(key, body);
    return body;
  };

  const results = [];
  for (const [i, v] of chosen.entries()) {
    const key = `${v.source.bookId}:${v.source.pageId}`;
    const body = await fetchPage(v.source.bookId, v.source.pageId);
    // ★ والنسبةُ الموروثةُ تُدقَّق في صفحتها التي جاءت منها ★ — فالكتاب يُصدِّر
    //   «وقال زفر بن الحرث» في آخر صفحةٍ ثم يسوق شعره في التالية.
    let prevBody = null;
    const inherited = ['carry', 'inherit', 'entry'].includes(v.poetSource);
    if (inherited) {
      const prevId = prevOf.get(key) ?? (v.source.pageId > 1 ? v.source.pageId - 1 : null);
      if (prevId) prevBody = await fetchPage(v.source.bookId, prevId);
    }
    const r = auditVerse(v, body, prevBody);
    results.push({ ...r, text: v.text.slice(0, 60), book: v.source.bookName, page: v.source.printedPage });
    if ((i + 1) % 10 === 0) log(`  ${ar(String(i + 1))}/${ar(String(chosen.length))}`);
  }
  client.stop();

  const report = {
    ...summarize(results),
    sampledAt: new Date().toISOString(),
    indexFile: IN,
    totalVerses: all.length,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

  log('');
  log(`★ نصُّ البيت موجودٌ في صفحته: ${ar(String(Math.round((report.textAccuracy ?? 0) * 100)))}٪`
    + ` (${ar(String(report.verbatim))} من ${ar(String(report.checked))})`);
  if (report.named) {
    log(`★ والنسبةُ مؤيَّدةٌ بمصدرها: ${ar(String(Math.round((report.poetAccuracy ?? 0) * 100)))}٪`
      + ` (${ar(String(report.poetFound))} من ${ar(String(report.named))})`);
    log(`   منها من نصّ الصفحة: ${ar(String(report.fromPage))}`
      + ` · من الصفحة السابقة (نسبةٌ موروثة): ${ar(String(report.fromPrev ?? 0))}`
      + ` · من عنوان الكتاب: ${ar(String(report.fromTitle))}`
      + ` · لم تُدقَّق: ${ar(String(report.unverifiable))}`);
  }
  log(`★ والبيتُ تامٌّ لم يُبتر منه شطر: ${ar(String(Math.round((report.completeness ?? 0) * 100)))}٪`
    + ` (${ar(String(report.checked - report.truncated))} من ${ar(String(report.checked))})`);
  if (report.truncations?.length) {
    log('');
    log('أبياتٌ يظهر أنها بُترت — وبقيّةُ سطرها في الكتاب:');
    for (const t of report.truncations.slice(0, 10)) log(`   - ${t.book} ص${t.page}: ${t.text} ← «${t.tail}»`);
  }
  if (report.failures.length) {
    log('');
    log('أبياتٌ لم يوجد نصُّها في صفحتها:');
    for (const f of report.failures.slice(0, 10)) log(`   - ${f.book} ص${f.page}: ${f.text}`);
  }
  log(`\n← ${OUT} (يُنشر مع الفهرس فيظهر رقمُه في الموقع)`);
}

main().catch((e) => { process.stderr.write(`تعذّر: ${e.message}\n`); process.exit(1); });
