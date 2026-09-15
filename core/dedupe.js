// إزالة المكرَّر — والبيت الواحد يرد في عشرة كتبٍ برواياتٍ متقاربة.
// فلا نحذف الروايات: نجمعها تحت بيتٍ واحدٍ ونذكر مصادرها كلها.

import { fingerprint, normalize } from './normalize.js';

/** تشابه جاكار على الكلمات — يكفي للروايات، ولا يحتاج مكتبة. */
export function similarity(a, b) {
  const A = new Set(normalize(a).split(' ').filter(Boolean));
  const B = new Set(normalize(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * يجمع الأبيات المتطابقة والمتقاربة.
 * يُرجع [{ ...البيت الأوفر مصادر, sources: [...], variants: [...] }]
 */
export function dedupe(verses, { threshold = 0.82 } = {}) {
  const groups = [];
  const byFingerprint = new Map();

  for (const v of verses) {
    const fp = fingerprint(v.text ?? `${v.sadr} ${v.ajz}`);
    let group = byFingerprint.get(fp);

    if (!group) {
      // مطابقةٌ تقريبية للروايات المختلفة
      group = groups.find((g) => similarity(g.text, v.text) >= threshold);
    }
    if (group) {
      group.members.push(v);
      if (v.source) group.sources.push(v.source);
      if (fingerprint(group.text) !== fp) group.variants.push(v.text);
    } else {
      group = { text: v.text, members: [v], sources: v.source ? [v.source] : [], variants: [] };
      groups.push(group);
      byFingerprint.set(fp, group);
    }
  }

  return groups.map((g) => {
    // نمثّل المجموعة بأوثق أعضائها: من عُرف قائله أولًا
    const best = g.members.find((m) => m.poet) ?? g.members[0];
    const poets = [...new Set(g.members.map((m) => m.poet).filter(Boolean))];
    // ★ المداخل التي بلغت هذا البيت تُجمع من الأعضاء كلهم ★
    //   بيتٌ بلغته ثلاثةُ مداخلَ للمعنى أقربُ موافقةً من بيتٍ بلغه واحد،
    //   وأخذُ مداخل العضو الأوّل وحده يُضيّع هذه الإشارة.
    const matchedQueries = [...new Set(g.members.flatMap((m) => m.matchedQueries ?? []))];
    return {
      ...best,
      matchedQueries,
      sources: g.sources,
      variants: [...new Set(g.variants)],
      // ★ عند اختلاف المصادر في القائل لا نرجّح: نعرض الاثنين ★
      disputedPoets: poets.length > 1 ? poets : null,
      occurrences: g.members.length,
    };
  });
}
