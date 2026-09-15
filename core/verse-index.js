// فهرس الأبيات — الذي يُغني الموقعَ عن بقاء جهاز صاحب المكتبة مفتوحًا.
//
// الفكرة: لا نرفع المكتبة (٧٫٦ مليون صفحة)، بل ★ الأبيات وحدها ★ — سطرٌ لكل بيت
// معه كتابه وصفحته وقائله. فيصير ما يُقاس بالجيغابايت شيئًا يُقاس بالميغابايت.
//
// والفهرس ★ ساكن ★: ملفاتٌ تُرفع كما هي، بلا خادمٍ ولا قاعدة. والمتصفّح لا يُنزّل
// الفهرس كله — ينزّل الشظايا التي تخصّ كلمات بحثه وحدها.
//
// وهذا الملف يعمل في المتصفّح وفي Node بلا تغيير: لا يقرأ ملفًّا ولا يطلب شبكة،
// بل يأخذ `load` فيناديها. فالبناء والبحث يُختبران بلا قرصٍ ولا شبكة.

import { normalize, fingerprint } from './normalize.js';
import { eraOf, hijriToGregorian } from './eras.js';
import { shamelaUrl } from './trust.js';

export const INDEX_VERSION = 1;

// ★ عددان مختلفان عمدًا. ★
// شظايا الكلمات قليلةٌ لأن البحث يجلب منها واحدةً لكل كلمة (٢-٤ لكل بحث).
// وشظايا السجلّات كثيرةٌ لأن المرشَّحين العشرين يتفرّقون فيها — فلو كانت ٢٥٦
// لجلب البحث الواحد عشرين شظيّةً ضخمة، أي ميغابايتاتٍ لكل سؤال.
// وتكثيرُها يُصغّر كلَّ واحدةٍ فيصير الجلبُ كيلوباياتٍ معدودة.
//
// والأرقام قيست لا خُمّنت: ٣٥٧ بايتًا لكل بيت. فعند نصف مليون بيت يصير الفهرس
// ١٧٠ ميغابايت كاملًا — لكن البحث الواحد لا ينزّل منه إلا ٢٣٠ ك.ب تقريبًا،
// وهذا هو الرقم الذي يهمّ من يفتح الموقع.
export const TOKEN_SHARDS = 2048;
export const VERSE_SHARDS = 16384;
export const SHARDS = TOKEN_SHARDS;   // للتوافق

// كلماتٌ لا تُفهرس: تقع في كل بيتٍ فلا تميّز شيئًا، وتُضخّم الفهرس بلا فائدة
const NOT_INDEXED = new Set([
  'من', 'في', 'علي', 'عن', 'الي', 'ما', 'لا', 'ان', 'قد', 'هذا', 'هذه', 'ذلك',
  'التي', 'الذي', 'كان', 'كل', 'بين', 'مع', 'او', 'ثم', 'لم', 'لن', 'هو', 'هي',
  'به', 'له', 'بها', 'وما', 'ولا', 'يا', 'ولو', 'اذا', 'كما', 'حتي', 'لكن', 'بل',
]);

const MIN_TOKEN = 3;

// سوابقُ العربية الملتصقة. «بالتمني» و«التمني» و«تمنّي» كلمةٌ واحدةٌ في البحث،
// وبحثُ الشاملة يجرّدها بالتحليل الصرفي — والفهرس الساكن لا محلّل معه.
// ★ فنفهرس الصورة كما وردت ومجرّدةً معًا، ونجرّد كلمة البحث كذلك، فيلتقيان. ★
// (بلا هذا كان «التمني» لا يجد «بالتمني» — وهما في البيت نفسه.)
const PREFIXES = ['وبال', 'فبال', 'بال', 'كال', 'فال', 'وال', 'لل', 'ال', 'و', 'ف', 'ب', 'ك', 'ل'];

function stripPrefixes(word) {
  for (const p of PREFIXES) {
    if (word.length > p.length + MIN_TOKEN - 1 && word.startsWith(p)) return word.slice(p.length);
  }
  return word;
}

