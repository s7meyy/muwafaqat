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
export const TOKEN_SHARDS = 2048;     // الحدّ الأعلى
export const VERSE_SHARDS = 16384;    // الحدّ الأعلى
export const SHARDS = TOKEN_SHARDS;   // للتوافق

// ★ عددُ الشظايا يتبع حجم الفهرس، لا يكون ثابتًا. ★
//
// فهرسٌ فيه خمسون بيتًا كان يُكتب في ١٨٤٣٣ ملفًا — ملفٌ لكل بيتٍ وأكثر. وذاك
// عبثٌ في الرفع والنشر (وبعض المستضيفات تحدّ عدد الملفات)، ولا يُسرّع شيئًا.
// والمقصود من التقسيم أن تصغر الشظيّة لا أن يكثر الملف، فنقسم على قدر ما
// يجعل في الشظيّة نحوَ خمسين سجلًّا، ثم نقف عند الحدّ الأعلى.
// ★ العددان مقيسان لا مخمَّنان. ★
// خمسون سجلًّا في الشظيّة جعلها ٩٫٥ ك.ب على بياناتٍ واقعية، والبحثُ يجلب أربعين
// شظيّة — أي ٣٨٠ ك.ب لكل سؤال. فخُفِّضت إلى خمسةٍ وعشرين: الشظيّة نحو ٥ ك.ب،
// والسؤال نحو ١٩٠ ك.ب، وثمنُ ذلك ضِعفُ عدد الملفات — وهو أهونُ من ضِعف التنزيل.
const PER_VERSE_SHARD = 25;
const PER_TOKEN_SHARD = 400;

function fitShards(count, per, max) {
  const wanted = Math.max(1, Math.ceil(count / per));
  let n = 16;
  while (n < wanted && n < max) n *= 2;
  return Math.min(n, max);
}

// كلماتٌ لا تُفهرس: تقع في كل بيتٍ فلا تميّز شيئًا، وتُضخّم الفهرس بلا فائدة
export const NOT_INDEXED = new Set([
  'من', 'في', 'علي', 'عن', 'الي', 'ما', 'لا', 'ان', 'قد', 'هذا', 'هذه', 'ذلك',
  'التي', 'الذي', 'كان', 'كل', 'بين', 'مع', 'او', 'ثم', 'لم', 'لن', 'هو', 'هي',
  'به', 'له', 'بها', 'وما', 'ولا', 'يا', 'ولو', 'اذا', 'كما', 'حتي', 'لكن', 'بل',
  // حروفٌ ثنائيةٌ زِيدت حين نزل الحدُّ إلى حرفين
  'مذ', 'اذ', 'كم', 'ثم', 'اي', 'فا', 'وا', 'لي', 'لك', 'بك', 'بي', 'هم', 'هن',
  'كل', 'قد', 'ان', 'او', 'لم', 'لن', 'في', 'من', 'عن', 'ما', 'لا', 'هو', 'هي',
]);

// ★ وحرفان يكفيان. ★ كان الحدُّ ثلاثةً، فسقط من الفهرس «داء» (تُطبَّع «دا»)
//   و«دم» و«يد» و«فم» — وهي ألفاظُ معانٍ لا حروفُ مبانٍ. وقد ظهر في تجربةٍ
//   حقيقية: بُحث عن معنى «الصحة داء» فلم يُوجد «وحسبك داءٌ أن تصحَّ وتسلما»
//   لأن «داء» لم تدخل الفهرس أصلًا. والحروفُ والضمائرُ مردودةٌ بقائمةٍ صريحة.
const MIN_TOKEN = 2;

// ★ حدٌّ لقائمة مواضع الكلمة. ★
//
// الكلمة المطروقة تُراكم عشرات الألوف من المواضع، فتنتفخ شظيّتُها وحدها حتى
// تبلغ الميغابايت — وقياسٌ على مئتَي ألف بيتٍ أخرج شظيّةً واحدةً بـ١٫٢ م.ب،
// ينزّلها المتصفّح كاملةً لأن كلمةً مطروقةً وقعت في السؤال.
//
// وهي لا تميّز شيئًا أصلًا: كلمةٌ في خُمس الأبيات لا تدلّ على موافقة. فنُبقي
// منها قدرًا يكفي للترشيح، ★ ونعلم أنها قُصّت ★ فيُقال في البيانات لا يُكتم.
const MAX_POSTINGS = 3000;

