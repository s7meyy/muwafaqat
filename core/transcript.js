// مقارنة تفريغين لصورةٍ واحدة.
//
// نموذجان يقرآن الصورة نفسها. ما اتفقا عليه يُرجَّح أنه صحيح، وما اختلفا فيه
// هو بالضبط ما يجب أن يقع عليه نظرك في شاشة الاعتماد — فالخطأ يسكن الاختلاف.
//
// وثلاث درجات لا درجتان:
//   same    اتفقا حرفًا وشكلًا
//   vowel   اتفقا في الحروف واختلفا في التشكيل  ← هيّنٌ، يُشار إليه بخفّة
//   word    اختلفا في الكلمة نفسها             ← ★ هنا يقع نظرك ★

import { normalize, stripDiacritics } from './normalize.js';

// فاصل الأسطر كلمةٌ في المحاذاة: البيت سطرٌ مستقلّ، ودمجُ الأبيات في سطرٍ
// واحدٍ يُفقد القارئ حدودَ الأبيات — وهو أوّل ما يحتاجه في شاشة الاعتماد.
export const NL = '\n';

function words(text) {
  return String(text ?? '').replace(/\r/g, '').split('\n')
    .map((line) => line.trim().split(/\s+/).filter(Boolean))
    .reduce((acc, line, i) => (i ? acc.concat([NL], line) : line), []);
}

/** الفاصل يُطابِق نفسه وحده، فلا يبتلعه التطبيع ولا يساوي كلمةً فارغة. */
function normWord(w) {
  return w === NL ? '\u00b6' : normalize(w);
}

/** أطول تتابعٍ مشترك على الكلمات المطبَّعة — به تُحاذى النسختان. */
function lcsTable(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  return dp;
}

/**
 * يقارن نصّين ويُرجع مقاطع:
 *   { type: 'same'|'vowel'|'word', a: [...كلمات], b: [...كلمات] }
 * والمقطع من نوع word قد يكون فيه أحد الطرفين فارغًا (زيادةٌ أو نقص).
 */
export function diffTranscripts(textA, textB) {
  const A = words(textA), B = words(textB);
  const na = A.map(normWord), nb = B.map(normWord);
  const dp = lcsTable(na, nb);

  const raw = [];
  let i = 0, j = 0;
  const pushDiff = (a, b) => {
    const last = raw[raw.length - 1];
    if (last && last.type === 'word') { last.a.push(...a); last.b.push(...b); }
    else raw.push({ type: 'word', a: [...a], b: [...b] });
  };

  while (i < A.length && j < B.length) {
    if (na[i] === nb[j]) {
      // الحروف واحدة — فهل التشكيل واحد؟
      const type = A[i] === B[j] ? 'same'
        : (stripDiacritics(A[i]) === stripDiacritics(B[j]) ? 'vowel' : 'vowel');
      const last = raw[raw.length - 1];
      if (last && last.type === type) { last.a.push(A[i]); last.b.push(B[j]); }
      else raw.push({ type, a: [A[i]], b: [B[j]] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pushDiff([A[i]], []); i++;
    } else {
      pushDiff([], [B[j]]); j++;
    }
  }
  if (i < A.length) pushDiff(A.slice(i), []);
  if (j < B.length) pushDiff([], B.slice(j));

  return raw;
}

/** عدد مواضع الاختلاف الحقيقي (الكلمات، لا التشكيل). */
export function disagreementCount(segments) {
  return segments.filter((s) => s.type === 'word').length;
}

/** نسبة الاتفاق على الكلمات — مقياسٌ سريعٌ لجودة التفريغ. */
export function agreementRatio(segments) {
  let agreed = 0, total = 0;
  for (const s of segments) {
    const len = Math.max(s.a.length, s.b.length);
    total += len;
    if (s.type !== 'word') agreed += len;
  }
  return total ? agreed / total : 1;
}

/**
 * النصّ المقترح للاعتماد: نسخة النموذج الأول أساسًا.
 * ★ لا نختار عن المستخدم عند الاختلاف — نضع نسخة (أ) ونُبرزها ليقرّر هو. ★
 */
export function proposedText(segments) {
  const tokens = segments.flatMap((s) => (s.a.length ? s.a : s.b));
  return tokens
    .reduce((out, w) => (w === NL ? out + '\n' : (out.endsWith('\n') || !out ? out + w : out + ' ' + w)), '')
    .trim();
}