/** بصمةٌ ثابتةٌ للكلمة ← رقم شظيّتها. ثابتةٌ عبر اللغات والأنظمة. */
export function bucketOf(token) {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % TOKEN_SHARDS;
}

export function shardName(bucket) {
  return String(bucket).padStart(5, '0');
}

/** كلماتُ البيت التي تدخل الفهرس. */
export function indexTokens(text) {
  const seen = new Set();
  for (const w of normalize(text).split(' ')) {
    if (w.length < MIN_TOKEN || NOT_INDEXED.has(w)) continue;
    seen.add(w);
    const bare = stripPrefixes(w);
    if (bare !== w && bare.length >= MIN_TOKEN && !NOT_INDEXED.has(bare)) seen.add(bare);
  }
  return [...seen];
}

/** سجلُّ البيت في الفهرس — مفاتيحُه قصيرةٌ عمدًا، فالحجم يُضرب في مئات الألوف. */
export function toRecord(verse, id) {
  const s = verse.source ?? {};
  return {
    i: id,
    t: verse.text,
    p: verse.poet ?? null,
    d: verse.deathYear ?? null,
    b: s.bookName ?? null,
    g: s.printedPage ?? null,
    k: s.bookId ?? null,
    q: s.pageId ?? null,
    c: s.category ?? null,
    r: verse.register === 'nabati' ? 1 : 0,
    l: verse.lifespanSource?.label ?? null,   // من أين جاءت سنة الوفاة
  };
}

/**
 * يعيد السجلّ إلى الشكل الذي تعرفه بقية البرنامج.
 * ★ العصر والميلاديّ والرابط تُشتقّ هنا لا تُخزَّن ★ — فهي محسوبةٌ من سنة
 * الوفاة ورقمَي الكتاب والصفحة، وتخزينُها يُضخّم الفهرس بلا فائدة.
 */
export function fromRecord(rec) {
  const death = rec.d ?? null;
  return {
    text: rec.t,
    sadr: String(rec.t).split(' ... ')[0] ?? rec.t,
    ajz: String(rec.t).split(' ... ')[1] ?? '',
    poet: rec.p ?? null,
    deathYear: death,
    deathYearGregorian: death ? hijriToGregorian(death) : null,
    era: eraOf(death),
    lifespanSource: rec.l ? { kind: 'index', label: rec.l } : null,
    register: rec.r ? 'nabati' : 'fasih',
    source: {
      kind: 'index',
      trust: 'documented',          // الفهرس مبنيٌّ من كتبٍ محقَّقة
      bookName: rec.b ?? null,
      printedPage: rec.g ?? null,
      bookId: rec.k ?? null,
      pageId: rec.q ?? null,
      category: rec.c ?? null,
      url: shamelaUrl(rec.k, rec.q),
      urlNote: 'رابطٌ إلى الشاملة على الشبكة — يقطع بالكتاب ويقارب في الصفحة.',
    },
  };
}

/**
 * يبني الفهرس في الذاكرة من أبياتٍ مستخرَجة.
 * يُرجع { meta, tokens: Map<bucket, {token: [ids]}>, verses: Map<bucket, {id: record}> }
 */
export function buildIndex(verses) {
  const tokens = new Map();
  const store = new Map();
  let id = 0;
  const seen = new Set();

  for (const v of verses) {
    const key = normalize(v.text);
    if (!key || seen.has(key)) continue;    // المكرَّر لا يُفهرس مرّتين
    seen.add(key);

    const rec = toRecord(v, ++id);
    const vb = verseBucketOf(id);
    if (!store.has(vb)) store.set(vb, {});
    store.get(vb)[id] = rec;

    for (const tok of indexTokens(v.text)) {
      const b = bucketOf(tok);
      if (!tokens.has(b)) tokens.set(b, {});
      const bucket = tokens.get(b);
      (bucket[tok] ??= []).push(id);
    }
  }

  return {
    meta: {
      version: INDEX_VERSION, verses: id, builtAt: new Date().toISOString(),
      tokenShards: TOKEN_SHARDS, verseShards: VERSE_SHARDS,
    },
    tokens, store,
  };
}