// سوابقُ العربية الملتصقة. «بالتمني» و«التمني» و«تمنّي» كلمةٌ واحدةٌ في البحث،
// وبحثُ الشاملة يجرّدها بالتحليل الصرفي — والفهرس الساكن لا محلّل معه.
// ★ فنفهرس الصورة كما وردت ومجرّدةً معًا، ونجرّد كلمة البحث كذلك، فيلتقيان. ★
// (بلا هذا كان «التمني» لا يجد «بالتمني» — وهما في البيت نفسه.)
const PREFIXES = ['وبال', 'فبال', 'بال', 'كال', 'فال', 'وال', 'لل', 'ال', 'و', 'ف', 'ب', 'ك', 'ل'];

// ★ ولا يُجرَّد إلا ما بقي منه أربعةُ أحرفٍ فأكثر. ★
// «المنى» لو جُرِّدت صارت «منى»، فطابقت «منّي» — وهما كلمتان لا تجمعهما صلة.
// والتجريدُ بلا تحليلٍ صرفيّ يُصيب في الطويل ويخطئ في القصير، فيُقصر عليه.
const MIN_BARE = 4;

export function stripPrefixes(word) {
  for (const p of PREFIXES) {
    if (word.startsWith(p) && word.length - p.length >= MIN_BARE) return word.slice(p.length);
  }
  return word;
}

// ★ واللواحقُ كالسوابق: ★ ضمائرُ الملك تلتصق بآخر الكلمة فتمنع المطابقة.
//   جولةُ تجربةٍ حقيقية: سُئل بـ«مضى الشباب» فلم يجد «ويأبى لي ★شبابي★ ما
//   يعود» — وهما كلمةٌ واحدة. والفرقُ لاحقةُ ملكٍ حرفٌ واحد.
const SUFFIXES = ['هما', 'كما', 'هن', 'كن', 'هم', 'كم', 'نا', 'ها', 'ه', 'ي', 'ك'];

/** يُجرَّد الملحقُ إن بقي من الكلمة أربعةُ أحرفٍ فأكثر. */
export function stripSuffixes(word) {
  for (const x of SUFFIXES) {
    if (word.endsWith(x) && word.length - x.length >= MIN_BARE) return word.slice(0, -x.length);
  }
  return word;
}

/** صورةُ الكلمة المجرَّدة من سوابقها ولواحقها معًا. */
export function bareForm(word) {
  return stripSuffixes(stripPrefixes(word));
}

/** بصمةٌ ثابتةٌ للكلمة ← رقم شظيّتها. ثابتةٌ عبر اللغات والأنظمة. */
export function bucketOf(token, shards = TOKEN_SHARDS) {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % shards;
}

export function shardName(bucket) {
  return String(bucket).padStart(5, '0');
}

/** كلماتُ البيت التي تدخل الفهرس. */
export function indexTokens(text) {
  return queryGroups(text).flatMap((g) => g.forms);
}

/**
 * كلماتُ السؤال مجموعةً بأصلها: كل كلمةٍ وصيغتاها (كما وردت ومجرَّدةً).
 *
 * ★ ولمَ الجمع: ★ تجريدُ السوابق يضاعف عدد الكلمات، فـ«التمني الأماني»
 * تصير أربعَ كلمات. وشرطُ «تطابق كلّها إلا واحدة» إن حُسب على الأربع صار
 * يطلب ثلاثًا — والبيت الذي فيه «بالتمني» يطابق صيغتين فقط فيسقط.
 * فكان البحث يعود صفرًا على فهرسٍ فيه البيت المطلوب. والعدّ يجب أن يقع
 * على ما سُئل عنه لا على ما تفرّع منه.
 */
