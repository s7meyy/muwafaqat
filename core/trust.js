// درجة التوثيق — ثلاثٌ ظاهرةٌ للمستخدم لا مخفيّةٌ في التفاصيل.
//
// النبطي لا مكتبةَ محقَّقةً له كالفصيح، فمصادره مبعثرة: دواوين مصوَّرة، ومواقع
// متخصصة، ومنتديات، وتويتر. وقد قُبلت كلها — لكن بشرطين لا ثالث لهما:
// ★ رابطٌ يُفتح، وشارةٌ تقول للمستخدم كم يثق بما يقرأ. ★
//
// 🟢 موثَّق   كتابٌ محقَّقٌ أو ديوانٌ مطبوع، باسمه وصفحته
// 🟡 منشور   موقعٌ متخصصٌ في الشعر، بصفحةٍ تُفتح
// 🟠 متداوَل  منتدًى أو تغريدةٌ أو مدوّنة — والنسبة فيه غير مؤكَّدة

export const TRUST = {
  documented: { key: 'documented', rank: 3, label: 'موثَّق', mark: '🟢' },
  published:  { key: 'published',  rank: 2, label: 'منشور', mark: '🟡' },
  circulated: { key: 'circulated', rank: 1, label: 'متداوَل', mark: '🟠',
                note: 'النسبة غير مؤكَّدة — هكذا ورد في هذا الموضع' },
};

// مواقعُ متخصصةٌ في الشعر: لها محرّرون وفهارس، فنسبتها أقرب إلى الصواب
// من المنتدى — ولا تبلغ الكتاب المحقَّق.
const PUBLISHED_HOSTS = [
  'aldiwan.net', 'adab.com', 'poetsgate.com', 'diwandb.com',
  'poetry.dctabudhabi.ae', 'arabicpoems.com', 'aldiwan.org',
  'shamela.ws', 'al-maktaba.org', 'waqfeya.net',
];

// مواضعُ يتداول فيها الناس الشعر بلا تحقيق — تُقبل، وتُوسم بصدق
const CIRCULATED_HINTS = [
  'twitter.com', 'x.com', 'nitter.', 'facebook.com', 'instagram.com',
  'blogspot.', 'wordpress.', 'montada', 'muntada', 'forum', 'vb.', 'showthread',
  'reddit.com', 'quora.com', 'pinterest.',
];

export function hostOf(url) {
  try { return new URL(String(url)).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return null; }
}

/** درجة الموضع من رابطه. وما جُهل يُعامَل «متداوَلًا» — الأحوطُ أصدق. */
export function trustOf(url) {
  const host = hostOf(url);
  if (!host) return TRUST.circulated;
  if (PUBLISHED_HOSTS.some((h) => host === h || host.endsWith('.' + h))) return TRUST.published;
  if (CIRCULATED_HINTS.some((h) => host.includes(h) || String(url).includes(h))) return TRUST.circulated;
  return TRUST.circulated;
}

/** اسمٌ يُعرض للموضع: اسمُ الموقع لا رابطه الطويل. */
export function siteNameOf(url) {
  const host = hostOf(url);
  if (!host) return 'مصدر';
  const known = {
    'aldiwan.net': 'الديوان', 'adab.com': 'أدب', 'poetsgate.com': 'بوابة الشعراء',
    'poetry.dctabudhabi.ae': 'الموسوعة الشعرية', 'shamela.ws': 'المكتبة الشاملة',
    'al-maktaba.org': 'المكتبة الشاملة', 'twitter.com': 'تويتر/X', 'x.com': 'تويتر/X',
  };
  return known[host] ?? host;
}

/** ترتيبٌ يقدّم الأوثق — يُستعمل عند تساوي غيره. */
export function byTrust(a, b) {
  return (TRUST[b?.trust]?.rank ?? 0) - (TRUST[a?.trust]?.rank ?? 0);
}

// ── روابط المصادر ──────────────────────────────────────────────────────────

/**
 * رابطُ صفحةِ الكتاب على «الشاملة» على الشبكة.
 *
 * ★ يُبنى من رقم الكتاب ورقم الصفحة في نسختك المحلّية. ★ وترقيمُ الموقع قد
 * يخالف ترقيم نسختك في بعض الكتب، فالرابط يقطع بالكتاب ويقارب في الصفحة.
 * ولهذا يُعرض موسومًا: «افتح في الشاملة» لا «هذا هو المصدر».
 */
export function shamelaUrl(bookId, pageId) {
  if (!bookId) return null;
  return pageId
    ? `https://shamela.ws/book/${bookId}/${pageId}`
    : `https://shamela.ws/book/${bookId}`;
}
