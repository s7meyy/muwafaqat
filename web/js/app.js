// واجهة «الموافقات» — المرحلة الأولى: نصٌّ يدخل، أبياتٌ موثَّقةٌ تخرج.
// الصور وشاشة الاعتماد في المرحلة الثانية، وزرُّ البحث يبقى معطَّلًا حتى الاعتماد.

import { toArabicDigits } from '../../core/normalize.js';
import { countLabel, PAGE, PLACE, SUGGESTION, MATCHED_VERSE, PAGES_READ } from '../../core/plural.js';
import { toArabicDigits as ar } from '../../core/normalize.js';
import { install as installApproval } from './approve.js';

const BRIDGE = localStorage.getItem('muwafaqat.bridge') || 'http://127.0.0.1:8787';
const TOKEN = localStorage.getItem('muwafaqat.token') || '';

const $ = (id) => document.getElementById(id);
const q = $('q'), btn = $('search'), statusEl = $('status'), results = $('results'), hint = $('hint');

const TRUST = {
  documented: { cls: 't-documented', label: '🟢 موثَّق' },
  published:  { cls: 't-published',  label: '🟡 منشور' },
  circulated: { cls: 't-circulated', label: '🟠 متداوَل — النسبة غير مؤكَّدة' },
};

let lastVerses = [];   // تُحفظ ليُعاد العرض عند تغيير المرشِّح بلا بحثٍ جديد

function allowedTrusts() {
  return new Set([...document.querySelectorAll('.trust-filter:checked')].map((c) => c.value));
}

function renderVerses() {
  const allowed = allowedTrusts();
  const shown = lastVerses.filter((v) => allowed.has(v.source?.trust ?? 'circulated'));
  results.replaceChildren();
  for (const v of shown) results.append(card(v));

  const hidden = lastVerses.length - shown.length;
  const note = $('filter-note');
  if (note) note.textContent = hidden ? `أُخفي ${ar(String(hidden))} بسبب درجة التوثيق.` : '';
}

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
    : `${escape(s.siteName ?? 'مصدر')}${s.pageTitle ? ` — <bdi dir="auto">${escape(s.pageTitle.slice(0, 60))}</bdi>` : ''}`;
  const link = s.url
    ? ` · <a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">افتح المصدر ↗</a>`
    : '';
  // ★ درجةُ «متداوَل» تقول صراحةً إن النسبة غير مؤكَّدة — لا تُخفى في تلميح
  const caveat = s.trustNote ? `<p class="caveat">${escape(s.trustNote)}</p>` : '';
  // ★ ما جاء بقرن الأسطر أضعفُ دلالةً من الفاصل الصريح — يُقال لا يُكتم
  const pairing = s.pairing === 'lines'
    ? '<p class="caveat">قُرئ بقرن الأسطر المتّفقة الرويّ، لا بفاصلٍ صريحٍ بين الشطرين.</p>'
    : '';
  const nabati = v.register === 'nabati'
    ? `<span class="badge t-nabati">نبطي${v.registerConfidence < 0.6 ? ' (ترجيح)' : ''}</span>`
    : '';
  const occurrences = v.occurrences > 1 ? ` · ورد في ${countLabel(v.occurrences, PLACE)}` : '';
  // ★ البيت الذي بلغته عدّةُ مداخلَ للمعنى أقربُ موافقةً من بيتٍ بلغه مدخلٌ واحد
  const via = v.matchedQueries?.length > 1
    ? `<p class="src">بلغته ${ar(String(v.matchedQueries.length))} مداخلَ للمعنى: ${v.matchedQueries.map(escape).join(' · ')}</p>`
    : '';

  // سنة الوفاة لها مصدرٌ أيضًا — ويُعرض اسم الترجمة التي جاءت منها ليُرى إن أخطأت
  const ls = v.lifespanSource;
  const dated = ls
    ? `<p class="src">التأريخ من ترجمة «${escape(v.poetResolved ?? v.poet)}» — ${escape(ls.label)}${
        ls.printedPage ? ` ص ${toArabicDigits(String(ls.printedPage))}` : ''}</p>`
    : (v.poet && !v.deathYear ? '<p class="src unknown">لم تُعرف سنة وفاته، فلم يُذكر عصره.</p>' : '');

  el.innerHTML = `
    <p class="verse">${verseHtml(v)}</p>
    <div class="meta">
      <span class="poet">${poet}</span>
      ${life ? `<span>${life}</span>` : ''}
      ${era ? `<span>${escape(era)}</span>` : ''}
      <span class="badge ${trust.cls}">${trust.label}</span>
      ${nabati}
    </div>
    <p class="src">${where}${link}${occurrences}</p>
    ${caveat}${pairing}
    ${dated}
    ${via}`;
  return el;
}

const MODEL = { zero:'لا نموذج', one:'نموذجٌ واحد', two:'نموذجان',
  few:'# نماذج', many:'# نموذجًا', other:'# نموذج' };