export function queryGroups(text) {
  const groups = [];
  const seenWords = new Set();
  for (const w of normalize(text).split(' ')) {
    if (w.length < MIN_TOKEN || NOT_INDEXED.has(w) || seenWords.has(w)) continue;
    seenWords.add(w);
    const forms = [w];
    for (const bare of [stripPrefixes(w), bareForm(w)]) {
      if (bare !== w && !forms.includes(bare) && bare.length >= MIN_BARE && !NOT_INDEXED.has(bare)) {
        forms.push(bare);
      }
    }
    groups.push({ word: w, forms });
  }
  return groups;
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
    // ★ الإحالة العلمية تبدأ بالمؤلّف ★ — والباحث ينسخها كما هي إلى حاشيته
    a: s.bookAuthor ?? null,
    // أترقيمُ الصفحة من المطبوع أم من الشاملة آليًّا؟ فرقٌ يهمّ من يُحيل
    u: s.autoNumbered ? 1 : 0,
    g: s.printedPage ?? null,
    k: s.bookId ?? null,
    q: s.pageId ?? null,
    c: s.category ?? null,
    r: verse.register === 'nabati' ? 1 : 0,
    // ★ حكمُ المحقّق بالشكّ في البيت ★ — معقوفتان تُطبقان على البيت كلِّه
    w: verse.doubted ? 1 : 0,
    // بيتٌ مشطور (أرجوزة): شطرٌ واحدٌ تامّ، لا بيتٌ نقص عجزُه
    s: verse.mashtur ? 1 : 0,
    // شاهدٌ نُقل كما ورد في النثر، بلا فصلٍ بين شطريه
    e: verse.unsplit ? 1 : 0,
    // ★ ما كتبه الكتاب نفسه: بحرُ القصيدة وغرضُها ومناسبتُها ★ — لا تخمين
    z: verse.meter ?? null,
    j: verse.purpose ?? null,
    o: verse.occasion ?? null,
    // شرحُ الغريب من حاشية المحقّق، وروايتُه الأخرى
    f: verse.glosses?.length ? verse.glosses.map((g) => [g.word, g.gloss]) : null,
    v: verse.variant ?? null,
    l: verse.lifespanSource?.label ?? null,   // من أين جاءت سنة الوفاة
    // n: عددُ الكتب التي ورد فيها · x: أسماءٌ أخرى نُسب إليها · y: كتبٌ أخرى
    // تُضاف عند التكرار وحده، فلا تزيد حجمَ البيت الذي ورد مرّةً واحدة.
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
    doubted: Boolean(rec.w),
    mashtur: Boolean(rec.s),
    unsplit: Boolean(rec.e),
    meter: rec.z ?? null,
    meterSource: rec.z ? 'book' : null,
    purpose: rec.j ?? null,
    occasion: rec.o ?? null,
    glosses: rec.f?.map(([word, gloss]) => ({ word, gloss })) ?? null,
    variant: rec.v ?? null,
    // ★ ورودُ البيت في كتبٍ عدّة خبرٌ عنه لا تكرارٌ يُطرح. ★
    occurrences: rec.n ?? 1,
    // أرقامُ الأبيات الموافقة في المعنى، محسوبةً يوم الفهرسة
    neighborIds: rec.m?.map(([id, sim]) => ({ id, sim: sim / 100 })) ?? null,
    // ★ ولا يُرجَّح عند الاختلاف: يُعرض القولان. ★
    disputedPoets: rec.x?.length ? [rec.p, ...rec.x].filter(Boolean) : null,
    alsoIn: rec.y ?? null,
    source: {
      kind: 'index',
      trust: 'documented',          // الفهرس مبنيٌّ من كتبٍ محقَّقة
      bookName: rec.b ?? null,
      bookAuthor: rec.a ?? null,
      autoNumbered: Boolean(rec.u),
      printedPage: rec.g ?? null,
      bookId: rec.k ?? null,
      pageId: rec.q ?? null,
      category: rec.c ?? null,
      url: shamelaUrl(rec.k, rec.q),
      urlNote: 'رابطٌ إلى الشاملة على الشبكة — يقطع بالكتاب ويقارب في الصفحة.',
    },
  };
}

