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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 12e6) { reject(new Error('الطلب أكبر من اللازم')); req.destroy(); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('جسمٌ ليس JSON')); }
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
      if (!b.query) return send(res, 400, { error: 'query مطلوب' }, corsOrigin);
      return send(res, 200, await shamela.search(b.query, b), corsOrigin);
    }

    // ★ النقطة الأهمّ: استعلامٌ يدخل، أبياتٌ موثَّقةٌ تخرج ★
    if (url.pathname === '/v1/verses' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.query) return send(res, 400, { error: 'query مطلوب' }, corsOrigin);
      const out = await shamela.verses(b.query, {
        mode: b.mode ?? 'near',
        distance: b.distance ?? 10,
        limit: Math.min(Number(b.limit ?? 20), 50),
        categories: b.categories ?? POETRY_CATEGORIES,
        excludeVerse: b.excludeVerse ?? b.query,
      });
      return send(res, 200, out, corsOrigin);
    }

    // ★ مجلس النماذج: بيتٌ يدخل، فيقترح كلُّ نموذجٍ مدخلًا للمعنى، ثم تُبحث به الشاملة
    if (url.pathname === '/v1/council' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.query) return send(res, 400, { error: 'query مطلوب' }, corsOrigin);
      try {
        const out = await shamela.council(b.query, process.env, {
          queryLimit: Math.min(Number(b.queryLimit ?? 14), 24),
          pageBudget: Math.min(Number(b.pageBudget ?? 60), 120),
          web: b.web !== false,
          webQueryLimit: Math.min(Number(b.webQueryLimit ?? 4), 8),
        });
        return send(res, 200, out, corsOrigin);
      } catch (e) {
        return send(res, e.code === 'NO_COUNCIL' ? 501 : 500, { error: e.message, code: e.code }, corsOrigin);
      }
    }

    // تفريغ صورة — والنتيجة اقتراحٌ لا يُبحث به حتى يعتمده المستخدم بيده
    if (url.pathname === '/v1/transcribe' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.image) return send(res, 400, { error: 'image مطلوبة (base64)' }, corsOrigin);
      try {
        const out = await transcribeImage({ imageBase64: b.image, mimeType: b.mimeType });
        return send(res, 200, out, corsOrigin);
      } catch (e) {
        return send(res, e.code === 'NO_PROVIDER' ? 501 : 502, { error: e.message, code: e.code }, corsOrigin);
      }
    }

    // سياقُ البيت: ما قبله وما بعده في صفحته — «أرِني الصفحة»
    if (url.pathname === '/v1/context' && req.method === 'POST') {
      const b = await readBody(req);
      if (!b.book_id || !b.page_id) return send(res, 400, { error: 'book_id و page_id مطلوبان' }, corsOrigin);
      const pg = await shamela.page(b.book_id, b.page_id);
      const body = pg?.body ?? '';
      let excerpt = body;
      if (b.around) {
        const { normalize } = await import('../core/normalize.js');
        const needle = normalize(b.around).split(' ').slice(0, 4).join(' ');
        const norm = normalize(body);
        const at = norm.indexOf(needle);
        if (at !== -1) {
          const ratio = body.length / (norm.length || 1);
          const centre = Math.round(at * ratio);
          const radius = Math.min(Number(b.radius ?? 600), 2000);
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
      if (!b.book_id || !b.page_id) return send(res, 400, { error: 'book_id و page_id مطلوبان' }, corsOrigin);
      return send(res, 200, await shamela.page(b.book_id, b.page_id), corsOrigin);
    }

    return send(res, 404, { error: 'لا شيء هنا' }, corsOrigin);
  } catch (e) {
    return send(res, 500, { error: String(e.message ?? e) }, corsOrigin);
  }
});

server.listen(config.port, config.host, () => {
  process.stdout.write(`جسر «الموافقات» يعمل على http://${config.host}:${config.port}\n`);
  process.stdout.write(`خادم الشاملة: ${config.mcpCommand} ${config.mcpArgs.join(' ')}\n`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { shamela.client.stop(); server.close(() => process.exit(0)); });
}
