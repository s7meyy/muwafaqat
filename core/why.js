// ★ لماذا ظهر هذا البيت؟ ★
//
// جولةُ باحثٍ في الأدب كشفت أخطرَ ما في الموقع: سُئل بـ«ألا كلُّ شيءٍ ما خلا
// اللهَ باطلُ» — وهو في فناء الدنيا — فجاء «واللهُ يقضي بهباتٍ وافرَه». والجامع
// بينهما لفظُ «الله» لا المعنى. ★ والبطاقة لا تقول شيئًا. ★
//
// فالباحث لا يفرّق بين موافقةٍ حقيقيةٍ ومصادفةِ لفظ إلا بأن يُقال له: بمَ وقع
// هذا البيت في يدك؟ وهذا الملفّ يقوله — ولا يزيد على ما جرى فعلًا:
//   «شارك بيتك في: الكدّ · المعالي»      ← لفظٌ مشترك، وهو أضعفها
//   «موافقةٌ في المعنى ٨٨٪»               ← متجهٌ محسوبٌ يوم الفهرسة
//   «بلغه مدخلٌ من المجلس: طلب العلا»     ← توسيعُ معنًى من النماذج
// ولا يُقال «موافقةٌ في المعنى» لما بلغه اللفظُ وحده — فذاك ادّعاءٌ لا خبر.

import { normalize, stripDiacritics } from './normalize.js';
import { contentWords } from './semantic.js';
import { stripPrefixes, NOT_INDEXED } from './verse-index.js';

/** صورتا الكلمة اللتان يقع عليهما التطابق: كما وردت، ومجرَّدةً من سوابقها. */
function formsOf(word) {
  const n = normalize(word);
  const bare = stripPrefixes(n);
  return bare !== n ? [n, bare] : [n];
}

// ★ ألفاظٌ تقع في كلّ شعرٍ فلا تدلّ على موافقة. ★
// جولةُ الباحث أخرجت: «شارك بيتك في: الله» بين بيتٍ في فناء الدنيا وبيتٍ في
// الدعاء — وهو لفظٌ مشترك، لكنّه ليس موافقةً في المعنى. وقولُه للباحث بلا
// تمييزٍ يُوهمه صلةً لا وجود لها.
const COMMON = new Set([
  'الله', 'الا', 'اذا', 'الذي', 'التي', 'يوم', 'كل', 'شي', 'شيء', 'قال', 'قد',
  'لقد', 'انا', 'انت', 'هذا', 'ذاك', 'بعد', 'قبل', 'غير', 'حين', 'الان', 'ليس',
  'نفس', 'امر', 'اهل', 'ناس', 'رب', 'يا', 'عند', 'دون', 'بين', 'حتي', 'لكن',
]);
const MIN_MEANINGFUL = 4;   // أحرفُ الكلمة التي يُعتدّ باشتراكها

/** أكلمةٌ يُعتدّ باشتراكها، أم لفظٌ شائعٌ لا يدلّ على معنى؟ */
export function isMeaningful(word) {
  const n = normalize(word);
  const bare = stripPrefixes(n);
  return !COMMON.has(n) && !COMMON.has(bare) && !NOT_INDEXED.has(bare)
    && bare.length >= MIN_MEANINGFUL;
}

/** الكلمُ المشترك بين نصّين — بصورته في النصّ الثاني، لا مطبَّعًا. */
export function sharedWords(query, text) {
  const wanted = new Set(contentWords(query).flatMap(formsOf));
  if (!wanted.size) return [];
  const out = [];
  const seen = new Set();
  for (const w of String(text ?? '').split(/\s+/)) {
    const forms = formsOf(w);
    if (!forms.some((f) => wanted.has(f))) continue;
    const key = forms[forms.length - 1];
    if (seen.has(key)) continue;
    seen.add(key);
    // تُعرض كما وردت في البيت بلا شكل — فالشكل يختلف بين الطبعات
    out.push(stripDiacritics(w).replace(/^[^ء-ي]+|[^ء-ي]+$/g, ''));
  }
  return out.filter(Boolean);
}

/** أكلمةٌ من كلم السؤال؟ (للتظليل داخل البيت) */
export function isShared(word, query) {
  const wanted = new Set(contentWords(query).flatMap(formsOf));
  return formsOf(word).some((f) => wanted.has(f));
}

/**
 * سببُ ظهور البيت، بأصدق ما جرى.
 * يُرجع { kind, label, words } — و`kind` ∈ sense | council | lexical | none
 */
export function matchReason(verse, query) {
  const words = sharedWords(query, verse?.text ?? '');

  // ★ بلغه توسيعُ المعنى: أخٌ للفظه في الدلالة، لا لفظُه ★
  if (verse?.viaField) {
    return {
      kind: 'field',
      label: `بلغه توسيعُ المعنى: ${verse.viaField}`
        + (words.length ? ` (وشارك في: ${words.slice(0, 3).join(' · ')})` : ''),
      words,
    };
  }
  if (verse?.viaImage) {
    return { kind: 'image', label: `يشترك مع بيتك في الصورة: ${verse.viaImage}`, words };
  }

  if (verse?.semantic) {
    const pct = verse.similarity ? ` ${Math.round(verse.similarity * 100)}٪` : '';
    return { kind: 'sense', label: `قريبٌ من بيتك في المعنى${pct}`, words };
  }

  // مداخلُ المجلس: ما بلغ البيتَ من توسيعِ المعنى لا من لفظ السؤال
  const viaCouncil = (verse?.matchedQueries ?? [])
    .filter((m) => m && normalize(m) !== normalize(query) && m !== 'موافقةٌ في المعنى');
  if (!words.length && viaCouncil.length) {
    return { kind: 'council', label: `بلغه مدخلٌ للمعنى: ${viaCouncil.slice(0, 3).join(' · ')}`, words };
  }

  if (words.length) {
    const strong = words.filter(isMeaningful);
    // ★ الاشتراكُ في لفظٍ شائعٍ ليس موافقةً، ويُقال ذلك صراحةً. ★
    //   وإلّا حسب الباحثُ «الله» في بيتَي فناءٍ ودعاءٍ صلةً بينهما.
    if (!strong.length) {
      return {
        kind: 'weak',
        label: `لم يشترك مع بيتك إلا في لفظٍ شائع: ${words.slice(0, 4).join(' · ')}`
          + ' — وهذا لا يدلّ على موافقةٍ في المعنى',
        words,
      };
    }
    const base = `شارك بيتك في: ${strong.slice(0, 6).join(' · ')}`;
    return {
      kind: 'lexical',
      label: viaCouncil.length ? `${base} · ومدخلٌ للمعنى: ${viaCouncil[0]}` : base,
      words: strong,
    };
  }

  // ★ لا يُختلق سبب. ★ ظهورٌ بلا سببٍ ظاهرٍ خبرٌ للباحث لا عيبٌ يُستر.
  return { kind: 'none', label: 'ظهر في نتائج المكتبة، ولا لفظَ مشتركًا بينه وبين بيتك', words: [] };
}

/**
 * يقسّم البيت كلماتٍ موسومةً بالمشترك — ليُظلَّل في العرض.
 * يُرجع [{ word, shared }] والفراغُ محذوفٌ (يُعاد عند البناء).
 */
export function markShared(text, query) {
  const wanted = new Set(contentWords(query).flatMap(formsOf));
  return String(text ?? '').split(/\s+/).filter(Boolean)
    .map((word) => ({ word, shared: formsOf(word).some((f) => wanted.has(f)) }));
}
