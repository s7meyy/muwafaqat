// عميل الفهرس الساكن في المتصفّح.
//
// ★ هذا ما يُغني الموقعَ عن بقاء جهاز صاحب المكتبة مفتوحًا. ★
// لا خادم ولا قاعدة: ملفاتٌ ساكنةٌ تُجلب عند الحاجة، وتُحفظ في الذاكرة لئلّا
// تُجلب مرّتين. والمتصفّح لا ينزّل الفهرس كله — شظايا كلمات بحثه وحدها.

import { searchIndex, shardName, neighborsOf, verseBucketOf, fromRecord } from '../../core/verse-index.js';
import { expandByMeaning } from '../../core/meaning.js';
import { imagesOf } from '../../core/imagery.js';

const BASE = 'index';
const cache = new Map();
let metaPromise = null;

/** أموجودٌ الفهرس الساكن؟ يُسأل مرّةً واحدة. */
export function indexMeta() {
  metaPromise ??= fetch(`${BASE}/meta.json`, { cache: 'force-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return metaPromise;
}

async function loadShard(kind, bucket) {
  const key = `${kind}/${bucket}`;
  if (cache.has(key)) return cache.get(key);
  const p = fetch(`${BASE}/${kind === 'tokens' ? 't' : 'v'}/${shardName(bucket)}.json`, { cache: 'force-cache' })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  cache.set(key, p);
  return p;
}

/** يبحث في الفهرس الساكن. يُرجع الشكل نفسه الذي يُرجعه الجسر. */
export async function searchStatic(query, { limit = 20, excludeVerse = null } = {}) {
  const meta = await indexMeta();
  if (!meta) {
    const e = new Error('لا فهرس ساكنٌ منشور');
    e.code = 'NO_INDEX';
    throw e;
  }

  // ★ عددُ الشظايا يُقرأ من الفهرس نفسه، لا يُفترض ثابتًا ★
  const { verses, itself, scanned } = await searchIndex(query, loadShard, {
    limit, excludeVerse: excludeVerse ?? query,
    tokenShards: meta.tokenShards, verseShards: meta.verseShards,
  });
  // ★ ما بلغه اللفظُ وحده لا يكفي: ★ التجربة أخرجت لبيت لبيدٍ في فناء الدنيا
  //   ثمانيةَ أبياتٍ جامعُها لفظُ «إلا»، وفي المكتبة «إنّما الدنيا كرؤيا ساعة».
  //   فيُوسَّع السؤالُ بإخوة ألفاظه في المعنى، وبصورته الشعرية — ولا يُختلق بيت.
  const extra = await meaningAndImagery(query, meta, new Set(verses.map((v) => v.text)));

  return {
    query,
    verses: [...verses, ...extra].map((v) => ({
      ...v,
      // ★ الفهرس مبنيٌّ من كتبٍ محقَّقة، ودليلُه أنه اُستخرج منها — لا بحثٌ حيّ
      evidence: { documentId: `index:${v.source.bookId}:${v.source.pageId}`, matched: 'index' },
      matchedQueries: [query],
      // ★ عددُ الكتب التي ورد فيها البيت يأتي من الفهرس نفسه ★ — كان يُكتب
      //   «١» دائمًا، فيضيع التعاضدُ الذي بُني وقت الفهرسة.
      occurrences: v.occurrences ?? 1,
    })),
    // ★ «بيتُك في المكتبة» — مواضعُه ورواياتُه ونسبتُه ★
    itself: (itself ?? []).map((v) => ({ ...v, evidence: { documentId: `index:${v.source.bookId}:${v.source.pageId}`, matched: 'index' } })),
    pagesRead: 0,
    rejectedCount: 0,
    fromIndex: true,
    indexMeta: { verses: meta.verses, builtAt: meta.builtAt },
    scanned,
  };
}

/**
 * موافقاتُ المعنى — محسوبةٌ يوم الفهرسة، فتأتي بلا نموذجٍ ولا مفتاحٍ ولا انتظار.
 *
 * ★ وهي الجواب عن الحدّ الذي يقف عنده البحث اللفظيّ: ★ «وما نيل المطالب
 * بالتمنّي» و«بقدر الكدّ تكتسب المعالي» لا تشترك بينهما كلمة. فلا يجمعهما
 * لفظٌ أبدًا، ويجمعهما المعنى إن كان الفهرس مبنيًّا به.
 *
 * وتُرجع [] إن لم يكن للفهرس جيرة، أو لم يُعرف بيتُ السائل فيه — ولا تُختلق.
 */
export async function semanticMatches(verse, { limit = 12 } = {}) {
  const meta = await indexMeta();
  if (!meta?.semantic) return [];
  const { verses } = await neighborsOf(verse, loadShard, {
    limit, tokenShards: meta.tokenShards, verseShards: meta.verseShards,
  });
  return verses.map((v) => ({
    ...v,
    evidence: { documentId: `index:${v.source.bookId}:${v.source.pageId}`, matched: 'index' },
    matchedQueries: ['موافقةٌ في المعنى'],
    semantic: true,
    occurrences: v.occurrences ?? 1,
  }));
}

let imageryPromise = null;

/** ★ معجمُ الصور: يُبنى يوم الفهرسة ويُجلب ملفًّا واحدًا صغيرًا. ★ */
export function imageryIndex() {
  imageryPromise ??= fetch(`${BASE}/imagery.json`, { cache: 'force-cache' })
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  return imageryPromise;
}

/** أبياتُ صورةٍ بعينها — تُجلب بأرقامها من شظايا السجلّات وحدها. */
export async function versesByIds(ids = []) {
  const meta = await indexMeta();
  if (!meta || !ids.length) return [];
  const buckets = new Map();
  for (const id of ids) {
    const b = verseBucketOf(id, meta.verseShards);
    if (!buckets.has(b)) buckets.set(b, loadShard('verses', b));
  }
  const stores = new Map();
  for (const [b, p] of buckets) stores.set(b, await p);
  const out = [];
  for (const id of ids) {
    const rec = stores.get(verseBucketOf(id, meta.verseShards))?.[id];
    if (rec) out.push(fromRecord(rec));
  }
  return out;
}

const FIELD_LIMIT = 8;
const IMAGE_LIMIT = 8;

/**
 * ★ توسيعُ السؤال: بالمعنى وبالصورة. ★
 * ولا يُدخل بيتًا من خارج الفهرس — كلُّ ما يعود منقولٌ من كتابه كما هو،
 * ويُوسَم بالطريق الذي جاء منه فيراه الباحث ويحكم عليه.
 */
async function meaningAndImagery(query, meta, seen) {
  const out = [];
  const opts = { tokenShards: meta.tokenShards, verseShards: meta.verseShards };

  // (١) حقولُ المعنى — إخوةُ اللفظ في الدلالة
  for (const { field, terms } of expandByMeaning(query)) {
    let found = [];
    try {
      ({ verses: found } = await searchIndex(terms.join(' '), loadShard, {
        ...opts, limit: FIELD_LIMIT, excludeVerse: query,
      }));
    } catch { /* شظيّةٌ لم تُجلب */ }
    for (const v of found) {
      if (seen.has(v.text)) continue;
      seen.add(v.text);
      out.push({ ...v, viaField: field, matchedQueries: [`توسيع المعنى: ${field}`] });
    }
  }

  // (٢) الصورةُ الشعرية — يُقرأ معجمُ الصور المنشور
  const wanted = new Set(imagesOf(query).map((i) => i.label));
  if (wanted.size) {
    const images = await imageryIndex();
    const ids = [];
    for (const g of images) if (wanted.has(g.label)) ids.push(...g.ids.slice(0, IMAGE_LIMIT));
    for (const v of await versesByIds([...new Set(ids)])) {
      if (seen.has(v.text)) continue;
      seen.add(v.text);
      const label = imagesOf(v.text).find((i) => wanted.has(i.label))?.label ?? null;
      out.push({ ...v, viaImage: label, matchedQueries: [`الصورة: ${label ?? ''}`] });
    }
  }
  return out;
}

let auditPromise = null;

/** ★ تقريرُ التدقيق بالعيّنة — نسبةُ خطأٍ مقيسةٌ تُنشر كما هي. ★ */
export function auditReport() {
  auditPromise ??= fetch(`${BASE}/audit.json`, { cache: 'force-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  return auditPromise;
}