// أكثرُ ما يُحتفظ به من الكتب الأخرى لبيتٍ واحد — الغرض إظهارُ التعاضد لا سردُ
// كلّ موضعٍ ورد فيه، وسردُها كلِّها يُضخّم الفهرس بما لا يُقرأ.
const MAX_ALSO_IN = 4;

/** يضمّ ورودًا آخر للبيت نفسه إلى سجلّه: عددًا، ونسبةً، وكتبًا. */
function mergeOccurrence(rec, v) {
  rec.n = (rec.n ?? 1) + 1;

  const poet = v.poet ?? null;
  if (poet) {
    if (!rec.p) {
      // ★ النسبة تُكسَب ولا تُفقَد: ★ كتابٌ سمّى قائله وآخرُ سكت عنه،
      //   فالمسمِّي أولى — وكان السكوتُ يغلب لأنه سبق.
      rec.p = poet;
      rec.d = v.deathYear ?? rec.d;
      rec.l = v.lifespanSource?.label ?? rec.l;
    } else if (normalize(poet) !== normalize(rec.p)) {
      rec.x ??= [];
      if (!rec.x.some((o) => normalize(o) === normalize(poet))) rec.x.push(poet);
    }
  }

  // ★ ما سكت عنه الأوّلُ يُؤخذ من الثاني. ★
  //   نسخةٌ من «شرح الفارضي» بلا بحرٍ ولا شرحٍ، ونسخةٌ من ديوان صاحبه فيها
  //   بحرُ القصيدة وغرضُها وشرحُ غريبها — وكان الفهرس يُبقي الأولى ويطرح
  //   الثانية، فيضيع ما لا يُعوَّض. والنقصُ يُملأ ولا يُبدَّل الموجود.
  if (!rec.z && v.meter) rec.z = v.meter;
  if (!rec.j && v.purpose) rec.j = v.purpose;
  if (!rec.o && v.occasion) rec.o = v.occasion;
  if (!rec.v && v.variant) rec.v = v.variant;
  if (!rec.f?.length && v.glosses?.length) rec.f = v.glosses.map((g) => [g.word, g.gloss]);

  const book = v.source?.bookName;
  if (book) {
    rec.y ??= [];
    if (rec.y.length < MAX_ALSO_IN && book !== rec.b && !rec.y.includes(book)) rec.y.push(book);
  }
}

/**
 * يبني الفهرس في الذاكرة من أبياتٍ مستخرَجة.
 * يُرجع { meta, tokens: Map<bucket, {token: [ids]}>, verses: Map<bucket, {id: record}> }
 */
