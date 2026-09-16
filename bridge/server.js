#!/usr/bin/env node
// جسر الشاملة — يُشغَّل على جهاز صاحب المكتبة، ويفتح بحثها لموقع «الموافقات» وحده.
//
// التشغيل:  BRIDGE_TOKEN=... SHAMELA_MCP_CMD=... node bridge/server.js
// والنفق:   cloudflared tunnel --url http://127.0.0.1:8787
//
// الحماية: مفتاحٌ في ترويسة Authorization، وحدُّ طلباتٍ في الدقيقة، ونطاقاتٌ معلومة.

import http from 'node:http';
import { loadConfig } from './config.js';
import { Shamela, POETRY_CATEGORIES } from './shamela.js';
import { transcribeImage, availableProviders } from './transcribe.js';
import { councilSize } from './council.js';
import { webSearchAvailable, webSearchProvider } from './web.js';
import { embeddingsAvailable, embeddingsProvider } from './providers/embeddings.js';

const config = loadConfig();
const shamela = new Shamela({
  command: config.mcpCommand,
  args: config.mcpArgs,
  timeoutMs: config.timeoutMs,
});

const hits = new Map(); // ip ← [أوقات الطلبات]

function rateLimited(ip) {
  const now = Date.now();
  const window = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  window.push(now);
  hits.set(ip, window);
  return window.length > config.rateLimitPerMinute;
}

function send(res, status, body, origin) {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  };
  if (origin) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-headers'] = 'authorization, content-type';
    headers['access-control-allow-methods'] = 'POST, GET, OPTIONS';
    headers['vary'] = 'origin';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

// ── التحقّق من المدخلات ────────────────────────────────────────────────────
//
// الجسر يعمل على جهاز صاحب المكتبة، وما يصله يأتي من متصفّحٍ قد يكون مخطئًا
// أو مخرَّبًا. وقد وجدنا بالتجربة أنه كان يقبل ما لا يُقبل:
// «query» مصفوفةً فيعيد أبياتًا، و«limit» سالبًا، و«categories» نصًّا،
// وسؤالًا بمئة ألف حرف فيُشغّل به بحثًا في سبعة تصنيفات.

const MAX_QUERY_CHARS = 2000;   // أطولُ قصيدةٍ يُعقل أن تُلصق

class BadRequest extends Error {}

function wantText(value, field, { max = MAX_QUERY_CHARS } = {}) {
  if (typeof value !== 'string') throw new BadRequest(`${field} يجب أن يكون نصًّا`);
  const t = value.trim();
  if (!t) throw new BadRequest(`${field} مطلوب`);
  if (t.length > max) throw new BadRequest(`${field} أطول من ${max} حرفًا`);
  return t;
}

function wantCount(value, fallback, max) {
  if (value === undefined || value === null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) throw new BadRequest('العدد يجب أن يكون موجبًا');
  return Math.min(Math.floor(n), max);
}

