// واجهة «الموافقات».
//
// أُعيدت كتابتها بعد جولةِ مستخدمٍ كشفت أن أول زيارةٍ طريقٌ مسدود، وأن الأبيات
// المتعددة تُخفق صامتةً، وأن البطاقة بلا زرٍّ واحد. فالمبادئ التي بُنيت عليها:
//
//  ١) لا رسالةَ مطوِّرٍ في وجه المستخدم، ولا كلمةَ إنجليزيةٍ تتسرّب.
//  ٢) ما يقوله العدّاد يجب أن يوافق ما على الشاشة: إن أُخفيت بطاقةٌ تغيّر العدّاد.
//  ٣) البيت الذي يجده المستخدم نافعًا يجب أن يستطيع أخذه معه — نسخًا أو حفظًا
//     أو تصديرًا. وإلّا فعملُه محبوسٌ في متصفّح.

import { toArabicDigits as ar, fingerprint } from '../../core/normalize.js';
import { rankingNote } from '../../core/semantic.js';
import { countLabel, PAGE, PLACE, SUGGESTION, MATCHED_VERSE, PAGES_READ } from '../../core/plural.js';
import { splitVerses, looksArabic } from '../../core/input.js';
import { install as installApproval } from './approve.js';
import { searchStatic } from './static-index.js';
import { saved, rejected, corrections, history, verseToText, exportText, downloadText, DEFAULT_GROUP } from './collections.js';

const BRIDGE = localStorage.getItem('muwafaqat.bridge') || 'http://127.0.0.1:8787';
const TOKEN = localStorage.getItem('muwafaqat.token') || '';

const $ = (id) => document.getElementById(id);
const q = $('q'), btn = $('search'), statusEl = $('status'), results = $('results'), hint = $('hint');

const TRUST = {
  documented: { cls: 't-documented', label: '🟢 موثَّق' },
  published: { cls: 't-published', label: '🟡 منشور' },
  circulated: { cls: 't-circulated', label: '🟠 متداوَل — النسبة غير مؤكَّدة' },
};

const MODEL = { zero: 'لا نموذج', one: 'نموذجٌ واحد', two: 'نموذجان',
  few: '# نماذج', many: '# نموذجًا', other: '# نموذج' };
const VERSE_IN = { zero: 'لا بيت', one: 'بيتٍ واحد', two: 'بيتين',
  few: '# أبيات', many: '# بيتًا', other: '# بيت' };
const HIDDEN = { zero: 'لا شيء', one: 'بيتٌ واحد', two: 'بيتان',
  few: '# أبيات', many: '# بيتًا', other: '# بيت' };

let lastVerses = [];
let capabilities = null;   // ما يقدر عليه الجسر: تفريغ · مجلس · شبكة
let searching = false;
let imageApproved = false;
let mode = 'text';
let controller = null;   // لإلغاء بحثٍ طال

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function setStatus(text, kind = '') {
  statusEl.hidden = !text;
  statusEl.textContent = text ?? '';
  statusEl.className = `status ${kind}`;
}

// ── ما يقدر عليه الجسر ─────────────────────────────────────────────────────
async function probeBridge() {
  try {
    const r = await fetch(`${BRIDGE}/v1/ping`, { signal: AbortSignal.timeout(2500) });
    capabilities = r.ok ? await r.json() : null;
  } catch { capabilities = null; }
  reflectCapabilities();
}

function reflectCapabilities() {
  const council = $('use-council');
  const ready = Boolean(capabilities?.council);
  council.disabled = !ready;
  if (!ready) council.checked = false;
  $('council-hint').textContent = ready ? `${countLabel(capabilities.council, MODEL)} جاهزة` : 'غير متاح الآن';

  const canImage = Boolean(capabilities?.transcribers?.length);
  $('tab-image').disabled = !canImage;
  $('tab-image').title = canImage ? '' : 'تفريغ الصور غير متاحٍ الآن';

  hint.textContent = capabilities ? '' : 'المكتبة الحيّة غير متاحة الآن — البحث في الفهرس المنشور وحده.';
}