export function buildIndex(verses, opts = {}) {
  // جيرانُ المعنى محسوبةٌ سلفًا: Map<نصّ البيت المطبَّع, [{ text, sim }]>
  const neighbors = opts.neighbors ?? null;
  const n = verses.length;
  const verseShards = opts.verseShards ?? fitShards(n, PER_VERSE_SHARD, VERSE_SHARDS);
  const tokenShards = opts.tokenShards ?? fitShards(n, PER_TOKEN_SHARD, TOKEN_SHARDS);

  const tokens = new Map();
  const store = new Map();
  const capped = new Set();
  let id = 0;
  const seen = new Map();   // نصُّ البيت المطبَّع ← سجلُّه، لضمّ ما تكرّر إليه

  for (const v of verses) {
    const key = normalize(v.text);
    if (!key) continue;

    // ★ البيت الوارد في كتبٍ عدّة لا يُطرح ثانيه. ★
    //   كان الفهرس يُبقي أوّل نسخةٍ صادفها ويُهمل ما بعدها — فيُفقد أمران:
    //   (أ) التعاضد: بيتٌ في «الأغاني» و«خزانة الأدب» و«الحماسة» أوثق من بيتٍ
    //       في كتابٍ واحد، والقارئ لا يرى ذلك.
    //   (ب) الخلاف في النسبة: كتابٌ ينسبه لجرير وآخر للفرزدق — فيُعرض قولُ
    //       الأسبقِ ورودًا وحده كأنه إجماع. وكثيرٌ من الشعر مختلَفٌ في قائله.
    //   وكان فيه ظلمٌ ثالث: إن ورد أوّلًا في كتابٍ لم يُعرف فيه قائله، ضاعت
    //   نسبتُه المذكورة في الكتاب الآخر.
    const prior = seen.get(key);
    if (prior) {
      mergeOccurrence(prior, v);
      continue;
    }

    const rec = toRecord(v, ++id);
    seen.set(key, rec);
    const vb = verseBucketOf(id, verseShards);
    if (!store.has(vb)) store.set(vb, {});
    store.get(vb)[id] = rec;

    for (const tok of indexTokens(v.text)) {
      const b = bucketOf(tok, tokenShards);
      if (!tokens.has(b)) tokens.set(b, {});
      const bucket = tokens.get(b);
      const list = (bucket[tok] ??= []);
      if (list.length < MAX_POSTINGS) list.push(id);
      else capped.add(tok);
    }
  }

  // ★ الجيرة تُكتب بأرقام السجلّات لا بنصوصها ★ — والأرقام لا تُعرف إلا بعد
  //   المرور على الأبيات كلها، فتُملأ الآن.
  let withNeighbors = 0;
  if (neighbors) {
    const idOf = new Map();
    for (const [key, rec] of seen) idOf.set(key, rec.i);
    for (const [key, rec] of seen) {
      const list = (neighbors.get(key) ?? [])
        .map((nb) => [idOf.get(normalize(nb.text)), Math.round(nb.sim * 100)])
        .filter(([nid]) => nid && nid !== rec.i);
      if (list.length) { rec.m = list; withNeighbors++; }
    }
  }

  return {
    meta: {
      version: INDEX_VERSION, verses: id, builtAt: new Date().toISOString(),
      // ★ يُقال في الفهرس أبُني بالمعنى أم باللفظ وحده ★ — فالموقع يُخبر به قارئه
      semantic: Boolean(neighbors), withNeighbors,
      tokenShards, verseShards,
      maxPostings: MAX_POSTINGS,
      // كلماتٌ بلغت الحدّ فقُصَّت قوائمُها — بحثٌ بها وحدها لا يستوعب كلَّ ما في الفهرس
      cappedTokens: [...capped].sort(),
    },
    tokens, store,
  };
}

/** شظيّة السجلّ تُشتقّ من رقمه — فلا حاجة إلى جدولٍ يدلّ عليها. */
export function verseBucketOf(id, shards = VERSE_SHARDS) {
  return id % shards;
}

/**
 * البحث في الفهرس.
 * `load(kind, bucket)` تُعطى من الخارج: في المتصفّح تجلب ملفًّا، وفي الاختبار
 * تقرأ من الذاكرة. فالبحث نفسه لا يعرف شيئًا عن الشبكة ولا القرص.
 *
 * `proximity` يحاكي بحث الشاملة بالتقارب: لا يكفي وقوعُ الكلمات في البيت،
 * بل تقارُبُها فيه — والبيت قصيرٌ أصلًا، فهو قيدٌ لطيف.
 */
