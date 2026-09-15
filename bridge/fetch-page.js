// جلبُ صفحةٍ من الشبكة — بحراسة.
//
// ★ الجسر يعمل على جهاز صاحب المكتبة، والروابطُ تأتيه من نتائج بحثٍ خارجية. ★
// فلو جلب ما يُملى عليه بلا قيدٍ لصار بابًا إلى شبكة صاحبه الداخلية
// (127.0.0.1 و192.168.x و169.254.169.254). فهذه القيود ليست تزيّدًا.

import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 3;

/** أعنوانٌ خاصٌّ هو؟ (الشبكة الداخلية وما يجري مجراها) */
export function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 169 && b === 254)          // بيانات وصف السحابة
      || (a === 100 && b >= 64 && b <= 127)
      || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    return v === '::1' || v === '::' || v.startsWith('fe80') || v.startsWith('fc') || v.startsWith('fd')
      || v.startsWith('::ffff:127.') || v.startsWith('::ffff:10.') || v.startsWith('::ffff:192.168.');
  }
  return true;
}

/**
 * `lookup` يُحقَن في الاختبار وحده بمضيفاتٍ وهمية.
 * ★ لا يُضعَّف الفحص في الإنتاج من أجل الاختبار ★ — الافتراض هو dns.lookup،
 * ولا يوجد متغيّرُ بيئةٍ يعطّل الحراسة، فلا يُنسى مفتوحًا.
 */
export async function assertPublicUrl(rawUrl, { lookup = dns.lookup } = {}) {
  let url;
  try { url = new URL(String(rawUrl)); } catch { throw new Error('رابطٌ غير صالح'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('بروتوكولٌ غير مسموح');
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(url.hostname)) throw new Error('مضيفٌ داخليّ');

  if (net.isIP(url.hostname)) {
    if (isPrivateAddress(url.hostname)) throw new Error('عنوانٌ داخليّ');
    return url;
  }
  const addrs = await lookup(url.hostname, { all: true });
  if (!addrs.length) throw new Error('لم يُعرَف المضيف');
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new Error('المضيف يشير إلى عنوانٍ داخليّ');
  return url;
}

/** يجلب صفحةً نصّيةً بحدٍّ للحجم والمهلة، ويتحقّق من كل تحويلة. */
export async function fetchPage(rawUrl, { lookup } = {}) {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicUrl(current, lookup ? { lookup } : {});
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': 'muwafaqat/0.1 (+قارئ شعر)', accept: 'text/html,application/xhtml+xml' },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location'), url).toString();
        continue;                                    // والتحويلة تُفحص من جديد
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get('content-type') ?? '';
      if (!/text\/html|text\/plain|application\/xhtml/.test(type)) throw new Error(`نوعٌ غير مقروء: ${type.split(';')[0]}`);

      const buf = await readCapped(res.body);
      return { url: url.toString(), html: new TextDecoder('utf-8').decode(buf) };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('تحويلاتٌ كثيرة');
}

async function readCapped(stream) {
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > MAX_BYTES) break;                    // نقرأ ما يكفي ونترك الباقي
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
