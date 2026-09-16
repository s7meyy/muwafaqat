#!/usr/bin/env node
// حزمُ الأبيات المستخرَجة في فهرسٍ ساكنٍ يُرفع كما هو.
//
//   node tools/pack.js --in index/verses.jsonl --out web/index
//
// يُخرج: meta.json، وشظايا الكلمات t/NNN.json، وشظايا السجلّات v/NNN.json.
// والمتصفّح لا ينزّل منها إلا ما يخصّ كلمات بحثه.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { buildIndex, shardName } from '../core/verse-index.js';
import { detectRegister } from '../core/register.js';
import { toArabicDigits } from '../core/normalize.js';
import { countLabel, SHARD, VERSE } from '../core/plural.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') ? true : arr[i + 1]]);
  return acc;
}, []));

const IN = args.in ?? 'index/verses.jsonl';
const OUT = args.out ?? 'web/index';
// جيرانُ المعنى — إن وُجد ملفُّها ضُمَّت إلى الفهرس، وإلّا بُني لفظيًّا وقيل ذلك
const NEIGHBORS = args.neighbors ?? 'index/neighbors.jsonl';

async function readVerses(file) {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  const out = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const v = JSON.parse(line);
      v.register = detectRegister(v.text).register;
      // deathYear وlifespanSource يأتيان من الاستخراج كما هما
      out.push(v);
    } catch { /* سطرٌ معطوب يُتخطّى */ }
  }
  return out;
}

function writeShards(dir, map) {
  fs.mkdirSync(dir, { recursive: true });
  let bytes = 0;
  const sizes = [];
  for (const [bucket, data] of map) {
    const file = path.join(dir, `${shardName(bucket)}.json`);
    const json = JSON.stringify(data);
    fs.writeFileSync(file, json);
    const n = Buffer.byteLength(json);
    bytes += n;
    sizes.push(n);
  }
  sizes.sort((a, b) => a - b);
  const at = (q) => sizes[Math.min(sizes.length - 1, Math.floor(sizes.length * q))] ?? 0;
  return { bytes, count: sizes.length, median: at(0.5), p95: at(0.95), max: sizes[sizes.length - 1] ?? 0 };
}

/** جيرانُ المعنى كما كتبها tools/neighbors.js — مفاتيحُها نصوصٌ مطبَّعة. */
function readNeighbors(file) {
  if (!fs.existsSync(file)) return null;
  const map = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const { key, neighbors } = JSON.parse(line);
      if (key && neighbors?.length) map.set(key, neighbors);
    } catch { /* سطرٌ معطوب يُتخطّى */ }
  }
  return map.size ? map : null;
}

const verses = await readVerses(IN);
const neighbors = readNeighbors(NEIGHBORS);
const built = buildIndex(verses, { neighbors });
// ★ نطاقُ البحث يجب أن يكون معلومًا للباحث ★ — فلا يقول «ليس في الشعر العربي»
//   وإنما «ليس فيما فُهرس». (كم كتابًا؟ وكم شاعرًا؟)
built.meta.books = new Set(verses.map((v) => v.source?.bookName).filter(Boolean)).size;
built.meta.poets = new Set(verses.map((v) => v.poet).filter(Boolean)).size;

fs.mkdirSync(OUT, { recursive: true });
const tok = writeShards(path.join(OUT, 't'), built.tokens);
const ver = writeShards(path.join(OUT, 'v'), built.store);
const tokenBytes = tok.bytes, verseBytes = ver.bytes;
// ★ كم يُنزّل المتصفّح في البحث الواحد؟ ★
//
// كان يُحسب بمتوسّط حجم الشظيّة — فأخطأ عشرين ضعفًا. والعلّة أن التوزيع شديد
// الميل: الكلمة الشائعة تُراكم قائمةَ مواضعَ ضخمة، فتنتفخ شظيّتُها وحدها،
// والمتوسّطُ لا يراها. فالتقدير الآن على ★ الشظيّة الكبيرة (٩٥٪) ★ لا على
// المتوسّط — وهو ما يلقاه المستخدم حين تقع في سؤاله كلمةٌ مطروقة.
// ★ العدد ٤٠ لا ٢٠: ★ البحث يجلب شظيّةَ سجلٍّ لكل مرشَّح، والمرشَّحون
// `limit * 2` = أربعون (انظر searchIndex). وحسبُهم عشرين كان يُنقص الرقم
// المعلَن إلى نصف ما يلقاه المستخدم فعلًا.
const CANDIDATE_SHARDS = 40;
const perQuery = {
  typical: Math.round(tok.median * 3 + ver.median * CANDIDATE_SHARDS),
  heavy: Math.round(tok.max + tok.p95 * 2 + ver.p95 * CANDIDATE_SHARDS),
};
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({
  ...built.meta,
  filesWritten: { tokens: tok.count, verses: ver.count },
  bytes: { tokens: tokenBytes, verses: verseBytes },
  shardSizes: {
    tokens: { median: tok.median, p95: tok.p95, max: tok.max },
    verses: { median: ver.median, p95: ver.p95, max: ver.max },
  },
  perQueryBytes: perQuery,
}, null, 2));

const mb = (n) => (n / 1048576).toFixed(1);
const peak = process.memoryUsage().rss;
process.stdout.write(
  `فُهرس ${countLabel(built.meta.verses, VERSE)} من ${toArabicDigits(String(verses.length))} مستخرَجًا\n`
  + `الكلمات: ${countLabel(built.tokens.size, SHARD)} (${toArabicDigits(mb(tokenBytes))} م.ب)\n`
  + `السجلّات: ${countLabel(built.store.size, SHARD)} (${toArabicDigits(mb(verseBytes))} م.ب)\n`
  + `المتصفّح ينزّل في البحث الواحد: ${toArabicDigits(String(Math.round(perQuery.typical / 1024)))} ك.ب للسؤال المعتاد،`
  + ` و${toArabicDigits(String(Math.round(perQuery.heavy / 1024)))} ك.ب إن وقعت فيه كلمةٌ مطروقة\n`
  + `أكبر شظيّة: كلمات ${toArabicDigits((tok.max / 1024).toFixed(0))} ك.ب · سجلّات ${toArabicDigits((ver.max / 1024).toFixed(0))} ك.ب\n`
  + (built.meta.cappedTokens?.length
    ? `★ ${toArabicDigits(String(built.meta.cappedTokens.length))} كلمةً مطروقةً قُصَّت قوائمُها عند `
      + `${toArabicDigits(String(built.meta.maxPostings))} موضعًا: ${built.meta.cappedTokens.slice(0, 8).join('، ')}`
      + `${built.meta.cappedTokens.length > 8 ? '…' : ''}\n`
    : '')
  + (built.meta.semantic
    ? `بالمعنى: ${toArabicDigits(String(built.meta.withNeighbors))} بيتًا له جيرةٌ محسوبة — `
      + `فالبحث بالمعنى يعمل بلا مفتاحٍ ولا شبكة\n`
    : `★ بلا جيرانِ معنًى — الفهرس لفظيٌّ وحده. شغّل tools/neighbors.js ليجد الموقعُ `
      + `«بقدر الكدّ تكتسب المعالي» لمن سأل بـ«وما نيل المطالب بالتمنّي»\n`)
  + `الذاكرة المستعملة: ${toArabicDigits(mb(peak))} م.ب\n`
  + `← ${OUT}\n`);