// ── البطاقة ────────────────────────────────────────────────────────────────
function card(v) {
  const el = document.createElement('article');
  el.className = 'card';
  const trust = TRUST[v.source?.trust] ?? TRUST.circulated;

  // ★ تصحيحُ المستخدم يعلو على نقل المصدر، ويُوسم بأنه منه لا منه ★
  const fix = corrections.get(fingerprint(v.text));
  const poet = fix
    ? `${esc(fix.poet)} <span class="fixed-by-you">— صحّحتَها أنت</span>`
    : v.disputedPoets
      ? `يُنسب إلى ${v.disputedPoets.map(esc).join('، وإلى ')}`
      : v.poet ? esc(v.poet) : '<span class="unknown">قائله غير معروف</span>';

  const life = v.deathYear
    ? `ت ${ar(String(v.deathYear))}هـ${v.deathYearGregorian ? ` / ${ar(String(v.deathYearGregorian))}م` : ''}`
    : '';
  const era = v.era?.name ?? (v.deathYear ? '' : 'عصره غير معروف');

  const s = v.source ?? {};
  const where = s.bookName
    ? `${esc(s.bookName)}${s.printedPage ? ` — ص ${ar(String(s.printedPage))}` : ''}`
    : `${esc(s.siteName ?? 'مصدر')}${s.pageTitle ? ` — <bdi dir="auto">${esc(s.pageTitle.slice(0, 60))}</bdi>` : ''}`;
  const link = s.url
    ? ` · <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" title="${esc(s.urlNote ?? '')}">افتح المصدر ↗</a>`
    : '';

  const caveat = s.trustNote ? `<p class="caveat">${esc(s.trustNote)}</p>` : '';
  const pairing = s.pairing === 'lines'
    ? '<p class="caveat">قُرئ بقرن الأسطر المتّفقة الرويّ، لا بفاصلٍ صريحٍ بين الشطرين.</p>' : '';
  const nabati = v.register === 'nabati'
    ? `<span class="badge t-nabati">نبطي${v.registerConfidence < 0.6 ? ' (ترجيح)' : ''}</span>` : '';
  // ★ البيت المدوَّر ليس نصًّا معطوبًا — يُقال للقارئ ما هو ★
  const mudawwar = v.mudawwar
    ? `<span class="badge t-mudawwar" title="الكلمة «${esc(v.splitWord ?? '')}» موزَّعةٌ على الشطرين كما في المطبوع">مدوَّر</span>` : '';

  const ls = v.lifespanSource;
  const dated = ls
    ? `<p class="src">التأريخ من ${esc(ls.label)}${ls.printedPage ? ` ص ${ar(String(ls.printedPage))}` : ''}${
        v.poetResolved && v.poetResolved !== v.poet ? ` — ترجمة «${esc(v.poetResolved)}»` : ''}</p>`
    : (v.poet && !v.deathYear ? '<p class="src unknown">لم تُعرف سنة وفاته، فلم يُذكر عصره.</p>' : '');

  const via = v.matchedQueries?.length > 1
    ? `<p class="src">بلغته ${ar(String(v.matchedQueries.length))} مداخلَ للمعنى: ${v.matchedQueries.map(esc).join(' · ')}</p>`
    : '';
  const occurrences = v.occurrences > 1 ? ` · ورد في ${countLabel(v.occurrences, PLACE)}` : '';

  const isSaved = saved.has(v.text);
  el.innerHTML = `
    <p class="verse">${esc(v.sadr ?? v.text)}${v.ajz ? `<span class="sep">...</span>${esc(v.ajz)}` : ''}</p>
    <div class="meta">
      <span class="poet">${poet}</span>
      ${life ? `<span>${life}</span>` : ''}
      ${era ? `<span>${esc(era)}</span>` : ''}
      <span class="badge ${trust.cls}">${trust.label}</span>
      ${nabati}${mudawwar}
    </div>
    <p class="src">${where}${link}${occurrences}</p>
    ${caveat}${pairing}${dated}${via}
    <div class="actions">
      <button type="button" data-act="copy">انسخ</button>
      <button type="button" data-act="save" class="${isSaved ? 'on' : ''}">${isSaved ? '★ محفوظ' : '☆ احفظ'}</button>
      ${s.bookId && capabilities ? '<button type="button" data-act="ctx" class="quiet">أرِني الصفحة</button>' : ''}
      <button type="button" data-act="fix" class="quiet">صحّح النسبة</button>
      <button type="button" data-act="no" class="quiet">ليس موافقًا</button>
    </div>
    <div class="context" hidden></div>`;

  el.querySelector('[data-act="copy"]').addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(verseToText(v));
      e.target.textContent = '✓ نُسخ';
      setTimeout(() => { e.target.textContent = 'انسخ'; }, 1600);
    } catch { e.target.textContent = 'تعذّر النسخ'; }
  });
  el.querySelector('[data-act="save"]').addEventListener('click', (e) => {
    const now = saved.toggle(v, ($('group-name')?.value.trim() || DEFAULT_GROUP));
    e.target.textContent = now ? '★ محفوظ' : '☆ احفظ';
    e.target.classList.toggle('on', now);
    refreshSavedBar();
  });
  el.querySelector('[data-act="fix"]').addEventListener('click', () => {
    const current = fix?.poet ?? v.poet ?? '';
    const answer = prompt('من قائل هذا البيت؟ (اتركه فارغًا لإلغاء تصحيحك)', current);
    if (answer === null) return;
    corrections.set(fingerprint(v.text), answer.trim(), '');
    renderVerses();
  });
  el.querySelector('[data-act="ctx"]')?.addEventListener('click', async (e) => {
    const box = el.querySelector('.context');
    if (!box.hidden) { box.hidden = true; e.target.textContent = 'أرِني الصفحة'; return; }
    e.target.textContent = 'يجلب…';
    try {
      const r = await fetch(`${BRIDGE}/v1/context`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}) },
        body: JSON.stringify({ book_id: s.bookId, page_id: s.pageId, around: v.sadr ?? v.text }),
      });
      const d = await r.json();
      box.textContent = r.ok ? (d.excerpt || 'لا نصّ في هذه الصفحة.') : (d.error ?? 'تعذّر جلب الصفحة.');
    } catch { box.textContent = 'تعذّر الاتصال بالجسر.'; }
    box.hidden = false;
    e.target.textContent = 'أخفِ الصفحة';
  });
  el.querySelector('[data-act="no"]').addEventListener('click', () => {
    rejected.add(v.text);
    lastVerses = lastVerses.filter((x) => x.text !== v.text);
    renderVerses();
  });
  return el;
}