export async function searchIndex(query, load, {
  limit = 20, proximity = 12, excludeVerse = null,
  tokenShards = TOKEN_SHARDS, verseShards = VERSE_SHARDS,
} = {}) {
  // ★ البيت الذي سألتَ به ليس موافقةً له. ★
  //
  // والمقارنةُ بالتطابق التامّ لا تكفي: المستخدم يلصق شطرًا أو بيتًا ناقصًا أو
  // روايةً فيها كلمةٌ زائدة، فتختلف البصمتان ويعود إليه بيتُه جوابًا لنفسه.
  // (سُئل بـ«ترى الناس ما سرنا يسيرون خلفنا» فكانت النتيجة الأولى البيت نفسه.)
  // فالاستبعاد بالاحتواء: ما احتوى السؤالَ أو احتواه السؤالُ فهو هو.
  const excludeFp = excludeVerse ? fingerprint(excludeVerse) : null;
  const isSameVerse = (text) => {
    if (!excludeFp) return false;
    const fp = fingerprint(text);
    if (fp === excludeFp) return true;
    const [a, b] = fp.length >= excludeFp.length ? [fp, excludeFp] : [excludeFp, fp];
    return b.length >= 12 && a.includes(b);   // شطرٌ كاملٌ على الأقل، لا كلمة
  };
  const groups = queryGroups(query);
  const terms = groups.flatMap((g) => g.forms);
  if (!groups.length) return { verses: [], terms: [], scanned: 0 };

  // (١) نجلب شظايا الكلمات المطلوبة وحدها — لا الفهرس كلّه
  const postings = [];
  const buckets = new Map();
  for (const t of terms) {
    const b = bucketOf(t, tokenShards);
    if (!buckets.has(b)) buckets.set(b, load('tokens', b));
  }
  const loaded = new Map();
  for (const [b, p] of buckets) loaded.set(b, await p);

  for (const t of terms) {
    const bucket = loaded.get(bucketOf(t, tokenShards));
    postings.push({ term: t, ids: bucket?.[t] ?? [] });
  }

  // (٢) البيت الذي فيه أكثرُ كلمات السؤال أولى. ولا نشترط اجتماعها كلها:
  //     الروايات تختلف في كلمة، والاشتراط يُسقط البيت الصحيح.
  //     ★ والعدُّ على الكلمة الأصل: صيغتاها (كما وردت ومجرَّدةً) كلمةٌ واحدة. ★
  const byWord = new Map(postings.map((p) => [p.term, p.ids]));
  const counts = new Map();
  for (const g of groups) {
    const hits = new Set();
    for (const f of g.forms) for (const id of byWord.get(f) ?? []) hits.add(id);
    for (const id of hits) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  if (!counts.size) return { verses: [], terms, scanned: 0 };

  // ★ لا يُشترط اجتماع كلمات البيت كلها. ★
  //
  // المستخدم يلصق بيتَه كاملًا — ثمانيَ كلماتٍ أو أكثر — وشرطُ «كلّها إلا
  // واحدة» يطلب سبعًا مشتركة، ولا يشترك بيتان في سبع كلماتٍ إلا أن يكونا
  // البيت نفسه. فكان البحث بالبيت كاملًا (وهو أوّل ما يفعله المستخدم)
  // يعود صفرًا دائمًا، ولا يعمل إلا إن اختصر المستخدم بيته بكلمتين.
  //
  // ★ وكلمةٌ واحدةٌ تكفي للدخول، والترتيب يتكفّل بالباقي. ★
  //   لأن البيت الموافق في المعنى قد لا يشترك مع بيتك إلا في كلمة:
  //   «وما نيل المطالب بالتمني» و«طلبت لها المخارج بالتمنّي» تشتركان في
  //   «تمني» وحدها — ومنعُها يمنع الموافقة نفسها.
  //   والحشوُ مأمونٌ: حروفُ المعاني غير مفهرسة أصلًا، والمرشَّحون يُرتَّبون
  //   بعدد ما شاركوا فيه ثم يُقصّون عند الحدّ، فالأكثرُ مشاركةً يتقدّم.
  const need = 1;
  // ★ نقتصر على ضعف المطلوب: كلُّ مرشَّحٍ يكلّف شظيّةً تُجلب، ★
  //   والتقارب يُسقط بعضهم فنترك هامشًا ولا نُسرف.
  const candidates = [...counts.entries()]
    .filter(([, c]) => c >= need)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit * 2);

  // (٣) نجلب شظايا السجلّات ثم نتحقّق من التقارب على النصّ نفسه
  const verseBuckets = new Map();
  for (const [id] of candidates) {
    const b = verseBucketOf(id, verseShards);
    if (!verseBuckets.has(b)) verseBuckets.set(b, load('verses', b));
  }
  const stores = new Map();
  for (const [b, p] of verseBuckets) stores.set(b, await p);

  const out = [];
  // ★ بيتُ السائل نفسه لا يُطرح صامتًا. ★
  //   كان يُستبعد فيُقال «لم يُوجد بيتٌ موافق» — وبيتُه في المكتبة بصفحته
  //   وروايته ونسبته! والباحث يريد تحقيق بيته قبل أن يطلب موافقاته.
  const itself = [];
  for (const [id, hits] of candidates) {
    const rec = stores.get(verseBucketOf(id, verseShards))?.[id];
    if (!rec) continue;
    if (isSameVerse(rec.t)) {
      if (itself.length < 6) itself.push({ ...fromRecord(rec), matchedTerms: hits });
      continue;
    }
    if (!withinProximity(rec.t, terms, proximity)) continue;
    out.push({ ...fromRecord(rec), matchedTerms: hits });
    if (out.length >= limit && itself.length) break;
  }

  return { verses: out, itself, terms, scanned: candidates.length };
}

