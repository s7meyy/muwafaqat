// استعلامات البحث التي يقترحها مجلس النماذج — تصفيتها ودمجها وترتيبها.
//
// النماذج هنا **لا تكتب أبياتًا**: تكتب كلماتٍ يُبحث بها. ومع ذلك تُصفّى مخرجاتها،
// لأن النموذج قد يدسّ شطرًا يتذكّره في موضع «عبارة للبحث» — وهو حينئذٍ يبحث عن
// بيتٍ يظنّه موجودًا. لا ضرر في ذلك (البحث يعود صفرًا، والبوابة تحرس الخرج)، لكن
// كل استعلامٍ يكلّف صفحاتٍ تُقرأ، فالصفاء هنا توفيرٌ لا احترازٌ فقط.
//
// وأنفعُ ما في المجلس: ★ الاختلاف ★. عشرة نماذج تعطي عشرة مداخل للمعنى،
// فيلتقط أحدها ما فات التسعة. والاستعلام الذي يقترحه أكثرُ من نموذجٍ يُقدَّم.

import { normalize } from './normalize.js';

const MIN_WORDS = 1;
const MAX_WORDS = 4;       // «near» يبحث عن تقارب الكلم، فالإطالة تُفقر النتيجة
const MIN_WORD_LEN = 2;

// كلماتٌ لا تدلّ على معنًى فتُتعب البحث بلا فائدة.
// ★ تُطبَّع عند الإنشاء: المقارنة تقع على المطبَّع، و«على» تصير «علي» — فقائمةٌ
//   غير مطبَّعةٍ لا تُطابق شيئًا، وتمرّ «من في على» كأنها استعلامٌ ذو معنى.
const STOPWORDS = new Set([
  'من','في','على','عن','إلى','الى','ما','لا','أن','إن','قد','هذا','هذه','ذلك','التي','الذي',
  'كان','كل','بين','مع','او','أو','ثم','لم','لن','هو','هي','به','له','بها','وما','ولا','يا',
  'كما','حتى','إذا','اذا','لكن','بل','قال','كذلك','أي','هنا','هناك',
].map((w) => normalize(w)));

const VERSE_SEPARATOR = /\.{3}|…|\*{3}/;
const LATIN = /[a-z0-9]/i;

/** هل يصلح هذا النصّ استعلامًا؟ يُرجع سببَ الرفض أو null إن صلح. */
export function rejectReason(text) {
  const raw = String(text ?? '').trim();
  if (!raw) return 'EMPTY';
  if (VERSE_SEPARATOR.test(raw)) return 'LOOKS_LIKE_VERSE';  // شطرٌ دُسّ مكان كلمة
  if (LATIN.test(raw)) return 'NOT_ARABIC';

  const words = normalize(raw).split(' ').filter(Boolean);
  if (words.length < MIN_WORDS) return 'EMPTY';
  if (words.length > MAX_WORDS) return 'TOO_LONG';
  if (words.some((w) => w.length < MIN_WORD_LEN)) return 'WORD_TOO_SHORT';
  if (words.every((w) => STOPWORDS.has(w))) return 'STOPWORDS_ONLY';
  return null;
}

/**
 * يدمج ما اقترحته النماذج في قائمةٍ واحدةٍ مرتَّبة.
 * proposals = [{ model, queries: [{ text, mode?, distance? }] }]
 *
 * والترتيب: ما اتفق عليه أكثرُ من نموذجٍ أولًا — فاتفاقُ مستقلَّين على مدخلٍ
 * للمعنى دليلٌ على أنه مدخلٌ حقيقيّ لا نزوةُ نموذج.
 */
export function mergeQueries(proposals, { limit = 14 } = {}) {
  const merged = new Map();
  const rejected = [];

  for (const { model, queries } of proposals ?? []) {
    for (const q of queries ?? []) {
      const text = String(q?.text ?? q ?? '').trim();
      const reason = rejectReason(text);
      if (reason) { rejected.push({ text, model, reason }); continue; }

      const key = normalize(text);
      const existing = merged.get(key);
      if (existing) {
        if (!existing.models.includes(model)) existing.models.push(model);
      } else {
        merged.set(key, {
          text,
          mode: q?.mode === 'phrase' ? 'phrase' : 'near',
          distance: Number(q?.distance) > 0 ? Math.min(Number(q.distance), 20) : 10,
          models: [model],
        });
      }
    }
  }

  const list = [...merged.values()].sort((a, b) =>
    b.models.length - a.models.length
    || a.text.split(/\s+/).length - b.text.split(/\s+/).length   // الأقصر أوسع حصادًا
    || a.text.localeCompare(b.text, 'ar'));

  return { queries: list.slice(0, limit), dropped: list.slice(limit), rejected };
}

/** يقرأ JSON من ردّ نموذجٍ قد يلفّه بسياجٍ أو يسبقه بكلام. */
export function parseModelJson(raw) {
  const text = String(raw ?? '').trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text;
  try { return JSON.parse(candidate); } catch { /* نحاول قصّ أول كائن */ }
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(candidate.slice(start, end + 1)); } catch { /* لا شيء */ }
  }
  return null;
}