/** شظيّة السجلّ تُشتقّ من رقمه — فلا حاجة إلى جدولٍ يدلّ عليها. */
export function verseBucketOf(id) {
  return id % VERSE_SHARDS;
}

/**
 * البحث في الفهرس.
 * `load(kind, bucket)` تُعطى من الخارج: في المتصفّح تجلب ملفًّا، وفي الاختبار
 * تقرأ من الذاكرة. فالبحث نفسه لا يعرف شيئًا عن الشبكة ولا القرص.
 *
 * `proximity` يحاكي بحث الشاملة بالتقارب: لا يكفي وقوعُ الكلمات في البيت،
 * بل تقارُبُها فيه — والبيت قصيرٌ أصلًا، فهو قيدٌ لطيف.
 */
export async function searchIndex(query, load, { limit = 20, proximity = 12, excludeVerse = null } = {}) {
  // ★ البيت الذي سألتَ به ليس موافقةً له. ★ كان الفهرس يُعيده جوابًا لنفسه.
  const excludeFp = excludeVerse ? fingerprint(excludeVerse) : null;
  const terms = indexTokens(query);
  if (!terms.length) return { verses: [], terms: [], scanned: 0 };

  // (١) نجلب شظايا الكلمات المطلوبة وحدها — لا الفهرس كلّه
  const postings = [];
  const buckets = new Map();
  for (const t of terms) {
    const b = bucketOf(t);
    if (!buckets.has(b)) buckets.set(b, load('tokens', b));
  }
  const loaded = new Map();
  for (const [b, p] of buckets) loaded.set(b, await p);

  for (const t of terms) {
    const bucket = loaded.get(bucketOf(t));
    postings.push({ term: t, ids: bucket?.[t] ?? [] });
  }

  // (٢) البيت الذي فيه أكثرُ الكلمات أولى. ولا نشترط اجتماعها كلها:
  //     الروايات تختلف في كلمة، والاشتراط يُسقط البيت الصحيح.
  const counts = new Map();
  for (const p of postings) for (const id of p.ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  if (!counts.size) return { verses: [], terms, scanned: 0 };

  const need = Math.max(1, Math.min(terms.length, terms.length - 1));
  // ★ نقتصر على ضعف المطلوب: كلُّ مرشَّحٍ يكلّف شظيّةً تُجلب، ★
  //   والتقارب يُسقط بعضهم فنترك هامشًا ولا نُسرف.
  const candidates = [...counts.entries()]
    .filter(([, c]) => c >= need)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit * 2);

  // (٣) نجلب شظايا السجلّات ثم نتحقّق من التقارب على النصّ نفسه
  const verseBuckets = new Map();
  for (const [id] of candidates) {
    const b = verseBucketOf(id);
    if (!verseBuckets.has(b)) verseBuckets.set(b, load('verses', b));
  }
  const stores = new Map();
  for (const [b, p] of verseBuckets) stores.set(b, await p);

  const out = [];
  for (const [id, hits] of candidates) {
    const rec = stores.get(verseBucketOf(id))?.[id];
    if (!rec) continue;
    if (excludeFp && fingerprint(rec.t) === excludeFp) continue;
    if (!withinProximity(rec.t, terms, proximity)) continue;
    out.push({ ...fromRecord(rec), matchedTerms: hits });
    if (out.length >= limit) break;
  }

  return { verses: out, terms, scanned: candidates.length };
}

/** أتقع كلماتُ البحث متقاربةً في البيت؟ */
export function withinProximity(text, terms, distance) {
  const words = normalize(text).split(' ');
  const bare = words.map(stripPrefixes);
  const find = (t) => {
    const i = words.indexOf(t);
    if (i !== -1) return i;
    const j = bare.indexOf(stripPrefixes(t));
    return j;
  };
  const positions = terms.map(find).filter((i) => i !== -1);
  if (positions.length < 2) return positions.length >= 1;
  return Math.max(...positions) - Math.min(...positions) <= distance;
}
