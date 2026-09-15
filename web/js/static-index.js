// عميل الفهرس الساكن في المتصفّح.
//
// ★ هذا ما يُغني الموقعَ عن بقاء جهاز صاحب المكتبة مفتوحًا. ★
// لا خادم ولا قاعدة: ملفاتٌ ساكنةٌ تُجلب عند الحاجة، وتُحفظ في الذاكرة لئلّا
// تُجلب مرّتين. والمتصفّح لا ينزّل الفهرس كله — شظايا كلمات بحثه وحدها.

import { searchIndex, shardName } from '../../core/verse-index.js';

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
export async function searchStatic(query, { limit = 20 } = {}) {
  const meta = await indexMeta();
  if (!meta) {
    const e = new Error('لا فهرس ساكنٌ منشور');
    e.code = 'NO_INDEX';
    throw e;
  }

  const { verses, scanned } = await searchIndex(query, loadShard, { limit });
  return {
    query,
    verses: verses.map((v) => ({
      ...v,
      // ★ الفهرس مبنيٌّ من كتبٍ محقَّقة، ودليلُه أنه اُستخرج منها — لا بحثٌ حيّ
      evidence: { documentId: `index:${v.source.bookId}:${v.source.pageId}`, matched: 'index' },
      matchedQueries: [query],
      occurrences: 1,
    })),
    pagesRead: 0,
    rejectedCount: 0,
    fromIndex: true,
    indexMeta: { verses: meta.verses, builtAt: meta.builtAt },
    scanned,
  };
}
