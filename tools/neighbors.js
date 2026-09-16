#!/usr/bin/env node
// حسابُ جيران المعنى — يُشغَّل مرّةً بعد الاستخراج وقبل التحزيم.
//
//   node tools/neighbors.js --in index/verses.jsonl --out index/neighbors.jsonl
//
// ★ ولمَ يُحسب هنا لا وقت السؤال: ★ لأن السائل لا يملك مفتاحًا، ولأن الموقع
// ساكنٌ لا خادمَ خلفه. فالثمن يُدفع مرّةً على جهاز صاحب المكتبة، ثم يبحث
// الناسُ بالمعنى مجّانًا إلى الأبد.
//
// ★ وهو يُستأنف: ★ المتجهات تُكتب أوّلًا بأوّل، فإن انقطع (أو نفد حدُّ المفتاح
// المجانيّ) استُؤنف من حيث وقف ولم يُدفع ثمنُ ما دُفع.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { embed, embeddingsAvailable, embeddingsProvider } from '../bridge/providers/embeddings.js';
import { buildNeighbors, MIN_SIMILARITY } from '../core/neighbors.js';
import { normalize, toArabicDigits as ar } from '../core/normalize.js';

const args = parseArgs(process.argv.slice(2));
const IN = args.in ?? 'index/verses.jsonl';
const OUT = args.out ?? 'index/neighbors.jsonl';
const VECTORS = args.vectors ?? (OUT + '.vectors.jsonl');
const BATCH = Number(args.batch ?? 64);
const TOP_K = Number(args.topK ?? 12);

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

/** أبياتُ الملف بلا تكرار — المتجه يُحسب للنصّ لا للورود. */
async function readVerses(file) {
  const seen = new Set();
  const out = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let v;
    try { v = JSON.parse(line); } catch { continue; }
    const key = normalize(v.text ?? '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, text: v.text });
  }
  return out;
}

/** ما حُسب متجهُه في تشغيلٍ سابق — فلا يُعاد حسابه ولا يُدفع ثمنُه مرّتين. */
function loadVectors(file) {
  const out = new Map();
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const { k, v } = JSON.parse(line);
      if (k && Array.isArray(v)) out.set(k, v);
    } catch { /* سطرٌ نصفُه مكتوبٌ حين انقطع التشغيل — يُهمل ويُعاد حسابه */ }
  }
  return out;
}

async function main() {
  if (!fs.existsSync(IN)) throw new Error(`لا ملفَّ أبياتٍ في ${IN} — شغّل tools/extract.js أولًا`);
  if (!embeddingsAvailable(process.env)) {
    throw new Error('لا مفتاحَ تضمينات. اضبط GEMINI_API_KEY أو JINA_API_KEY — '
      + 'وكلاهما له طبقةٌ مجانية تكفي لفهرسةٍ تُشغَّل مرّة.');
  }

  const verses = await readVerses(IN);
  const have = loadVectors(VECTORS);
  const todo = verses.filter((v) => !have.has(v.key));
  log(`أبياتٌ بلا تكرار: ${ar(String(verses.length))} · محسوبٌ سلفًا: ${ar(String(have.size))}`
    + ` · بقي: ${ar(String(todo.length))} · المزوّد: ${embeddingsProvider(process.env)}`);

  fs.mkdirSync(path.dirname(VECTORS), { recursive: true });
  const sink = fs.createWriteStream(VECTORS, { flags: 'a' });
  let failed = 0;

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const vectors = await embed(batch.map((b) => b.text), process.env);
    for (const b of batch) {
      const v = vectors.get(b.text);
      // ★ ما تعذّر متجهُه يُترك ولا يُختلق له متجه ★ — بيتٌ بلا جيرةٍ أصدق
      //   من بيتٍ له جيرةٌ مبنيّةٌ على صفر.
      if (!v) { failed++; continue; }
      have.set(b.key, v);
      sink.write(JSON.stringify({ k: b.key, v }) + '\n');
    }
    log(`  ${ar(String(Math.min(i + BATCH, todo.length)))}/${ar(String(todo.length))}`);
  }
  await new Promise((r) => sink.end(r));
  if (failed) log(`★ ${ar(String(failed))} بيتًا تعذّر متجهُه، فلا جيرةَ له`);

  const items = verses.filter((v) => have.has(v.key)).map((v) => ({ id: v.key, vector: have.get(v.key) }));
  log(`يُحسب الجيران لـ${ar(String(items.length))} بيتًا…`);
  const neighbors = buildNeighbors(items, { topK: TOP_K });

  const byKey = new Map(verses.map((v) => [v.key, v.text]));
  const out = fs.createWriteStream(OUT);
  let written = 0;
  for (const [key, list] of neighbors) {
    out.write(JSON.stringify({
      key, text: byKey.get(key),
      neighbors: list.map((n) => ({ text: byKey.get(n.id), sim: Number(n.sim.toFixed(3)) })),
    }) + '\n');
    written++;
  }
  await new Promise((r) => out.end(r));

  log(`تمّ. ${ar(String(written))} بيتًا له جيرةٌ في المعنى (الحدّ ${String(MIN_SIMILARITY)}) ← ${OUT}`);
  log(`وبقي ${ar(String(items.length - written))} بيتًا لم يُوجد له موافقٌ في المكتبة — وهذا خبرٌ لا عيب.`);
}

main().catch((e) => { process.stderr.write(`تعذّر: ${e.message}\n`); process.exit(1); });
