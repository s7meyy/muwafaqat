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

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') ? true : arr[i + 1]]);
  return acc;
}, []));

const IN = args.in ?? 'index/verses.jsonl';
const OUT = args.out ?? 'web/index';

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
  for (const [bucket, data] of map) {
    const file = path.join(dir, `${shardName(bucket)}.json`);
    const json = JSON.stringify(data);
    fs.writeFileSync(file, json);
    bytes += Buffer.byteLength(json);
  }
  return bytes;
}

const verses = await readVerses(IN);
const built = buildIndex(verses);

fs.mkdirSync(OUT, { recursive: true });
const tokenBytes = writeShards(path.join(OUT, 't'), built.tokens);
const verseBytes = writeShards(path.join(OUT, 'v'), built.store);
const perQuery = estimatePerQuery(built, tokenBytes, verseBytes);
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({
  ...built.meta,
  filesWritten: { tokens: built.tokens.size, verses: built.store.size },
  bytes: { tokens: tokenBytes, verses: verseBytes },
  estimatedPerQueryBytes: perQuery,
}, null, 2));

/** كم يُنزّل المتصفّح في البحث الواحد؟ الرقم الذي يهمّ المستخدم فعلًا. */
function estimatePerQuery(built, tokenBytes, verseBytes) {
  const avgToken = built.tokens.size ? tokenBytes / built.tokens.size : 0;
  const avgVerse = built.store.size ? verseBytes / built.store.size : 0;
  return Math.round(avgToken * 3 + avgVerse * 20);   // ٣ كلماتٍ و٢٠ مرشَّحًا
}

const mb = (n) => (n / 1048576).toFixed(1);
process.stdout.write(
  `فُهرس ${toArabicDigits(String(built.meta.verses))} بيتًا من ${toArabicDigits(String(verses.length))} مستخرَجًا\n`
  + `الكلمات: ${toArabicDigits(String(built.tokens.size))} شظيّة (${toArabicDigits(mb(tokenBytes))} م.ب)\n`
  + `السجلّات: ${toArabicDigits(String(built.store.size))} شظيّة (${toArabicDigits(mb(verseBytes))} م.ب)\n`
  + `المتصفّح ينزّل في البحث الواحد نحو ${toArabicDigits(String(Math.round(perQuery / 1024)))} ك.ب\n`
  + `← ${OUT}\n`);
