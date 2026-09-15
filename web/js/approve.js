// مسار الصورة: إفلات ← تفريغٌ بنموذجين ← شاشة اعتماد ← ثم البحث.
//
// ★ القيد الصريح: زرّ البحث معطَّلٌ حتى يضغط المستخدم «اعتمدتُ التفريغ». ★
//   وأي تعديلٍ على النصّ بعد الاعتماد يُسقط الاعتماد ويُعيد الزرّ معطَّلًا،
//   فلا يُبحث أبدًا بنصٍّ لم تره عينُ صاحبه بصورته الأخيرة.

import { countLabel, DIFFERENCE } from '../../core/plural.js';
import { toArabicDigits } from '../../core/normalize.js';

const MAX_BYTES = 8 * 1024 * 1024;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** يرسم المقاطع: ما اختلف فيه النموذجان مُبرَزٌ بلونٍ وبعلامة، لا بلونٍ وحده. */
export function renderDiff(segments) {
  if (!segments) return '';
  const legend = `<div class="diff-legend">
      <span class="lg-word">اختلف النموذجان في الكلمة</span>
      <span class="lg-vowel">اختلفا في التشكيل وحده</span>
    </div>`;
  const body = segments.map((s) => {
    if (s.type === 'same' && s.a.every((w) => w === '\n')) return '<br>';
    const a = esc(s.a.join(' ')).replace(/\n/g, '<br>');
    if (s.type === 'same') return `<span class="w-same">${a}</span>`;
    if (s.type === 'vowel') return `<span class="w-vowel" title="اختلاف تشكيل — القراءة الأخرى: ${esc(s.b.join(' '))}">${a}</span>`;
    const b = esc(s.b.join(' ')) || '(لا شيء)';
    const shown = a || '(لا شيء)';
    return `<span class="w-word" title="القراءة الأخرى: ${b}">${shown} <span class="alt">⟨${b}⟩</span></span>`;
  }).join(' ');
  return legend + body;
}

export function summarize(result) {
  if (!result.compared) return result.note ?? 'فُرِّغت بنموذجٍ واحد.';
  const n = result.disagreements;
  const pct = toArabicDigits(String(Math.round(result.agreement * 100)));
  const models = result.readings.map((r) => r.provider).join(' و');
  return n === 0
    ? `اتفق النموذجان (${models}) اتفاقًا تامًّا. راجِعه على الصورة مع ذلك.`
    : `${countLabel(n, DIFFERENCE)} بين ${models} — الاتفاق ${pct}٪. المواضع المُبرَزة هي التي تحتاج نظرك.`;
}

export function install({ bridge, token, onApproved, onUnapproved }) {
  const $ = (id) => document.getElementById(id);
  const drop = $('drop'), file = $('file'), preview = $('preview'), previewImg = $('preview-img');
  const approve = $('approve'), diff = $('diff'), transcript = $('transcript');
  const approveBtn = $('approve-btn'), summary = $('approve-summary');
  if (!drop) return;

  let approved = false;

  const setApproved = (v) => {
    approved = v;
    approveBtn.disabled = v;
    approveBtn.textContent = v ? '✓ اعتُمد' : 'اعتمدتُ التفريغ';
    (v ? onApproved : onUnapproved)?.(transcript.value.trim());
  };

  async function handleFile(f) {
    if (!f) return;
    if (!f.type.startsWith('image/')) { summary.textContent = 'هذا ليس ملف صورة.'; summary.className = 'hint err'; return; }
    if (f.size > MAX_BYTES) { summary.textContent = 'الصورة أكبر من ٨ ميغابايت. صغّرها ثم أعد المحاولة.'; summary.className = 'hint err'; return; }

    previewImg.src = URL.createObjectURL(f);
    preview.hidden = false;
    drop.hidden = true;            // اختيرت الصورة، فلا حاجة لمنطقة الإفلات
    approve.hidden = false;
    diff.innerHTML = '';
    transcript.value = '';
    summary.className = 'hint';
    summary.textContent = 'يُفرَّغ بنموذجين…';
    approveBtn.disabled = true;
    setApproved(false);

    try {
      const base64 = await toBase64(f);
      const res = await fetch(`${bridge}/v1/transcribe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ image: base64, mimeType: f.type }),
      });
      const data = await res.json();
      if (!res.ok) {
        summary.className = 'hint err';
        summary.textContent = data.code === 'NO_PROVIDER'
          ? 'لم يُضبط مفتاح تفريغٍ بعد. اضبط GEMINI_API_KEY في الجسر — أو الصق النصّ في تبويب «نصّ».'
          : `تعذّر التفريغ: ${data.error ?? res.status}`;
        approveBtn.disabled = true;
        return;
      }
      diff.innerHTML = renderDiff(data.segments);
      transcript.value = data.text;
      summary.textContent = summarize(data);
      approveBtn.disabled = false;
    } catch (e) {
      summary.className = 'hint err';
      summary.textContent = `تعذّر الاتصال بالجسر: ${e.message}`;
    }
  }

  const toBase64 = (f) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('تعذّرت قراءة الملف'));
    r.readAsDataURL(f);
  });

  drop.addEventListener('click', () => file.click());
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
  file.addEventListener('change', () => handleFile(file.files?.[0]));
  $('change-image')?.addEventListener('click', () => file.click());

  for (const ev of ['dragenter', 'dragover']) {
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); });
  }
  for (const ev of ['dragleave', 'drop']) {
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); });
  }
  drop.addEventListener('drop', (e) => handleFile(e.dataTransfer?.files?.[0]));

  // ★ التعديل بعد الاعتماد يُسقط الاعتماد ★
  transcript.addEventListener('input', () => { if (approved) setApproved(false); });
  approveBtn.addEventListener('click', () => { if (transcript.value.trim()) setApproved(true); });
}
