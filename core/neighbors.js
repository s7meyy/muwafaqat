// جيرانُ البيت في المعنى — أهمُّ ما يفصل هذا الموقع عن بحثٍ لفظيّ.
//
// ★ العلّة التي لا يُصلحها بحثُ الألفاظ: ★
//   «وما نيل المطالب بالتمنّي» و«بقدر الكدّ تكتسب المعالي» معناهما واحد،
//   ولا تشترك بينهما كلمةٌ واحدة. فالفهرس اللفظيّ لا يجمعهما أبدًا، مهما
//   حسّنّا التجريد والتقارب والقافية.
//
// ★ والحلّ الذي لا يحتاج مفتاحًا وقت السؤال: ★
//   يُحسب متجهُ المعنى لكل بيتٍ ★ مرّةً واحدةً ★ يوم الفهرسة، ثم يُخزَّن مع
//   كل بيتٍ جيرانُه الاثنا عشر. فإذا سأل السائل ببيتٍ في الفهرس، جاءته
//   موافقاتُه في المعنى بلا نموذجٍ ولا شبكةٍ ولا انتظار.
//
// ★ ولمَ العناقيد: ★ مقارنةُ كلّ بيتٍ بكل بيتٍ على نصف مليون بيتٍ مئةُ ألفِ
//   مليون مقارنة. فتُقسَّم الأبيات عناقيدَ بـ k-means، ويُقارَن البيت بما في
//   عنقوده وأقربِ العناقيد إليه — فيصير العملُ محتمَلًا، وتبقى الجيرةُ صادقة
//   لأن القريب في المعنى قريبٌ في العنقود.

/** جيبُ التمام لمتجهين مطبَّعين (طولُ كلٍّ منهما واحد) — ضربٌ داخليٌّ وحسب. */
export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** يُرجع نسخةً مطبَّعة الطول؛ فالتشابه بعدها ضربٌ داخليّ بلا قسمة. */
export function unit(v) {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n);
  if (!n) return Float32Array.from(v);
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

// مولّدٌ عشوائيّ ثابت — كي يكون بناءُ الفهرس معادًا للتحقّق، لا يختلف بين تشغيلين
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

/**
 * k-means على متجهاتٍ مطبَّعة (تشابهُ جيب التمام).
 * يُرجع { centroids, assignment } — والعناقيدُ الفارغة تُترك فارغة ولا تُحشى.
 */
export function kmeans(vectors, k, { iterations = 8, seed = 20260916 } = {}) {
  const n = vectors.length;
  const dim = n ? vectors[0].length : 0;
  k = Math.max(1, Math.min(k, n));
  const rand = rng(seed);

  // بذورٌ متباعدة: اختيارٌ عشوائيٌّ بلا تكرار
  const picked = new Set();
  const centroids = [];
  while (centroids.length < k) {
    const i = Math.floor(rand() * n);
    if (picked.has(i)) continue;
    picked.add(i);
    centroids.push(Float32Array.from(vectors[i]));
  }

  const assignment = new Int32Array(n).fill(-1);
  for (let it = 0; it < iterations; it++) {
    let moved = 0;
    for (let i = 0; i < n; i++) {
      let best = -1, bestSim = -Infinity;
      for (let c = 0; c < k; c++) {
        const sim = dot(vectors[i], centroids[c]);
        if (sim > bestSim) { bestSim = sim; best = c; }
      }
      if (assignment[i] !== best) { assignment[i] = best; moved++; }
    }
    if (!moved && it) break;

    const sums = Array.from({ length: k }, () => new Float64Array(dim));
    const counts = new Int32Array(k);
    for (let i = 0; i < n; i++) {
      const c = assignment[i];
      counts[c]++;
      const v = vectors[i];
      for (let d = 0; d < dim; d++) sums[c][d] += v[d];
    }
    for (let c = 0; c < k; c++) {
      if (!counts[c]) continue;          // عنقودٌ فارغ يبقى حيث هو
      centroids[c] = unit(sums[c]);
    }
  }

  return { centroids, assignment };
}

const DEFAULT_TOP_K = 12;
// أدنى تشابهٍ يُعدّ به بيتان متوافقين في المعنى. ما دونه جِيرةُ صدفةٍ لا معنى،
// وعرضُها يُفسد الثقة بالقائمة كلها.
export const MIN_SIMILARITY = 0.62;

/**
 * يحسب جيرانَ كل بيت.
 * `items` = [{ id, vector }] — والمتجهاتُ تُطبَّع هنا، فلا يُشترط ذلك على الداعي.
 * يُرجع Map<id, [{ id, sim }]> مرتَّبةً بالأقرب.
 */
export function buildNeighbors(items, {
  topK = DEFAULT_TOP_K, minSimilarity = MIN_SIMILARITY, probe = 3, clusters = null, seed,
} = {}) {
  const n = items.length;
  const out = new Map();
  if (!n) return out;

  const vectors = items.map((it) => unit(it.vector));
  const k = clusters ?? Math.max(1, Math.round(Math.sqrt(n / 2)));
  const { centroids, assignment } = kmeans(vectors, k, seed ? { seed } : {});

  const members = Array.from({ length: centroids.length }, () => []);
  for (let i = 0; i < n; i++) members[assignment[i]].push(i);

  for (let i = 0; i < n; i++) {
    // العنقودُ الذي فيه البيت، ثم أقربُ العناقيد إليه — فالجارُ قد يقع على الحدّ
    const order = centroids
      .map((c, ci) => ({ ci, sim: dot(vectors[i], c) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, Math.max(1, probe))
      .flatMap((x) => members[x.ci]);

    const best = [];
    for (const j of order) {
      if (j === i) continue;
      const sim = dot(vectors[i], vectors[j]);
      if (sim < minSimilarity) continue;
      best.push({ id: items[j].id, sim });
    }
    best.sort((a, b) => b.sim - a.sim);
    if (best.length) out.set(items[i].id, best.slice(0, topK));
  }

  return out;
}
