// البحث في الشبكة — مزوّدان، وكلاهما اختياريّ.
//
//  Brave   طبقةٌ مجانية، مفتاحٌ واحد: BRAVE_API_KEY
//  SearXNG نسخةٌ تشغّلها بنفسك بلا مفتاح: SEARXNG_URL
//
// وبلا واحدٍ منهما يعمل الموقعُ على الشاملة وحدها ويقول ذلك.

export function webSearchAvailable(env = process.env) {
  return Boolean(env.BRAVE_API_KEY || env.SEARXNG_URL);
}

export function webSearchProvider(env = process.env) {
  if (env.BRAVE_API_KEY) return 'brave';
  if (env.SEARXNG_URL) return 'searxng';
  return null;
}

/** يُرجع [{ url, title, snippet }] */
export async function webSearch(query, env = process.env, { count = 10 } = {}) {
  if (env.BRAVE_API_KEY) return brave(query, env, count);
  if (env.SEARXNG_URL) return searxng(query, env, count);
  const e = new Error('لا مزوّد بحثٍ في الشبكة. اضبط BRAVE_API_KEY أو SEARXNG_URL.');
  e.code = 'NO_WEB_SEARCH';
  throw e;
}

async function brave(query, env, count) {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(Math.min(count, 20)));
  url.searchParams.set('search_lang', 'ar');
  const res = await fetch(url, {
    headers: { accept: 'application/json', 'x-subscription-token': env.BRAVE_API_KEY },
  });
  if (!res.ok) throw new Error(`Brave ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  return (data?.web?.results ?? []).map((r) => ({
    url: r.url, title: r.title ?? '', snippet: r.description ?? '',
  }));
}

async function searxng(query, env, count) {
  const url = new URL('/search', env.SEARXNG_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('language', 'ar');
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`SearXNG ${res.status}`);
  const data = await res.json();
  return (data?.results ?? []).slice(0, count).map((r) => ({
    url: r.url, title: r.title ?? '', snippet: r.content ?? '',
  }));
}
