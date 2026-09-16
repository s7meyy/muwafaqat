// عميل الفهرس الساكن في المتصفّح.
//
// ★ هذا ما يُغني الموقعَ عن بقاء جهاز صاحب المكتبة مفتوحًا. ★
// لا خادم ولا قاعدة: ملفاتٌ ساكنةٌ تُجلب عند الحاجة، وتُحفظ في الذاكرة لئلّا
// تُجلب مرّتين. والمتصفّح لا ينزّل الفهرس كله — شظايا كلمات بحثه وحدها.

import { searchIndex, shardName, neighborsOf } from '../../core/verse-index.js';

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
  return {
    query,
    verses: verses.map((v) => ({
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