// ── العرض والمرشِّح ────────────────────────────────────────────────────────
function allowedTrusts() {
  return new Set([...document.querySelectorAll('.trust-filter:checked')].map((c) => c.value));
}

let statusTail = '';
let lastRanking = null;

const SORTS = {
  score: (a, b) => (b.score ?? 0) - (a.score ?? 0),
  oldest: (a, b) => (a.deathYear ?? Infinity) - (b.deathYear ?? Infinity),
  newest: (a, b) => (b.deathYear ?? -Infinity) - (a.deathYear ?? -Infinity),
  poet: (a, b) => String(a.poet ?? 'ي').localeCompare(String(b.poet ?? 'ي'), 'ar'),
};

function renderVerses(tail) {
  if (tail !== undefined) statusTail = tail;
  const allowed = allowedTrusts();
  const sort = SORTS[$('sort')?.value] ?? SORTS.score;
  const shown = lastVerses
    .filter((v) => allowed.has(v.source?.trust ?? 'circulated'))
    .sort(sort);
  results.replaceChildren();
  for (const v of shown) results.append(card(v));

  const hidden = lastVerses.length - shown.length;
  $('filters').hidden = !lastVerses.length;
  $('filter-note').textContent = hidden ? `أُخفي ${countLabel(hidden, HIDDEN)} بسبب درجة التوثيق.` : '';

  // ★ أساسُ الترتيب يُقال، وضعفُه لا يُكتم ★
  const note = $('ranking-note');
  const basis = lastRanking?.basis ?? null;
  note.textContent = (shown.length && $('sort').value === 'score' && basis) ? (lastRanking.note ?? rankingNote(basis) ?? '') : '';
  note.classList.toggle('weak', basis === 'lexical');

  // ★ العدّاد يصف ما على الشاشة لا ما جاء من البحث ★
  setStatus(shown.length
    ? `${countLabel(shown.length, MATCHED_VERSE)}${statusTail}`
    : (lastVerses.length ? 'كلُّ ما وُجد مُخفًى بالمرشِّح أعلاه.' : ''));
}

function refreshSavedBar() {
  const n = saved.all().length;
  $('saved-bar').hidden = !n;
  $('saved-count').textContent = countLabel(n, HIDDEN);
  $('group-list').innerHTML = saved.groups().map((g) => `<option value="${esc(g)}">`).join('');
}

/** ما بحثتَ عنه قريبًا — يُستعاد بنقرة. */
function renderHistory() {
  const list = history.all();
  const box = $('history');
  box.hidden = !list.length;
  box.innerHTML = list.map((h) =>
    `<span class="chip" role="button" tabindex="0" title="${esc(h)}">${esc(h.replace(/\s+/g, ' ').slice(0, 42))}${h.length > 42 ? '…' : ''}</span>`).join('');
  for (const [i, chip] of [...box.querySelectorAll('.chip')].entries()) {
    const restore = () => { q.value = list[i]; refreshSearchButton(); q.focus(); };
    chip.addEventListener('click', restore);
    chip.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); restore(); } });
  }
}

