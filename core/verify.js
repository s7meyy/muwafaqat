// ★ بوابة التحقّق ★ — هذه هي «الموافقات».
//
// كل بيتٍ يُعرض لا بدّ أن يوجد نصُّه — مطبَّعًا — داخل وثيقةٍ استُرجعت فعلًا.
// النموذج قد يقترح بيتًا من «ذاكرته»؛ والذاكرة هنا اسمٌ آخر للاختراع.
// فما لم يُوجد في وثيقة: يسقط. لا يُعرض، ولا يُعتذر عنه، ويُعدّ في «مقترحات لم تُثبَت».

import { normalize } from './normalize.js';

/** وثيقة: { id, text, ... } — أي نصٍّ جاء من مصدرٍ حقيقيّ (صفحة كتاب أو صفحة ويب). */
export function indexDocuments(documents) {
  return documents.map((d) => ({ ...d, _norm: normalize(d.text) }));
}

/**
 * يتحقّق من بيتٍ واحد.
 * يُقبل البيت إذا وُجد كاملًا في وثيقة، أو وُجد شطراه كلاهما في وثيقةٍ واحدة
 * (فالروايات تختلف في الفاصل والترقيم لا في الكلم).
 * يُرجع { ok, evidence } و evidence = { documentId, offset, matched }.
 */
export function verifyVerse(verse, indexedDocs) {
  const whole = normalize(verse.text ?? `${verse.sadr} ${verse.ajz}`);
  const sadr = normalize(verse.sadr ?? '');
  const ajz = normalize(verse.ajz ?? '');
  if (!whole) return { ok: false, reason: 'EMPTY' };

  for (const doc of indexedDocs) {
    const hay = doc._norm;
    if (!hay) continue;

    const direct = hay.indexOf(whole);
    if (direct !== -1) {
      return { ok: true, evidence: { documentId: doc.id, offset: direct, matched: 'whole' } };
    }
    if (sadr && ajz) {
      const i = hay.indexOf(sadr);
      const j = hay.indexOf(ajz);
      // الشطران في وثيقةٍ واحدة، والعجز بعد الصدر، وبينهما قريب
      if (i !== -1 && j !== -1 && j > i && j - (i + sadr.length) <= 8) {
        return { ok: true, evidence: { documentId: doc.id, offset: i, matched: 'hemistichs' } };
      }
    }
  }
  return { ok: false, reason: 'NOT_IN_SOURCE' };
}

/**
 * البوابة على مجموعة. تُرجع المارّين، وعدد الساقطين، والساقطين أنفسهم للتشخيص.
 * ★ لا شيء يصل إلى الشاشة إلا من `passed`. ★
 */
export function gate(verses, documents) {
  const indexed = indexDocuments(documents);
  const passed = [];
  const rejected = [];
  for (const v of verses) {
    const r = verifyVerse(v, indexed);
    if (r.ok) passed.push({ ...v, evidence: r.evidence });
    else rejected.push({ ...v, reason: r.reason });
  }
  return { passed, rejected, rejectedCount: rejected.length };
}
