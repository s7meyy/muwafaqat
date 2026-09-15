// مجلس النماذج — عشرةٌ تقرأ بيتك، وكلٌّ منها يقترح مدخلًا آخر للمعنى.
//
// ولا يقترح أحدها بيتًا: يقترحون كلماتٍ يُبحث بها، ثم تبحث الشاملةُ بها كلها،
// ثم تحرس بوابةُ التحقّق الخرج. فأسوأ ما يفعله نموذجٌ مخطئ أن يُضيّع استعلامًا.

import { councilMembers } from './providers/text.js';
import { mergeQueries, parseModelJson } from '../core/queries.js';

const CONCURRENCY = 4;        // الطبقات المجانية تخنق التوازي الشديد
const MEMBER_TIMEOUT_MS = 30_000;

export function councilSize(env = process.env) {
  return councilMembers(env).length;
}

/** يشغّل دوالَّ بحدٍّ للتوازي، ويُرجع نتائج allSettled بترتيبها. */
async function pooled(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (next < tasks.length) {
      const i = next++;
      try { results[i] = { status: 'fulfilled', value: await tasks[i]() }; }
      catch (reason) { results[i] = { status: 'rejected', reason }; }
    }
  });
  await Promise.all(workers);
  return results;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label}: انتهت المهلة`)), ms)),
  ]);
}

/**
 * يستشير المجلس في بيت.
 * يُرجع { queries, meanings, members, failed, rejected } — ولا بيت فيها.
 */
export async function expand(verse, env = process.env, { limit = 14 } = {}) {
  const members = councilMembers(env);
  if (!members.length) {
    const e = new Error('لا نموذج مضبوط للمجلس. اضبط GEMINI_API_KEY أو OPENROUTER_API_KEY أو GROQ_API_KEY.');
    e.code = 'NO_COUNCIL';
    throw e;
  }

  const settled = await pooled(
    members.map((m) => () => withTimeout(m.call(verse, env), MEMBER_TIMEOUT_MS, m.id)),
    CONCURRENCY,
  );

  const proposals = [];
  const meanings = [];
  const failed = [];

  settled.forEach((s, i) => {
    const model = members[i].id;
    if (s.status !== 'fulfilled') {
      failed.push({ model, error: String(s.reason?.message ?? s.reason) });
      return;
    }
    const parsed = parseModelJson(s.value);
    if (!parsed?.queries) {
      failed.push({ model, error: 'ردٌّ غير مفهوم' });
      return;
    }
    proposals.push({ model, queries: parsed.queries });
    if (parsed.meaning) meanings.push({ model, meaning: String(parsed.meaning).trim(), register: parsed.register ?? null });
  });

  const { queries, dropped, rejected } = mergeQueries(proposals, { limit });

  return {
    queries,
    meanings,                               // يُعرض للمستخدم: «فهمتُ بيتك هكذا»
    members: members.map((m) => m.id),
    answered: proposals.map((p) => p.model),
    failed,
    rejected,                               // ما رُفض من اقتراحاتهم ولماذا
    droppedCount: dropped.length,
  };
}