/**
 * موافقاتُ المعنى للبيت الذي سأل به السائل.
 *
 * ★ وهي الجواب عن العلّة التي لا يُصلحها بحثُ الألفاظ: ★ «وما نيل المطالب
 * بالتمنّي» و«بقدر الكدّ تكتسب المعالي» لا تشترك بينهما كلمة، فلا يجمعهما
 * فهرسٌ لفظيٌّ أبدًا. وجيرانُ المعنى محسوبةٌ يوم الفهرسة، فتأتي هنا ★ بلا
 * نموذجٍ ولا مفتاحٍ ولا شبكة ★ — وهذا ما يجعل الموقع يملك معناه لا يستعيره.
 *
 * والمدخل: أن يُعرف بيتُ السائل في الفهرس. فإن لم يُعرف فلا جيرةَ له، ويبقى
 * المجلسُ والبحثُ اللفظيّ.
 */
export async function neighborsOf(query, load, {
  limit = 12, verseShards = VERSE_SHARDS, tokenShards = TOKEN_SHARDS, minSimilarity = 0,
} = {}) {
  // (١) أين بيتُ السائل من الفهرس؟ نبحث به ولا نستبعده — فهو المطلوب نفسه
  const { verses } = await searchIndex(query, load, {
    limit: 5, excludeVerse: null, tokenShards, verseShards,
  });
  const fp = fingerprint(query);
  const self = verses.find((v) => {
    const f = fingerprint(v.text);
    const [a, b] = f.length >= fp.length ? [f, fp] : [fp, f];
    return f === fp || (b.length >= 12 && a.includes(b));
  });
  if (!self?.neighborIds?.length) return { verses: [], anchor: self ?? null };

  // (٢) الجيران أرقامٌ في شظايا السجلّات — تُجلب دفعةً واحدة
  const wanted = self.neighborIds.filter((n) => n.sim >= minSimilarity).slice(0, limit);
  const buckets = new Map();
  for (const n of wanted) {
    const b = verseBucketOf(n.id, verseShards);
    if (!buckets.has(b)) buckets.set(b, load('verses', b));
  }
  const stores = new Map();
  for (const [b, p] of buckets) stores.set(b, await p);

  const out = [];
  for (const n of wanted) {
    const rec = stores.get(verseBucketOf(n.id, verseShards))?.[n.id];
    if (!rec) continue;
    out.push({ ...fromRecord(rec), similarity: n.sim, basis: 'neighbors' });
  }
  return { verses: out, anchor: self };
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
  // كلُّ كلمةٍ تُطلب بإحدى صيغتيها، ولا تُعدّ مرّتين
  const seen = new Set();
  const positions = [];
  for (const t of terms) {
    const key = stripPrefixes(t);
    if (seen.has(key)) continue;
    const at = find(t);
    if (at !== -1) { seen.add(key); positions.push(at); }
  }
  if (positions.length < 2) return positions.length >= 1;
  return Math.max(...positions) - Math.min(...positions) <= distance;
}
