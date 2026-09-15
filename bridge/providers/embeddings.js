// التضمينات — متجهُ المعنى للبيت.
//
// اختياريّةٌ كغيرها: إن وُجد مفتاحٌ رُتِّب بها، وإلّا رُتِّب بمداخل المجلس.
// ولا تُدخل بيتًا ولا تُخرجه — ★ ترتيبٌ لما مرّ بالبوابة لا غير ★.

export function embeddingsAvailable(env = process.env) {
  return Boolean(env.GEMINI_API_KEY || env.JINA_API_KEY);
}

export function embeddingsProvider(env = process.env) {
  if (env.JINA_API_KEY) return 'jina';
  if (env.GEMINI_API_KEY) return 'gemini';
  return null;
}

const MAX_BATCH = 64;

/** يُرجع Map من النصّ إلى متجهه. ما تعذّر منه يُترك ولا يُعطّل الباقي. */
export async function embed(texts, env = process.env) {
  const unique = [...new Set(texts.filter(Boolean))];
  if (!unique.length || !embeddingsAvailable(env)) return new Map();

  const out = new Map();
  for (let i = 0; i < unique.length; i += MAX_BATCH) {
    const batch = unique.slice(i, i + MAX_BATCH);
    try {
      const vectors = env.JINA_API_KEY ? await jina(batch, env) : await gemini(batch, env);
      batch.forEach((t, k) => { if (vectors[k]) out.set(t, vectors[k]); });
    } catch { /* دفعةٌ سقطت — الترتيب يتراجع إلى ما دونها */ }
  }
  return out;
}

async function gemini(texts, env) {
  const model = env.GEMINI_EMBED_MODEL || 'text-embedding-004';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        requests: texts.map((t) => ({ model: `models/${model}`, content: { parts: [{ text: t }] } })),
      }),
    });
  if (!res.ok) throw new Error(`Gemini embed ${res.status}`);
  const data = await res.json();
  return (data?.embeddings ?? []).map((e) => e.values);
}

async function jina(texts, env) {
  const res = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.JINA_API_KEY}` },
    body: JSON.stringify({ model: env.JINA_MODEL || 'jina-embeddings-v3', input: texts }),
  });
  if (!res.ok) throw new Error(`Jina ${res.status}`);
  const data = await res.json();
  return (data?.data ?? []).map((d) => d.embedding);
}
