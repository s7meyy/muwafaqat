// الترتيب بالمعنى — المرحلة السادسة.
//
// الترتيب السابق كان يعدّ: كم مدخلًا بلغ البيت، وكم مصدرًا له. وهذا يقيس
// «كم طريقًا وصل إليه» لا «كم يُشبه بيتك». والفرق يظهر حين يبلغ بيتٌ بعيدُ
// المعنى ثلاثةَ مداخلَ لأن فيه كلمةً شائعة.
//
// ولا نجعل الترتيب رهنَ مفتاح: إن وُجدت تضمينات رُتِّب بها، وإلّا فبمقياسٍ
// لفظيٍّ يعمل دائمًا — وكلاهما ★ ترتيبٌ لما مرّ بالبوابة، لا إدخالٌ لشيء ★.

import { normalize } from './normalize.js';

/** جيبُ التمام بين متجهين. */
export function cosine(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const STOP = new Set(['من', 'في', 'علي', 'عن', 'الي', 'ما', 'لا', 'ان', 'قد', 'هذا', 'التي',
  'الذي', 'كان', 'كل', 'بين', 'مع', 'او', 'ثم', 'لم', 'لن', 'هو', 'هي', 'به', 'له', 'وما', 'ولا']);

function contentWords(text) {
  return normalize(text).split(' ').filter((w) => w.length >= 3 && !STOP.has(w));
}

/**
 * تشابهٌ لفظيٌّ بلا مفتاحٍ ولا شبكة: اشتراكُ الكلم مع وزنِ الكلمة النادرة أثقل.
 * ★ يعمل دائمًا، فهو الأساس ★ — والتضمينات تحسّنه ولا يتوقّف عليها.
 */
export function lexicalSimilarity(a, b, { df = null, total = 1 } = {}) {
  const A = new Set(contentWords(a));
  const B = new Set(contentWords(b));
  if (!A.size || !B.size) return 0;

  let shared = 0, weight = 0;
  for (const w of A) {
    const idf = df ? Math.log((total + 1) / ((df.get(w) ?? 0) + 1)) + 1 : 1;
    weight += idf;
    if (B.has(w)) shared += idf;
  }
  return weight ? shared / weight : 0;
}

/** تكرارُ الكلمة في المجموعة — به تُعرف النادرة من الشائعة. */
export function documentFrequencies(texts) {
  const df = new Map();
  for (const t of texts) for (const w of new Set(contentWords(t))) df.set(w, (df.get(w) ?? 0) + 1);
  return { df, total: texts.length };
}

/**
 * يرتّب الأبيات بقربها من البيت المسؤول به.
 * `embeddings` اختياريّة: Map من نصّ البيت إلى متجهه (ومعها متجه السؤال).
 *
 * والدرجة تُحفظ مفصَّلةً في `v.ranking` — فالمستخدم يرى لماذا تقدّم بيتٌ على بيت،
 * ولا يُقال له «هكذا» ثم يُسكت.
 */
export function rankBySimilarity(query, verses, { embeddings = null, queryVector = null, queryCount = 1 } = {}) {
  const { df, total } = documentFrequencies(verses.map((v) => v.text));

  for (const v of verses) {
    const lexical = lexicalSimilarity(query, v.joined ?? v.text, { df, total });
    const vector = embeddings && queryVector ? cosine(queryVector, embeddings.get(v.text)) : null;
    const reached = v.matchedQueries?.length ?? 1;
    const reach = queryCount > 1 ? Math.min(reached / queryCount, 1) : 0;

    // ★ ثلاثة أسسٍ للترتيب، وتُسمّى للمستخدم بأسمائها ★
    //
    // والسبب أن المقياس اللفظيّ ★ لا يرى المعنى ★: البيت الموافق في المعنى
    // قد لا يشترك مع بيتك في كلمة. جرّب «وما نيل المطالب بالتمني» مع «بقدر
    // الكدّ تكتسب المعالي» — معنًى واحد، ولا كلمة مشتركة. فترتيبُ اللفظ
    // يرفع «إن الدنيا زائلة» لمجرّد كلمة «الدنيا»، وذاك تضليل.
    //
    // فإن وُجدت التضمينات فهي الأصل. وإلّا فاتفاقُ مداخل المجلس أصدقُ من
    // اللفظ: بيتٌ بلغته أربعةُ مداخلَ للمعنى أقربُ من بيتٍ بلغه مدخلٌ واحد.
    // واللفظُ آخرُ ما يُعوَّل عليه، ويُقال للمستخدم إنه الأساس حينئذٍ.
    let meaning, basis;
    if (vector !== null) { meaning = vector * 0.75 + lexical * 0.25; basis = 'embeddings'; }
    else if (reach > 0) { meaning = reach * 0.7 + lexical * 0.3; basis = 'council'; }
    else { meaning = lexical; basis = 'lexical'; }

    const sources = Math.min((v.sources?.length ?? 1) - 1, 3) * 0.02;
    const known = v.poet ? 0.02 : 0;

    v.ranking = {
      score: Number((meaning + sources + known).toFixed(4)),
      meaning: Number(meaning.toFixed(4)),
      lexical: Number(lexical.toFixed(4)),
      vector: vector === null ? null : Number(vector.toFixed(4)),
      reach: Number(reach.toFixed(4)),
      basis,
    };
    v.score = v.ranking.score;
  }

  return [...verses].sort((a, b) => b.score - a.score);
}

/** ما يُقال للمستخدم عن أساس الترتيب — ولا يُسكت عن ضعفه. */
export function rankingNote(basis) {
  return {
    embeddings: 'رُتِّبت بقرب المعنى (تضمينات).',
    council: 'رُتِّبت بعدد مداخل المعنى التي بلغتها — لا بتشابه الألفاظ.',
    lexical: 'رُتِّبت باشتراك الألفاظ وحده، وهو لا يقيس المعنى. فقد يتقدّم بيتٌ'
      + ' لمجرّد كلمةٍ مشتركة، ويتأخّر بيتٌ يوافقك معنًى بلا لفظٍ مشترك.',
  }[basis] ?? null;
}