function wantIds(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (!Array.isArray(value)) throw new BadRequest('التصنيفات يجب أن تكون مصفوفة أرقام');
  const ids = value.map(Number);
  if (ids.some((n) => !Number.isInteger(n) || n <= 0)) throw new BadRequest('التصنيفات أرقامٌ موجبة');
  return ids;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      // ★ الصورة المصغَّرة نحو ٣٠٠ ك.ب، لكن المتصفّح القديم قد يرفعها كما هي
      //   وترميزُ base64 يزيدها الثلث — فالحدُّ يتّسع لذلك ولا يقف على حافّته.
      if (data.length > 18e6) { reject(new Error('الطلب أكبر من اللازم')); req.destroy(); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new BadRequest('جسمٌ ليس JSON')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const allowed = !origin || !config.allowedOrigins.length || config.allowedOrigins.includes(origin);
  const corsOrigin = allowed ? (origin ?? '*') : null;

  if (req.method === 'OPTIONS') return send(res, 204, {}, corsOrigin);
  if (!allowed) return send(res, 403, { error: 'نطاقٌ غير مسموح' }, null);

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/v1/ping') {
    return send(res, 200, {
      ok: true, service: 'muwafaqat-bridge',
      transcribers: availableProviders(),   // تعرف الواجهة أتقدر على الصور أم لا
      council: councilSize(),               // وكم عضوًا في مجلس النماذج
      web: webSearchAvailable() ? webSearchProvider() : null,
      embeddings: embeddingsAvailable() ? embeddingsProvider() : null,
    }, corsOrigin);
  }

  const auth = req.headers.authorization ?? '';
  if (auth !== `Bearer ${config.token}`) return send(res, 401, { error: 'مفتاحٌ غير صحيح' }, corsOrigin);

  const ip = req.socket.remoteAddress ?? 'unknown';
  if (rateLimited(ip)) return send(res, 429, { error: 'طلباتٌ كثيرةٌ في دقيقة' }, corsOrigin);

  try {
    if (url.pathname === '/v1/health') {
      return send(res, 200, await shamela.health(), corsOrigin);
    }

    if (url.pathname === '/v1/search' && req.method === 'POST') {
      const b = await readBody(req);
      const query = wantText(b.query, 'query');
      return send(res, 200, await shamela.search(query, {
        mode: b.mode, distance: wantCount(b.distance, 10, 50),
        limit: wantCount(b.limit, 20, 100), categories: wantIds(b.categories, undefined),
      }), corsOrigin);
    }

    // ★ النقطة الأهمّ: استعلامٌ يدخل، أبياتٌ موثَّقةٌ تخرج ★
    if (url.pathname === '/v1/verses' && req.method === 'POST') {
      const b = await readBody(req);
      const query = wantText(b.query, 'query');
      const out = await shamela.verses(query, {
        mode: b.mode === 'phrase' || b.mode === 'words' ? b.mode : 'near',
        distance: wantCount(b.distance, 10, 50),
        limit: wantCount(b.limit, 20, 50),
        categories: wantIds(b.categories, POETRY_CATEGORIES),
        excludeVerse: typeof b.excludeVerse === 'string' ? b.excludeVerse : query,
      });
      return send(res, 200, out, corsOrigin);
    }

    // ★ مجلس النماذج: بيتٌ يدخل، فيقترح كلُّ نموذجٍ مدخلًا للمعنى، ثم تُبحث به الشاملة
    if (url.pathname === '/v1/council' && req.method === 'POST') {
      const b = await readBody(req);
      const query = wantText(b.query, 'query');
      try {
        const out = await shamela.council(query, process.env, {
          queryLimit: wantCount(b.queryLimit, 14, 24),
          pageBudget: wantCount(b.pageBudget, 60, 120),
          web: b.web !== false,
          webQueryLimit: wantCount(b.webQueryLimit, 4, 8),
        });
        return send(res, 200, out, corsOrigin);
      } catch (e) {
        return send(res, e.code === 'NO_COUNCIL' ? 501 : 500, { error: e.message, code: e.code }, corsOrigin);
      }
    }

    // تفريغ صورة — والنتيجة اقتراحٌ لا يُبحث به حتى يعتمده المستخدم بيده
    if (url.pathname === '/v1/transcribe' && req.method === 'POST') {
      const b = await readBody(req);
      const image = wantText(b.image, 'image', { max: 24e6 });
      if (!/^[A-Za-z0-9+/=\s]+$/.test(image)) throw new BadRequest('image ليست base64');
      try {
        const out = await transcribeImage({
          imageBase64: image,
          mimeType: typeof b.mimeType === 'string' ? b.mimeType : 'image/jpeg',
        });
        return send(res, 200, out, corsOrigin);
      } catch (e) {
        return send(res, e.code === 'NO_PROVIDER' ? 501 : 502, { error: e.message, code: e.code }, corsOrigin);
      }
    }

    // سياقُ البيت: ما قبله وما بعده في صفحته — «أرِني الصفحة»
    if (url.pathname === '/v1/context' && req.method === 'POST') {
      const b = await readBody(req);
      const bookId = wantCount(b.book_id, null, 1e9);
      const pageId = wantCount(b.page_id, null, 1e9);
      if (!bookId || !pageId) throw new BadRequest('book_id و page_id مطلوبان');
      const pg = await shamela.page(bookId, pageId);
      const body = pg?.body ?? '';
      let excerpt = body;
      if (typeof b.around === 'string' && b.around) {
        const { normalize } = await import('../core/normalize.js');
        const needle = normalize(b.around).split(' ').slice(0, 4).join(' ');
        const norm = normalize(body);
        const at = norm.indexOf(needle);
        if (at !== -1) {
          const ratio = body.length / (norm.length || 1);
          const centre = Math.round(at * ratio);
          const radius = wantCount(b.radius, 600, 2000);
          excerpt = body.slice(Math.max(0, centre - radius), centre + radius);
        }
      }
      return send(res, 200, {
        bookName: pg?.book_name ?? null, printedPage: pg?.printed_page ?? null,
        excerpt, citation: pg?.citation ?? null, truncated: excerpt.length < body.length,
      }, corsOrigin);
    }

    if (url.pathname === '/v1/page' && req.method === 'POST') {
      const b = await readBody(req);
      const bookId = wantCount(b.book_id, null, 1e9);
      const pageId = wantCount(b.page_id, null, 1e9);
      if (!bookId || !pageId) throw new BadRequest('book_id و page_id مطلوبان');
      return send(res, 200, await shamela.page(bookId, pageId), corsOrigin);
    }

    return send(res, 404, { error: 'لا شيء هنا' }, corsOrigin);
  } catch (e) {
    // ★ خطأُ المرسِل ٤٠٠ لا ٥٠٠ ★ — و«جسمٌ ليس JSON» كان يُردّ خطأَ خادم
    const status = e instanceof BadRequest ? 400 : 500;
    return send(res, status, { error: String(e.message ?? e) }, corsOrigin);
  }
});

server.listen(config.port, config.host, () => {
  process.stdout.write(`جسر «الموافقات» يعمل على http://${config.host}:${config.port}\n`);
  process.stdout.write(`خادم الشاملة: ${config.mcpCommand} ${config.mcpArgs.join(' ')}\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { shamela.client.stop(); server.close(() => process.exit(0)); });
}