/** يعرض كيف فُهم البيت وبمَ بُحث — فالمستخدم يرى مدخل البحث لا نتيجته فقط. */
function renderCouncil(c) {
  const panel = $('council');
  if (!c) { panel.hidden = true; return; }
  panel.hidden = false;

  const seen = new Set();
  $('council-meanings').innerHTML = (c.meanings ?? [])
    .filter((m) => { const k = m.meaning.trim(); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((m) => `<p>«${escape(m.meaning)}» <span class="who">— ${escape(m.model.split('/').pop())}</span></p>`)
    .join('') || '<p class="who">لم يصف أحدٌ منهم المعنى.</p>';

  $('council-queries').innerHTML = (c.perQuery ?? c.queries ?? []).map((q) => {
    const agreed = (q.models?.length ?? 1) > 1;
    const empty = q.found === 0;
    const cls = ['chip', agreed ? 'agreed' : '', empty ? 'empty' : ''].filter(Boolean).join(' ');
    const n = agreed ? `<span class="n">${ar(String(q.models.length))} نماذج</span>` : '';
    const title = empty ? 'لم يجد هذا المدخل شيئًا' : `وجد ${q.found ?? 0}`;
    return `<span class="${cls}" title="${escape(title)}">${escape(q.text)}${n}</span>`;
  }).join('');

  const parts = [`استشير ${countLabel(c.members?.length ?? 0, MODEL)}، أجاب منهم ${ar(String(c.answered?.length ?? 0))}`];
  if (c.failed?.length) parts.push(`وسقط ${ar(String(c.failed.length))}`);
  if (c.rejected?.length) parts.push(`ورُفض ${ar(String(c.rejected.length))} من اقتراحاتهم (بيتٌ مدسوس أو كلامٌ لا يصلح للبحث)`);
  $('council-note').textContent = parts.join('، ') + '.';
}

/** حال البحث في الشبكة — يُقال إن كان معطَّلًا ولماذا. */
function renderWeb(w) {
  const el = $('council-note');
  if (!el) return;
  if (!w.enabled) {
    el.textContent += ' ولم يُبحث في الشبكة (لا مزوّد بحثٍ مضبوط) — فالنتائج من المكتبة وحدها، والنبطيُّ مصدرُه الشبكة.';
    return;
  }
  const bits = [`وبُحث في الشبكة عبر ${w.provider}: قُرئت ${countLabel(w.fetched, PAGE)}`];
  if (w.failed?.length) bits.push(`وتعذّر ${ar(String(w.failed.length))}`);
  el.textContent += ' ' + bits.join('، ') + '.';
}

async function search() {
  const query = q.value.trim();
  if (!query) { setStatus('اكتب بيتًا أولًا.', true); return; }

  btn.disabled = true;
  results.replaceChildren();
  lastVerses = [];
  $('filters').hidden = true;
  setStatus('يبحث في المصادر…');

  const useCouncil = $('use-council')?.checked;
  $('council').hidden = true;

  try {
    const endpoint = useCouncil ? '/v1/council' : '/v1/verses';
    const res = await fetch(`${BRIDGE}${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}) },
      body: JSON.stringify(useCouncil ? { query } : { query, mode: 'near', distance: 10, limit: 20 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.code === 'NO_COUNCIL') {
        setStatus('لم يُضبط نموذجٌ للمجلس بعد. أُعيد البحث بكلماتك وحدها…');
        $('use-council').checked = false;
        return search();
      }
      throw new Error(data.error ?? `خطأ ${res.status}`);
    }
    if (data.council) renderCouncil(data.council);
    if (data.web) renderWeb(data.web);

    if (!data.verses?.length) {
      setStatus(`لم يُوجد بيتٌ موافق — قُرئت ${countLabel(data.pagesRead ?? 0, PAGE)}.${
        useCouncil ? ' جرّب صياغةً أخرى للبيت.' : ' جرّب «مجلس النماذج» فهو أوسع مدخلًا.'}`);
      return;
    }
    const rejected = data.rejectedCount
      ? ` · ${countLabel(data.rejectedCount, SUGGESTION)} لم يثبت في مصدرٍ فلم يُعرض`
      : '';
    const budget = data.budgetExhausted ? ' · بلغ البحث حدَّ الصفحات، وقد يكون وراءه مزيد' : '';
    setStatus(`${countLabel(data.verses.length, MATCHED_VERSE)} — ${countLabel(data.pagesRead, PAGES_READ)}${rejected}${budget}`);
    lastVerses = data.verses;
    $('filters').hidden = false;
    renderVerses();
  } catch (e) {
    setStatus(`تعذّر البحث: ${e.message}. تأكّد أن جسر الشاملة يعمل على جهازك.`, true);
  } finally {
    btn.disabled = false;
  }
}

btn.addEventListener('click', search);
q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) search(); });

// ── التبويبان: نصّ · صورة ──────────────────────────────────────────────────
const tabs = [
  { btn: $('tab-text'), pane: $('pane-text'), mode: 'text' },
  { btn: $('tab-image'), pane: $('pane-image'), mode: 'image' },
];
let mode = 'text';

function refreshSearchButton() {
  // في مسار الصورة لا يُفتح البحث إلا بعد الاعتماد — وهذا قيدٌ صريحٌ لا نصيحة
  const ready = mode === 'text' ? Boolean(q.value.trim()) : imageApproved;
  btn.disabled = !ready;
  hint.textContent = mode === 'image' && !imageApproved
    ? 'اعتمِد التفريغ أولًا في تبويب «صورة».'
    : (TOKEN ? '' : 'لم يُضبط مفتاح الجسر — انظر bridge/README.md');
}

let imageApproved = false;

for (const t of tabs) {
  t.btn?.addEventListener('click', () => {
    mode = t.mode;
    for (const o of tabs) {
      o.btn.setAttribute('aria-selected', String(o === t));
      o.pane.hidden = o !== t;
    }
    refreshSearchButton();
  });
}
q.addEventListener('input', refreshSearchButton);

installApproval({
  bridge: BRIDGE,
  token: TOKEN,
  onApproved: (text) => { imageApproved = true; q.value = text; refreshSearchButton(); },
  onUnapproved: () => { imageApproved = false; refreshSearchButton(); },
});

refreshSearchButton();

for (const c of document.querySelectorAll('.trust-filter')) {
  c.addEventListener('change', renderVerses);
}