// ── مجلس النماذج ───────────────────────────────────────────────────────────
function renderCouncil(c, web) {
  const panel = $('council');
  if (!c) { panel.hidden = true; return; }
  panel.hidden = false;

  const seen = new Set();
  $('council-meanings').innerHTML = (c.meanings ?? [])
    .filter((m) => { const k = m.meaning.trim(); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((m) => `<p>«${esc(m.meaning)}» <span class="who">— ${esc(m.model.split('/').pop())}</span></p>`)
    .join('') || '<p class="who">لم يصف أحدٌ منهم المعنى.</p>';

  $('council-queries').innerHTML = (c.perQuery ?? c.queries ?? []).map((x) => {
    const agreed = (x.models?.length ?? 1) > 1;
    const cls = ['chip', agreed ? 'agreed' : '', x.found === 0 ? 'empty' : ''].filter(Boolean).join(' ');
    const n = agreed ? `<span class="n">${ar(String(x.models.length))} نماذج</span>` : '';
    const title = x.found === 0 ? 'لم يجد هذا المدخل شيئًا' : `وجد ${ar(String(x.found ?? 0))}`;
    return `<span class="${cls}" title="${esc(title)}">${esc(x.text)}${n}</span>`;
  }).join('');

  const parts = [`استشير ${countLabel(c.members?.length ?? 0, MODEL)}، أجاب منهم ${ar(String(c.answered?.length ?? 0))}`];
  if (c.failed?.length) parts.push(`وسقط ${ar(String(c.failed.length))}`);
  if (c.rejected?.length) parts.push(`ورُفض ${ar(String(c.rejected.length))} من اقتراحاتهم`);
  let note = parts.join('، ') + '.';
  if (web) {
    note += web.enabled
      ? ` وبُحث في الشبكة: قُرئت ${countLabel(web.fetched, PAGE)}.`
      : ' ولم يُبحث في الشبكة (لا مزوّد بحثٍ مضبوط)، والنبطيُّ مصدرُه الشبكة.';
  }
  $('council-note').textContent = note;
}

// ── البحث ─────────────────────────────────────────────────────────────────
async function fetchFor(verse, useCouncil) {
  const endpoint = useCouncil ? '/v1/council' : '/v1/verses';
  const res = await fetch(`${BRIDGE}${endpoint}`, {
    method: 'POST',
    signal: controller?.signal,
    headers: { 'content-type': 'application/json', ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}) },
    body: JSON.stringify(useCouncil ? { query: verse } : { query: verse, mode: 'near', distance: 10, limit: 20 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error ?? `تعذّر البحث (${res.status})`); e.code = data.code; throw e; }
  return data;
}

async function search() {
  // ★ بحثُ المجلس قد يطول دقيقة — فزرُّ البحث يصير زرَّ إيقاف ★
  if (searching) { controller?.abort(); return; }
  const raw = q.value.trim();

  if (!raw) { setStatus('اكتب بيتًا أولًا.', 'warn'); return; }
  // ★ «لا نتيجة» و«هذا ليس بيتًا» جوابان مختلفان — وخلطُهما يُضلّل ★
  if (!looksArabic(raw)) {
    setStatus('هذا لا يبدو بيتًا عربيًّا. اكتب بيتًا أو شطرًا بالعربية.', 'warn');
    return;
  }

  const verses = splitVerses(raw);
  const useCouncil = $('use-council')?.checked && Boolean(capabilities?.council);
  history.add(raw);
  renderHistory();
  controller = new AbortController();
  searching = true;
  btn.disabled = false;              // يبقى مفتوحًا ليُضغط للإيقاف
  btn.textContent = '■ أوقف البحث';
  btn.classList.add('stopping');
  results.replaceChildren();
  lastVerses = [];
  $('filters').hidden = true;
  $('council').hidden = true;

  // ★ الأبيات المتعددة تُبحث بيتًا بيتًا وتُجمع — كانت تُبحث نصًّا واحدًا فتُخفق ★
  const merged = new Map();
  let pagesRead = 0, rejectedCount = 0, anyCouncil = null, anyWeb = null, bridgeFailed = false;

  for (const [i, verse] of verses.entries()) {
    setStatus(verses.length > 1
      ? `يبحث… ${ar(String(i + 1))} من ${countLabel(verses.length, VERSE_IN)}`
      : 'يبحث في المصادر…');

    if (controller.signal.aborted) break;

    let data = null;
    if (capabilities) {
      try { data = await fetchFor(verse, useCouncil); }
      catch (e) {
        if (e.name === 'AbortError') break;
        if (e.code === 'NO_COUNCIL') { try { data = await fetchFor(verse, false); } catch { /* يسقط للفهرس */ } }
        if (!data) bridgeFailed = true;
      }
    }
    if (!data) { try { data = await searchStatic(verse, { excludeVerse: verse }); } catch { data = null; } }
    if (!data) continue;

    pagesRead += data.pagesRead ?? 0;
    rejectedCount += data.rejectedCount ?? 0;
    anyCouncil ??= data.council ?? null;
    anyWeb ??= data.web ?? null;
    lastRanking = data.ranking ?? lastRanking;

    for (const v of data.verses ?? []) {
      if (rejected.has(v.text)) continue;              // ما قال عنه «ليس موافقًا»
      const prev = merged.get(v.text);
      if (prev) {
        prev.matchedQueries = [...new Set([...(prev.matchedQueries ?? []), ...(v.matchedQueries ?? [])])];
      } else merged.set(v.text, v);
    }
  }

  const stopped = controller.signal.aborted;
  lastVerses = [...merged.values()];
  searching = false;
  controller = null;
  btn.textContent = 'ابحث عن الموافقات';
  btn.classList.remove('stopping');
  refreshSearchButton();

  if (anyCouncil) renderCouncil(anyCouncil, anyWeb);

  if (stopped && !lastVerses.length) { setStatus('أُوقف البحث.', 'warn'); return; }

  if (!lastVerses.length) {
    const why = (bridgeFailed || !capabilities)
      ? ' والمكتبة الحيّة غير متاحة الآن، فلم يُبحث إلا في الفهرس المنشور.' : '';
    // ★ لا تُركَّب الجملة على ناتج العدد: «قُرئت لم تُقرأ صفحة» كسرٌ ظاهر ★
    const read = pagesRead ? ` — قُرئت ${countLabel(pagesRead, PAGE)}` : '';
    const advise = useCouncil ? ' جرّب صياغةً أخرى للبيت.'
      : (capabilities?.council ? ' وقد يوسّع «مجلس النماذج» المدخل.' : '');
    setStatus(`لم يُوجد بيتٌ موافق${read}.${why}${advise}`);
    return;
  }

  const bits = [];
  if (pagesRead) bits.push(` — ${countLabel(pagesRead, PAGES_READ)}`);
  if (rejectedCount) bits.push(` · ${countLabel(rejectedCount, SUGGESTION)} لم يثبت في مصدرٍ فلم يُعرض`);
  if (bridgeFailed || !capabilities) bits.push(' · من الفهرس المنشور وحده');
  if (stopped) bits.push(' · أُوقف البحث قبل تمامه');
  renderVerses(bits.join(''));
}

// ── التبويبان ──────────────────────────────────────────────────────────────
const tabs = [
  { btn: $('tab-text'), pane: $('pane-text'), mode: 'text' },
  { btn: $('tab-image'), pane: $('pane-image'), mode: 'image' },
];

function refreshSearchButton() {
  if (searching) { btn.disabled = false; return; }   // زرّ الإيقاف يبقى مفتوحًا
  btn.disabled = mode === 'text' ? !q.value.trim() : !imageApproved;
}

for (const t of tabs) {
  t.btn?.addEventListener('click', () => {
    if (t.btn.disabled) return;
    mode = t.mode;
    for (const o of tabs) {
      o.btn.setAttribute('aria-selected', String(o === t));
      o.pane.hidden = o !== t;
    }
    refreshSearchButton();
  });
}

btn.addEventListener('click', search);
q.addEventListener('input', refreshSearchButton);
q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) search(); });
for (const c of document.querySelectorAll('.trust-filter')) c.addEventListener('change', () => renderVerses());
$('sort')?.addEventListener('change', () => renderVerses());

installApproval({
  bridge: BRIDGE, token: TOKEN,
  onApproved: (text) => { imageApproved = true; q.value = text; refreshSearchButton(); },
  onUnapproved: () => { imageApproved = false; refreshSearchButton(); },
});

// اسمُ الملف لاتينيٌّ عمدًا: بعض المتصفّحات تُسقط الاسم العربيّ فيصير «download»
// بلا امتداد، فلا يُفتح بنقرة. والمحتوى عربيٌّ كما هو.
$('export-saved')?.addEventListener('click', () => downloadText('muwafaqat-saved.txt', exportText()));
$('clear-saved')?.addEventListener('click', () => {
  if (confirm('تُحذف المحفوظات كلها. أمتأكّد؟')) { saved.clear(); refreshSavedBar(); renderVerses(); }
});

refreshSavedBar();
renderHistory();
refreshSearchButton();
probeBridge();
