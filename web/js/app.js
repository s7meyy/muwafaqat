// واجهة «الموافقات» — المرحلة الأولى: نصٌّ يدخل، أبياتٌ موثَّقةٌ تخرج.
// الصور وشاشة الاعتماد في المرحلة الثانية، وزرُّ البحث يبقى معطَّلًا حتى الاعتماد.

import { toArabicDigits } from '../../core/normalize.js';

const BRIDGE = localStorage.getItem('muwafaqat.bridge') || 'http://127.0.0.1:8787';
const TOKEN = localStorage.getItem('muwafaqat.token') || '';

const $ = (id) => document.getElementById(id);
const q = $('q'), btn = $('search'), statusEl = $('status'), results = $('results'), hint = $('hint');

const TRUST = {
  documented: { cls: 't-documented', label: '🟢 موثَّق' },
  published:  { cls: 't-published',  label: '🟡 منشور' },
  circulated: { cls: 't-circulated', label: '🟠 متداوَل — النسبة غير مؤكَّدة' },
};

function setStatus(text, isError = false) {
  statusEl.hidden = !text;
  statusEl.textContent = text ?? '';
  statusEl.classList.toggle('err', isError);
}

function verseHtml(v) {
  const [sadr, ajz] = [v.sadr ?? v.text, v.ajz ?? ''];
  return ajz
    ? `${escape(sadr)}<span class="sep">...</span>${escape(ajz)}`
    : escape(v.text);
}
function escape(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function card(v) {
  const el = document.createElement('article');
  el.className = 'card';
  const trust = TRUST[v.source?.trust] ?? TRUST.circulated;

  // ★ القائل لا يُخمَّن. المجهول يُصرَّح به. ★
  const poet = v.disputedPoets
    ? `يُنسب إلى ${v.disputedPoets.map(escape).join('، وإلى ')}`
    : v.poet ? escape(v.poet) : '<span class="unknown">قائله غير معروف</span>';

  const life = v.deathYear
    ? `ت ${toArabicDigits(String(v.deathYear))}هـ / ${toArabicDigits(String(v.deathYearGregorian))}م`
    : '';
  const era = v.era?.name ?? (v.deathYear ? '' : 'عصره غير معروف');

  const s = v.source ?? {};
  const where = s.bookName
    ? `${escape(s.bookName)}${s.printedPage ? ` — ص ${toArabicDigits(String(s.printedPage))}` : ''}`
    : escape(s.siteName ?? 'مصدر');
  const link = s.url ? ` · <a href="${escape(s.url)}" target="_blank" rel="noopener">افتح المصدر ↗</a>` : '';
  const occurrences = v.occurrences > 1 ? ` · ورد في ${toArabicDigits(String(v.occurrences))} مواضع` : '';

  el.innerHTML = `
    <p class="verse">${verseHtml(v)}</p>
    <div class="meta">
      <span class="poet">${poet}</span>
      ${life ? `<span>${life}</span>` : ''}
      ${era ? `<span>${escape(era)}</span>` : ''}
      <span class="badge ${trust.cls}">${trust.label}</span>
    </div>
    <p class="src">${where}${link}${occurrences}</p>`;
  return el;
}

async function search() {
  const query = q.value.trim();
  if (!query) { setStatus('اكتب بيتًا أولًا.', true); return; }

  btn.disabled = true;
  results.replaceChildren();
  setStatus('يبحث في المصادر…');

  try {
    const res = await fetch(`${BRIDGE}/v1/verses`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}) },
      body: JSON.stringify({ query, mode: 'near', distance: 10, limit: 20 }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `خطأ ${res.status}`);
    const data = await res.json();

    if (!data.verses?.length) {
      setStatus(`لم يُوجد بيتٌ موافق في ${toArabicDigits(String(data.pagesRead ?? 0))} صفحةٍ قُرئت. جرّب كلماتٍ أخرى من معنى البيت.`);
      return;
    }
    const rejected = data.rejectedCount
      ? ` · ${toArabicDigits(String(data.rejectedCount))} مقترحًا لم يثبت في مصدرٍ فلم يُعرض`
      : '';
    setStatus(`${toArabicDigits(String(data.verses.length))} بيتًا موافقًا، من ${toArabicDigits(String(data.pagesRead))} صفحةٍ قُرئت${rejected}`);
    for (const v of data.verses) results.append(card(v));
  } catch (e) {
    setStatus(`تعذّر البحث: ${e.message}. تأكّد أن جسر الشاملة يعمل على جهازك.`, true);
  } finally {
    btn.disabled = false;
  }
}

btn.addEventListener('click', search);
q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) search(); });
hint.textContent = TOKEN ? '' : 'لم يُضبط مفتاح الجسر بعد — انظر bridge/README.md';
