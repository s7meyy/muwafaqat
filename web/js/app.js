// واجهة «الموافقات».
//
// أُعيدت كتابتها بعد جولةِ مستخدمٍ كشفت أن أول زيارةٍ طريقٌ مسدود، وأن الأبيات
// المتعددة تُخفق صامتةً، وأن البطاقة بلا زرٍّ واحد. فالمبادئ التي بُنيت عليها:
//
//  ١) لا رسالةَ مطوِّرٍ في وجه المستخدم، ولا كلمةَ إنجليزيةٍ تتسرّب.
//  ٢) ما يقوله العدّاد يجب أن يوافق ما على الشاشة: إن أُخفيت بطاقةٌ تغيّر العدّاد.
//  ٣) البيت الذي يجده المستخدم نافعًا يجب أن يستطيع أخذه معه — نسخًا أو حفظًا
//     أو تصديرًا. وإلّا فعملُه محبوسٌ في متصفّح.

import { toArabicDigits as ar, fingerprint, stripDiacritics } from '../../core/normalize.js';
import { matchReason, markShared } from '../../core/why.js';
import { citationOf } from '../../core/citation.js';
import { rhyme, meterOf } from '../../core/prosody.js';
import { missingCategories } from '../../core/categories.js';
import { imagesOf } from '../../core/imagery.js';
import { rankingNote } from '../../core/semantic.js';
import { countLabel, PAGE, PLACE, SUGGESTION, MATCHED_VERSE, PAGES_READ, VERSE, BOOK_IN, POET } from '../../core/plural.js';
import { splitVerses, looksArabic, inputKind } from '../../core/input.js';
import { install as installApproval } from './approve.js';
import { searchStatic, semanticMatches, indexMeta, imageryIndex, versesByIds, auditReport, contextOf } from './static-index.js';
import { saved, rejected, corrections, history, verseToText, exportText, downloadText, DEFAULT_GROUP } from './collections.js';
import { researchHtml, csv, bibtexAll, byOldest } from '../../core/export.js';
import { similarity } from '../../core/dedupe.js';

// حالةُ زرّ الشكل تُقرأ من اختيار القارئ السابق
queueMicrotask(() => { const t = document.getElementById('tashkeel'); if (t) t.checked = showTashkeel; });

const BRIDGE = localStorage.getItem('muwafaqat.bridge') || 'http://127.0.0.1:8787';
const TOKEN = localStorage.getItem('muwafaqat.token') || '';

// ★ ترويسة الطلب لا تحتمل غير اللاتينية. ★ ومفتاحٌ فيه حرفٌ عربيّ يجعل المتصفّح
// يرمي قبل أن يُرسل شيئًا، فيسقط البحث إلى الفهرس ★ صامتًا ★ — ويظنّ صاحبه أن
// كل شيءٍ يعمل وهو محرومٌ من المجلس والشبكة والمكتبة الحيّة.
const TOKEN_MALFORMED = TOKEN !== '' && /[^\x20-\x7E]/.test(TOKEN);
const SAFE_TOKEN = TOKEN_MALFORMED ? '' : TOKEN;

// ★ الشكل خيارُ القارئ لا خيارُ الطبعة. ★ الفهرس فيه المشكول وغيره، فالصفحة
// تخرج مختلطة: بيتٌ بالشكل وبيتٌ بغيره. والباحث ينسخ ما يختار لا ما وقع.
const TASHKEEL_KEY = 'muwafaqat.tashkeel';
let showTashkeel = localStorage.getItem(TASHKEEL_KEY) !== 'off';
export const shaped = (t) => (showTashkeel ? String(t ?? '') : stripDiacritics(String(t ?? '')));

// أسماءُ الحروف كما يكتبها العروضيّون: «رويّ الميم» لا «رويّ م»
const HARF = {
  ء: 'الهمزة', ب: 'الباء', ت: 'التاء', ث: 'الثاء', ج: 'الجيم', ح: 'الحاء', خ: 'الخاء',
  د: 'الدال', ذ: 'الذال', ر: 'الراء', ز: 'الزاي', س: 'السين', ش: 'الشين', ص: 'الصاد',
  ض: 'الضاد', ط: 'الطاء', ظ: 'الظاء', ع: 'العين', غ: 'الغين', ف: 'الفاء', ق: 'القاف',
  ك: 'الكاف', ل: 'اللام', م: 'الميم', ن: 'النون', ه: 'الهاء', و: 'الواو', ي: 'الياء',
  ة: 'التاء', ى: 'الألف', ا: 'الألف',
};
const harfName = (c) => HARF[c] ?? c;

// تطبيعٌ خفيفٌ للترشيح داخل النتائج: بلا شكلٍ ولا فرقٍ بين صور الألف
const normalizeQuery = (t) => stripDiacritics(String(t ?? '')).replace(/[أإآ]/g, 'ا').trim();

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
let askedVerse = '';        // بيتُ السائل — به يُعرف سببُ ظهور كلّ نتيجة
// ★ ومن لصق قصيدةً: كلُّ نتيجةٍ تُنسب إلى البيت الذي أوجبها من أبياته. ★
//   كان السببُ يُحسب على مجموع ما لُصق، فيُقال «لم يشترك إلا في: فقد» — و«فقد»
//   من بيته الأول لا الثاني، فيصير الجوابُ بلا معنًى كلما كثُر السؤال.
let askedList = [];
// ★ عشرون نتيجةً وكفى — ولا «مزيد». ★ من بحث في معنًى شائعٍ لا يرى إلا عشرين
//   ولا يعلم أن وراءها شيئًا، فيبني إحصاءً على العشرين.
let shownLimit = 20;
let canFetchMore = false;
let capabilities = null;   // ما يقدر عليه الجسر: تفريغ · مجلس · شبكة
let searching = false;
let imageApproved = false;
let mode = 'text';
let controller = null;   // لإلغاء بحثٍ طال
let startedAt = 0;       // متى بدأ البحث — لتمييز الضغطة المكرَّرة من الإيقاف

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

/** يُقال للمستخدم إن مفتاحه هو المانع — لا أن يُترك يظنّ الجسر مغلقًا. */
function warnAuth() {
  hint.textContent = TOKEN_MALFORMED
    ? 'مفتاح الجسر فيه حروفٌ غير لاتينية، والمتصفّح لا يرسله. صحّحه في muwafaqat.token.'
    : 'الجسر يعمل لكنه يرفض مفتاحك. راجع BRIDGE_TOKEN — فما تراه من الفهرس المنشور وحده.';
  hint.classList.add('warn');
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

  hint.classList.toggle('warn', TOKEN_MALFORMED);
  hint.textContent = TOKEN_MALFORMED
    ? 'مفتاح الجسر فيه حروفٌ غير لاتينية، والمتصفّح لا يرسله. صحّحه في muwafaqat.token.'
    : (capabilities ? '' : 'المكتبة الحيّة غير متاحة الآن — البحث في الفهرس المنشور وحده.');
}

// ── البطاقة ────────────────────────────────────────────────────────────────
function card(v, rank = 0) {
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

  // ★ اختلافُ الكتب في القائل خبرٌ يُقال، لا يُرجَّح فيه ولا يُكتم. ★
  //   وكثيرٌ من الشعر مختلَفٌ في نسبته، وعرضُ قولٍ واحدٍ كأنه إجماعٌ تدليس.
  // ★ وكثرةُ المختلفين لا تُسرد في سطر: ★ بيتٌ تنسبه عشرةُ كتبٍ لعشرةٍ يملأ
  //   البطاقة بالأسماء. فثلاثةٌ ثم عددُ الباقين، وتُكشف عند الطلب.
  // ★ ولا يُقال «اختلفت الكتب» والخلافُ في كتابٍ واحد ★ — «طبقات فحول الشعراء»
  //   يذكر الخلافَ في صفحته: «فجعلها يونس لعبيد… فلما قدم المفضّل صرفها إلى
  //   أوس بن حجر». فالعبارةُ تصف الخلافَ ولا تدّعي عددَ من اختلف.
  const disputed = v.disputedPoets
    ? `<p class="caveat">اختُلف في نسبته — فهو عند ${
        v.disputedPoets.slice(0, 3).map(esc).join('، وعند ')}`
      + (v.disputedPoets.length > 3
        ? `، <details class="more-poets"><summary>وإلى ${ar(String(v.disputedPoets.length - 3))} غيرهم</summary>`
          + `${v.disputedPoets.slice(3).map(esc).join(' · ')}</details>` : '')
      + '. ولم يُرجَّح.</p>'
    : '';

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

  // ★ المعقوفتان حكمُ المحقّق لا زينة ★ — وقصُّهما صامتًا إخفاءُ حكمٍ علميّ
  const doubted = v.doubted
    ? '<p class="caveat">وردَ بين معقوفتين في المطبوع — وهي علامةُ المحقّق على أن البيت'
      + ' زائدٌ أو مشكوكٌ في نسبته، لا زيادةَ منّا.</p>' : '';

  const caveat = s.trustNote ? `<p class="caveat">${esc(s.trustNote)}</p>` : '';
  const pairing = s.pairing === 'lines'
    ? '<p class="caveat">قُرئ بقرن الأسطر المتّفقة الرويّ، لا بفاصلٍ صريحٍ بين الشطرين.</p>' : '';
  const nabati = v.register === 'nabati'
    ? `<span class="badge t-nabati">نبطي${v.registerConfidence < 0.6 ? ' (ترجيح)' : ''}</span>` : '';
  // ★ البيت المدوَّر ليس نصًّا معطوبًا — يُقال للقارئ ما هو ★
  // ★ موافقةٌ في المعنى: يُقال للقارئ لِمَ ظهر هذا البيت وليس فيه كلمةٌ من بيته ★
  const bySense = v.semantic
    ? `<span class="badge t-sense" title="متجهُ المعنى قرّب البيتين، وقد حُسب يوم الفهرسة">موافقةٌ في المعنى${
        v.similarity ? ` (${ar(String(Math.round(v.similarity * 100)))}٪)` : ''}</span>` : '';
  // ★ المشطور بيتٌ تامّ لا بيتٌ نقص عجزُه ★ — والأرجوزة تُنظم هكذا
  const mashtur = v.mashtur
    ? '<span class="badge t-mudawwar" title="بيتٌ مشطور: شطرٌ واحدٌ تامّ، وهو بناءُ الأرجوزة">مشطور</span>' : '';
  // ★ نُقل كما ورد في النثر: يُقال، ولا يُقسم شطرين بالتخمين ★
  const unsplit = v.unsplit
    ? '<span class="badge t-mudawwar" title="ساقه الكتابُ داخل نثره بلا فصلٍ بين الشطرين، فنُقل كما ورد">لم يُفصل شطراه</span>' : '';
  // ★ من شرح الكتاب لا من متنه ★ — شاهدٌ ساقه الشارح أو بيتُ تصويبٍ أورده،
  //   فلا يُنسب إلى صاحب الكتاب، ويُقال للباحث من أين جاء ليعود إليه.
  const commentary = v.fromCommentary
    ? '<span class="badge t-mudawwar" title="ورد في شرح الكتاب (كلام الشارح) لا في متنه — فقائله لا يُؤخذ من عنوان الكتاب">من الشرح</span>' : '';
  const mudawwar = v.mudawwar
    ? `<span class="badge t-mudawwar" title="الكلمة «${esc(v.splitWord ?? '')}» موزَّعةٌ على الشطرين كما في المطبوع">مدوَّر</span>` : '';

  // ★★ ما كتبه الكتابُ نفسه عن القصيدة: بحرُها وغرضُها ومناسبتُها. ★★
  //   وكنتُ أمسِ أعتذر عن البحر لأن التقطيع الآليّ لا يفصل بين البحور —
  //   والديوانُ يكتبه فوق قصيدته: «فتىً كان [الطويل]». فالمصدرُ في النصّ.
  const said = [];
  if (v.meter) said.push(`البحر: ${esc(v.meter)}`);
  if (v.purpose) said.push(`الغرض: ${esc(v.purpose)}`);
  const context = said.length || v.occasion
    ? `<p class="said">${said.join(' · ')}${v.occasion ? `${said.length ? ' · ' : ''}قاله ${esc(v.occasion)}` : ''}`
      + '<span class="hint"> — من الكتاب نفسه</span></p>'
    : '';

  // ★ شرحُ الغريب من حاشية المحقّق ★ — وهو أوّلُ ما يحتاجه الباحث في الصور
  //   الشعرية، وكان يُطرح مع الحاشية طرحًا.
  const glosses = v.glosses?.length
    ? '<details class="glosses"><summary>شرحُ غريبه (من حاشية المحقّق)</summary><dl>'
      + v.glosses.map((g) => `<dt>${esc(g.word)}</dt><dd>${esc(g.gloss)}</dd>`).join('')
      + '</dl></details>'
    : '';

  // ★ الروايةُ الأخرى مصرَّحٌ بها في الحاشية ★ — واختلافُ الرواية مادّةُ بحث
  const variant = v.variant
    ? `<p class="src">${v.variantSource ? `وفي نسخة «${esc(v.variantSource)}»` : 'وفي روايةٍ'}: `
      + `<bdi>${esc(v.variant)}</bdi>`
      + (v.variantNote ? `<span class="hint"> — وقال المحقّق: ${esc(v.variantNote)}</span>`
        : '<span class="hint"> — من حاشية المحقّق</span>') + '</p>'
    : '';

  // ★ صورةُ البيت — اقترانٌ مرصودٌ في لفظه، لا تصنيفٌ من عندنا ★
  const images = imagesOf(v.text);
  const imagery = images.length
    ? `<p class="src imagery-line">الصورة: ${images.slice(0, 2).map((i) => `<button type="button" class="img-link" data-img="${esc(i.label)}">${esc(i.label)}</button>`).join(' · ')}`
      + '<span class="hint"> — اقترانٌ مرصودٌ في ألفاظ البيت</span></p>'
    : '';

  // ★ القافية والرويّ — أوّلُ ما يكتبه الباحث في بطاقته، ويُحسبان حسابًا. ★
  //   والمعارضة (النظمُ على بحر قصيدةٍ ورويِّها) بابٌ أصيل، ومدخلُها الرويّ.
  const qafiya = rhyme(v.text);
  const scanned = meterOf(v.text);
  const prosody = qafiya
    ? `<div class="src prosody">القافية: رويُّ ${esc(harfName(qafiya.rawi))}`
      + (qafiya.tail.length > 1 ? ` (ـ${esc(qafiya.tail)})` : '')
      + `<details><summary>التقطيع</summary>`
      + `<span class="pattern" dir="ltr">${esc(scanned.pattern || '—')}</span>`
      + `<span class="hint"> (١ متحرّك · ٠ ساكن · ؟ لم يضبطه النصّ)</span>`
      + `<span class="hint"> — ${esc(scanned.reason ?? '')}`
      + (scanned.closest ? `، وأقربُ الأنماط ${esc(scanned.closest)} (استئناسًا لا حكمًا)` : '')
      + `</span></details></div>`
    : '';

  const ls = v.lifespanSource;
  const dated = ls
    ? `<p class="src">التأريخ من ${esc(ls.label)}${ls.printedPage ? ` ص ${ar(String(ls.printedPage))}` : ''}${
        v.poetResolved && v.poetResolved !== v.poet ? ` — ترجمة «${esc(v.poetResolved)}»` : ''}</p>`
    : (v.poet && !v.deathYear ? '<p class="src unknown">لم تُعرف سنة وفاته، فلم يُذكر عصره.</p>' : '');

  const via = v.matchedQueries?.length > 1
    ? `<p class="src">بلغته ${ar(String(v.matchedQueries.length))} مداخلَ للمعنى: ${v.matchedQueries.map(esc).join(' · ')}</p>`
    : '';
  const occurrences = v.occurrences > 1 ? ` · ورد في ${countLabel(v.occurrences, PLACE)}` : '';
  // ★ اتّفاقُ كتابين مستقلَّين على البيت أوثق من انفراد كتابٍ به ★
  const alsoIn = v.alsoIn?.length
    ? `<p class="src">وورد كذلك في: ${v.alsoIn.map(esc).join(' · ')}</p>` : '';
  const agreed = v.occurrences > 1 && !v.disputedPoets
    ? '<span class="badge t-agreed" title="ورد في أكثر من كتابٍ بالنسبة نفسها">تعاضدت عليه الكتب</span>' : '';

  const isSaved = saved.has(v.text);

  // ★ البيت يُعرض شِعرًا لا نثرًا: ★ شطران متقابلان، لا سطرٌ يلتفّ حيث انتهت
  //   الشاشة فيقطع الصدرَ في موضعٍ لا معنى له.
  const hemistich = (t) => markShared(shaped(t), v.askedFor ?? askedVerse)
    .map((w) => (w.shared ? `<mark>${esc(w.word)}</mark>` : esc(w.word)))
    .join(' ');
  const verseHtml = v.ajz
    ? `<span class="hemistich">${hemistich(v.sadr)}</span>`
      + '<span class="sep" aria-hidden="true">۞</span>'
      + `<span class="hemistich">${hemistich(v.ajz)}</span>`
    : `<span class="hemistich whole">${hemistich(v.text)}</span>`;

  // ★★ «لماذا ظهر هذا البيت؟» — وهي أنفع سطرٍ في البطاقة للباحث. ★★
  //   بغيرها لا يفرّق بين موافقةٍ في المعنى ومصادفةِ لفظٍ مشترك.
  const why = v.why ?? matchReason(v, v.askedFor ?? askedVerse);
  const forWhich = (askedList.length > 1 && v.askedFor)
    ? `<span class="for-which"> — عن بيتك: «${esc(v.askedFor.replace(/\s*(?:\.{3}|…).*$/, '').slice(0, 34))}…»</span>` : '';
  const whyHtml = `<p class="why why-${why.kind}">${ar(esc(why.label))}${forWhich}</p>`;

  el.innerHTML = `
    ${rank ? `<span class="rank" aria-hidden="true">${ar(String(rank))}</span>` : ''}
    <p class="verse">${verseHtml}</p>
    ${whyHtml}
    <div class="meta">
      <span class="poet">${poet}</span>
      ${life ? `<span>${life}</span>` : ''}
      ${era ? `<span>${esc(era)}</span>` : ''}
      <span class="badge ${trust.cls}">${trust.label}</span>
      ${nabati}${mashtur}${unsplit}${commentary}${mudawwar}${agreed}${bySense}
    </div>
    <p class="src">${where}${link}${occurrences}</p>
    ${context}${imagery}${prosody}${glosses}${variant}${alsoIn}${doubted}${disputed}${caveat}${pairing}${dated}${via}
    <div class="actions">
      <button type="button" data-act="copy">انسخ</button>
      <button type="button" data-act="save" class="${isSaved ? 'on' : ''}">${isSaved ? '★ محفوظ' : '☆ احفظ'}</button>
      ${s.bookId && capabilities ? '<button type="button" data-act="ctx" class="quiet">أرِني الصفحة</button>' : ''}
      ${v.id ? '<button type="button" data-act="poem" class="quiet">أرِني القصيدة</button>' : ''}
      <button type="button" data-act="more" class="quiet">أبياتٌ كهذا</button>
      <button type="button" data-act="cite" class="quiet">انسخ الإحالة</button>
      <button type="button" data-act="fix" class="quiet">صحّح النسبة</button>
      <button type="button" data-act="no" class="quiet">ليس موافقًا</button>
    </div>
    <div class="context" hidden></div>
    <div class="poem" hidden></div>`;

  el.querySelector('[data-act="copy"]').addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(verseToText({ ...v, text: shaped(v.text), sadr: shaped(v.sadr), ajz: shaped(v.ajz) }));
      e.target.textContent = '✓ نُسخ';
      setTimeout(() => { e.target.textContent = 'انسخ'; }, 1600);
    } catch { e.target.textContent = 'تعذّر النسخ'; }
  });
  // ★ «أبياتٌ كهذا» — توسيعُ البحث من نتيجةٍ لا من السؤال الأوّل. ★
  //   وهو أكثرُ ما يفعله الباحث حين يقع على بيتٍ قريب: يتتبّعه لا يعود أدراجه.
  for (const btn of el.querySelectorAll('.img-link')) {
    btn.addEventListener('click', () => openImagery(btn.dataset.img));
  }

  el.querySelector('[data-act="more"]').addEventListener('click', () => {
    q.value = v.text;
    refreshSearchButton();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    search();
  });

  // ★ الإحالة جاهزةٌ للحاشية ★ — والباحث كان ينسخها بيده من ثلاثة مواضع
  el.querySelector('[data-act="cite"]').addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(citationOf(v, { verse: shaped(v.text) }));
      e.target.textContent = '✓ نُسخت';
      setTimeout(() => { e.target.textContent = 'انسخ الإحالة'; }, 1600);
    } catch { e.target.textContent = 'تعذّر النسخ'; }
  });
  el.querySelector('[data-act="save"]').addEventListener('click', (e) => {
    const now = saved.toggle(v, ($('group-name')?.value.trim() || DEFAULT_GROUP));
    e.target.textContent = now ? '★ محفوظ' : '☆ احفظ';
    e.target.classList.toggle('on', now);
    refreshSavedBar();
    if (!$('notebook')?.hidden) renderNotebook();
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
        headers: { 'content-type': 'application/json', ...(SAFE_TOKEN ? { authorization: `Bearer ${SAFE_TOKEN}` } : {}) },
        body: JSON.stringify({ book_id: s.bookId, page_id: s.pageId, around: v.sadr ?? v.text }),
      });
      const d = await r.json();
      box.textContent = r.ok ? (d.excerpt || 'لا نصّ في هذه الصفحة.') : (d.error ?? 'تعذّر جلب الصفحة.');
    } catch { box.textContent = 'تعذّر الاتصال بالجسر.'; }
    box.hidden = false;
    e.target.textContent = 'أخفِ الصفحة';
  });
  // ★ «أرِني القصيدة» — البيتُ في سياقه لا مبتورًا ★
  //
  //   والبيتُ وحده يُقرأ خطأً: كم من بيتٍ ظُنَّ فخرًا وهو في سياقه هجاء. وهذه
  //   أبياتُه التي وردت معه في موضعه بترتيب الصفحة، تُجلب من الفهرس المنشور
  //   بلا جسرٍ ولا مفتاح. ولا يُدّعى أنها حدودُ القصيدة — يُقال للقارئ ما هو.
  el.querySelector('[data-act="poem"]')?.addEventListener('click', async (e) => {
    const box = el.querySelector('.poem');
    if (!box.hidden) { box.hidden = true; e.target.textContent = 'أرِني القصيدة'; return; }
    e.target.textContent = 'يجلب…';
    let run = null;
    try { run = await contextOf(v); } catch { run = null; }
    if (!run) {
      box.innerHTML = '<p class="poem-note">لم يُستخرج من هذا الموضع غيرُ هذا البيت،'
        + ' فلا سياقَ عندنا نعرضه. و«أرِني الصفحة» يفتح الصفحة كاملةً إن كان الجسرُ يعمل.</p>';
    } else {
      const here = fingerprint(v.text);
      const lines = run.map((x) => {
        const mine = fingerprint(x.text) === here;
        const [sadr, ajz] = String(x.text).split(/\s*(?:\.{3}|…)\s*/);
        return `<tr class="${mine ? 'here' : ''}">`
          + `<td class="sadr">${esc(shaped(sadr ?? x.text))}</td>`
          + `<td class="ajz">${esc(shaped(ajz ?? ''))}</td></tr>`;
      }).join('');
      // ★ ولا تُصاغ العبارةُ بفعلٍ يُطابق العدد ★ — «بيتان وردت» لحنٌ يراه
      //   الأديبُ قبل غيره، والعربيةُ تُثنّي وتجمع، فتُجتنب المطابقةُ أصلًا.
      box.innerHTML = `<p class="poem-note">ما ورد معه في هذا الموضع:`
        + ` ${countLabel(run.length, VERSE)} بترتيب الصفحة، وبيتُك مُعلَّم.`
        + ` وليست دعوى أنّ هذه حدودُ القصيدة: الجمعُ بالموضع،`
        + ` والقطعُ عند تغيّر الرويّ أو البحر.</p>`
        + `<table class="poem-lines">${lines}</table>`;
    }
    box.hidden = false;
    e.target.textContent = 'أخفِ القصيدة';
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

/** سطرُ النطاق: ماذا فُهرس، وكم، ومتى — تحت النتائج لا فوقها. */
async function renderScope() {
  const el = $('scope-note');
  if (!el) return;
  let meta = null;
  try { meta = await indexMeta(); } catch { /* لا فهرس منشور */ }
  if (!meta) { el.textContent = ''; return; }
  const bits = [`بُحث في ${countLabel(meta.verses ?? 0, VERSE)}`];
  if (meta.books) bits.push(countLabel(meta.books, BOOK_IN));
  if (meta.poets) bits.push(countLabel(meta.poets, POET));
  bits.push(meta.semantic ? '— باللفظ وبالمعنى' : '— باللفظ وحده');
  if (meta.builtAt) {
    const d = new Date(meta.builtAt);
    if (!Number.isNaN(d.getTime())) bits.push(`· فُهرس في ${ar(d.toLocaleDateString('ar-EG'))}`);
  }
  el.textContent = bits.join(' ') + '.';

  // ★ وما لم يُبحث فيه يُقال ★ — فلا يحسب الباحث سكوتَ الفهرس سكوتَ الشعر
  const missing = missingCategories(meta.categories ?? []);
  if (missing.length) {
    const note = document.createElement('span');
    note.className = 'scope-missing';
    note.textContent = ` ولم يُفهرس من مواطن الشعر: ${missing.slice(0, 5).map((c) => c.name).join(' · ')}`
      + (missing.length > 5 ? ` وغيرها (${ar(String(missing.length - 5))})` : '') + '.';
    el.append(note);
  }
}

/**
 * ★ لماذا لم أجد شيئًا؟ ★
 * الصفرُ جوابٌ صادق، لكنّه بلا تفسيرٍ يوقع الباحث في ظنٍّ خاطئ: أن المعنى لم
 * يقله أحد. والعلّة في الغالب في نطاق البحث لا في الشعر.
 */
async function emptyExplanation() {
  const reasons = [];
  let meta = null;
  try { meta = await indexMeta(); } catch { /* لا فهرس */ }

  if (!capabilities) reasons.push('المكتبة الحيّة مغلقة، فلم يُبحث إلا في الفهرس المنشور.');
  else if (!$('use-council')?.checked) reasons.push('مجلس النماذج مُطفأ، فلم يُوسَّع معنى بيتك بمداخلَ أخرى.');

  if (!meta) reasons.push('ولا فهرسَ منشورٌ في هذا الموقع بعد.');
  else {
    const missing = missingCategories(meta.categories ?? []);
    if (missing.length) {
      reasons.push(`★ ولم يُفهرس من مواطن الشعر: ${missing.map((c) => c.name).join(' · ')} — `
        + 'وقد يكون فيها ما تطلب.');
    }
    reasons.push(`والفهرس فيه ${countLabel(meta.verses ?? 0, VERSE)}`
      + (meta.books ? ` ${countLabel(meta.books, BOOK_IN)}` : '') + ' — وما ليس فيه لا يُوجد به.');
    if (!meta.semantic) {
      reasons.push('★ وهو مبنيٌّ باللفظ وحده: فلا يجد بيتًا يوافق معناك بغير كلماتك '
        + '(«وما نيل المطالب بالتمنّي» لا تجد «بقدر الكدّ تكتسب المعالي»).');
    }
  }
  reasons.push('جرّب: شطرًا واحدًا · كلمتين من صلب المعنى · أو صيغةً أخرى للمعنى نفسه.');
  return reasons;
}

// ★ ما لم يشترك إلا في لفظٍ شائعٍ يُؤخَّر مهما كانت درجتُه ★ — فالباحث
//   يقرأ الأوّل ويثق، ولا ينبغي أن يكون الأوّلُ مصادفةَ لفظ.
// ★ وترتيبُ الطرق: ★ ما بلغه المعنى أو الصورة أوثقُ موافقةً ممّا بلغه لفظٌ
//   شائع. والباحث يقرأ الأوّل ويثق، فلا ينبغي أن يكون الأوّلُ مصادفةَ لفظ.
const KIND_RANK = { sense: 0, image: 1, lexical: 2, field: 3, council: 4, none: 5, weak: 6 };
const WEAK_LAST = (a, b) => (KIND_RANK[a.why?.kind] ?? 5) - (KIND_RANK[b.why?.kind] ?? 5);

/** يملأ مرشِّحاتِ البحر والغرض والعصر ممّا في النتائج نفسها — لا بقائمةٍ ثابتة. */
function fillFacets() {
  const of = (get) => [...new Set(lastVerses.map(get).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'ar'));
  const fill = (id, values, label) => {
    const el = $(id);
    if (!el) return;
    const keep = el.value;
    el.replaceChildren();
    const all = document.createElement('option');
    all.value = ''; all.textContent = label;
    el.append(all);
    for (const v of values) {
      const o = document.createElement('option');
      o.value = v; o.textContent = v;
      el.append(o);
    }
    el.value = values.includes(keep) ? keep : '';
    el.closest('.pick').hidden = values.length < 2;
  };
  fill('f-meter', of((v) => v.meter), 'كلُّها');
  fill('f-purpose', of((v) => v.purpose), 'كلُّها');
  fill('f-era', of((v) => v.era?.name), 'كلُّها');
}

const SORTS = {
  score: (a, b) => WEAK_LAST(a, b) || (b.score ?? 0) - (a.score ?? 0),
  oldest: (a, b) => (a.deathYear ?? Infinity) - (b.deathYear ?? Infinity),
  newest: (a, b) => (b.deathYear ?? -Infinity) - (a.deathYear ?? -Infinity),
  poet: (a, b) => String(a.poet ?? 'ي').localeCompare(String(b.poet ?? 'ي'), 'ar'),
};

function renderVerses(tail) {
  if (tail !== undefined) statusTail = tail;
  const allowed = allowedTrusts();
  const sort = SORTS[$('sort')?.value] ?? SORTS.score;
  // سببُ ظهور كل بيت يُحسب مرّةً هنا: تُرتَّب به البطاقات وتُرشَّح، ويُعرض فيها
  for (const v of lastVerses) v.why = matchReason(v, v.askedFor ?? askedVerse);
  const hideWeak = $('hide-weak')?.checked;
  // ★ البحث داخل النتائج ★ — من جمع أربعين بيتًا يريد «ما كان للمتنبي منها»
  const within = normalizeQuery($('within')?.value ?? '');
  const fMeter = $('f-meter')?.value ?? '';
  const fPurpose = $('f-purpose')?.value ?? '';
  const fEra = $('f-era')?.value ?? '';
  const shown = lastVerses
    .filter((v) => allowed.has(v.source?.trust ?? 'circulated'))
    .filter((v) => !hideWeak || v.why?.kind !== 'weak')
    .filter((v) => !within || normalizeQuery(`${v.text} ${v.poet ?? ''} ${v.source?.bookName ?? ''}`).includes(within))
    // ★ مرشِّحاتٌ على ما قاله الكتابُ نفسه — وهي صيغةُ سؤال الباحث في المعارضات ★
    .filter((v) => !fMeter || v.meter === fMeter)
    .filter((v) => !fPurpose || v.purpose === fPurpose)
    .filter((v) => !fEra || v.era?.name === fEra)
    .sort(sort);
  results.replaceChildren();
  shown.forEach((v, i) => results.append(card(v, i + 1)));
  const head = $('results-head');
  if (head) head.hidden = !shown.length;
  fillFacets();
  const moreBtn = $('more');
  if (moreBtn) moreBtn.hidden = !canFetchMore || searching;

  const hidden = lastVerses.length - shown.length;
  $('filters').hidden = !lastVerses.length;
  const weakHidden = hideWeak ? lastVerses.filter((v) => v.why?.kind === 'weak').length : 0;
  $('filter-note').textContent = hidden
    ? `أُخفي ${countLabel(hidden, HIDDEN)}${weakHidden ? ' — منها ما لم يشترك إلا في لفظٍ شائع' : ' بسبب درجة التوثيق'}.`
    : '';

  // ★ أساسُ الترتيب يُقال، وضعفُه لا يُكتم ★
  const note = $('ranking-note');
  const basis = lastRanking?.basis ?? null;
  note.textContent = (shown.length && $('sort').value === 'score' && basis) ? (lastRanking.note ?? rankingNote(basis) ?? '') : '';
  note.classList.toggle('weak', basis === 'lexical');

  // ★ نطاقُ البحث يُقال للباحث ★ — فلا يقول «ليس في الشعر العربي»، وإنما
  //   «ليس فيما فُهرس». وهذا فرقٌ يهمّ من يكتب بحثًا.
  renderScope();

  // ★ العدّاد يصف ما على الشاشة لا ما جاء من البحث ★
  setStatus(shown.length
    ? `${countLabel(shown.length, MATCHED_VERSE)}${statusTail}`
    : (lastVerses.length ? 'كلُّ ما وُجد مُخفًى بالمرشِّح أعلاه.' : ''));


  // ★ لقارئ الشاشة: البطاقة عنصرٌ له عنوان، لا كتلةٌ صامتة ★
  results.setAttribute('aria-busy', 'false');
}

function refreshSavedBar() {
  const n = saved.all().length;
  $('saved-bar').hidden = !n;
  $('saved-count').textContent = countLabel(n, HIDDEN);
  $('group-list').innerHTML = saved.groups().map((g) => `<option value="${esc(g)}">`).join('');
}

/**
 * ★ الدفتر — مكانُ عمل الباحث. ★
 *
 * كان المحفوظ قائمةً صمّاء: لا تعليق، ولا وسم، ولا ترتيب، ولا يُعرف أوّلُ من
 * قال المعنى. فكان الباحث ينقل ما جمعه إلى ورقةٍ خارج الموقع ليعمل فيه —
 * وذاك موضعُ ضياع النصف من عمله.
 */
function renderNotebook() {
  const box = $('nb-list');
  if (!box) return;
  const group = $('group-name')?.value.trim() || null;
  const items = saved.all(group);
  const ordered = byOldest(items);

  $('nb-summary').textContent = items.length
    ? `${countLabel(items.length, VERSE)}${group ? ` في «${group}»` : ''}`
      + ` · أقدمُهم ${ordered[0]?.poet ?? 'غير معروف'}`
      + (ordered[0]?.deathYear ? ` (ت ${ar(String(ordered[0].deathYear))}هـ)` : '')
      + ' — والتصدير يرتّبها بالأقدم، فذاك ترتيبُ الموافقات في النقد.'
    : 'دفترك فارغ. احفظ بيتًا من النتائج ليظهر هنا.';

  box.replaceChildren();
  items.forEach((v, i) => {
    const el = document.createElement('article');
    el.className = 'nb-item';

    // ★ الروايتان بيتٌ واحد ★ — والباحث يجمعهما وهو يحسبهما بيتين
    const twin = items.find((o, k) => k !== i && similarity(o.text, v.text) >= 0.82);
    const dup = twin ? `<p class="caveat">روايةٌ أخرى لبيتٍ في دفترك: «${esc(twin.text.slice(0, 40))}…»</p>` : '';

    el.innerHTML = `
      <div class="nb-move">
        <button type="button" data-move="-1" title="إلى الأعلى" aria-label="إلى الأعلى">▲</button>
        <button type="button" data-move="1" title="إلى الأسفل" aria-label="إلى الأسفل">▼</button>
      </div>
      <p class="verse"><span class="hemistich">${esc(shaped(v.sadr ?? v.text))}</span>
        ${v.ajz ? `<span class="sep" aria-hidden="true">۞</span><span class="hemistich">${esc(shaped(v.ajz))}</span>` : ''}</p>
      <p class="src">${esc(v.poet ?? 'قائله غير معروف')}${v.deathYear ? ` — ت ${ar(String(v.deathYear))}هـ` : ''}
        · ${esc(v.source?.bookName ?? '')}</p>
      ${dup}
      <label class="nb-note">ملاحظتك:
        <textarea rows="2" data-note placeholder="يصلح شاهدًا لـ… · يشبه بيت…">${esc(v.note ?? '')}</textarea>
      </label>
      <label class="nb-tags">وسومك:
        <input data-tags value="${esc((v.tags ?? []).join('، '))}" placeholder="الفخر، صورة الدهر">
      </label>
      <div class="nb-actions">
        <button type="button" data-act="more" class="quiet">أبياتٌ كهذا</button>
      <button type="button" data-act="cite" class="quiet">انسخ الإحالة</button>
        <button type="button" data-act="drop" class="quiet">احذف من الدفتر</button>
      </div>`;

    el.querySelector('[data-note]').addEventListener('change', (e) => {
      saved.annotate(v.text, { note: e.target.value.trim() });
    });
    el.querySelector('[data-tags]').addEventListener('change', (e) => {
      const tags = e.target.value.split(/[،,]/).map((t) => t.trim()).filter(Boolean);
      saved.annotate(v.text, { tags });
    });
    for (const btn of el.querySelectorAll('[data-move]')) {
      btn.addEventListener('click', () => {
        saved.move(v.text, Number(btn.dataset.move));
        renderNotebook();
      });
    }
    el.querySelector('[data-act="cite"]').addEventListener('click', async (e) => {
      try {
        await navigator.clipboard.writeText(citationOf(v, { verse: shaped(v.text) }));
        e.target.textContent = '✓ نُسخت';
        setTimeout(() => { e.target.textContent = 'انسخ الإحالة'; }, 1600);
      } catch { e.target.textContent = 'تعذّر النسخ'; }
    });
    el.querySelector('[data-act="drop"]').addEventListener('click', () => {
      saved.remove(v.text);
      renderNotebook(); refreshSavedBar(); renderVerses();
    });
    box.append(el);
  });
}

function notebookItems() {
  const group = $('group-name')?.value.trim() || null;
  return saved.all(group);
}

/**
 * ★ «بيتُك في المكتبة» — تحقيقُ بيت السائل قبل طلب موافقاته. ★
 *
 * كان البيت الذي يسأل به يُستبعد من النتائج (فهو ليس موافقةً لنفسه) ★ ويُطرح
 * صامتًا ★، حتى ليُقال «لم يُوجد بيتٌ موافق» وبيتُه في ديوان لبيد ص٤٨!
 * والباحث يسأل أوّلًا: أين بيتي من الكتب؟ وبأيّ روايةٍ؟ ولمن نسبوه؟
 */
function renderItself(list) {
  const box = $('itself');
  const body = $('itself-list');
  if (!box || !body) return;
  box.hidden = !list.length;
  if (!list.length) return;

  const poets = [...new Set(list.map((v) => v.poet).filter(Boolean))];
  const head = document.createElement('p');
  head.className = 'hint';
  head.textContent = `وُجد في ${countLabel(list.length, PLACE)}`
    + (poets.length > 1 ? ` · ★ واختلفت الكتب في قائله: ${poets.join('، و')} — ولم يُرجَّح.` : '')
    + (poets.length === 1 ? ` · والنسبةُ فيه إلى ${poets[0]}` : '')
    + (!poets.length ? ' · ولم يُنسب فيها إلى أحد' : '');

  body.replaceChildren(head);
  for (const v of list) {
    const el = document.createElement('div');
    el.className = 'itself-row';
    const s = v.source ?? {};
    el.innerHTML = `
      <p class="verse small"><span class="hemistich">${esc(shaped(v.sadr ?? v.text))}</span>
        ${v.ajz ? `<span class="sep" aria-hidden="true">۞</span><span class="hemistich">${esc(shaped(v.ajz))}</span>` : ''}</p>
      <p class="src">${esc(s.bookName ?? '')}${s.printedPage ? ` — ص ${ar(String(s.printedPage))}` : ''}
        ${s.url ? `· <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">افتح المصدر ↗</a>` : ''}
        ${v.poet ? `· ينسبه إلى <strong>${esc(v.poet)}</strong>` : '· بلا نسبة'}
        ${v.meter ? `· ${esc(v.meter)}` : ''}</p>
      ${v.variant ? `<p class="src">وفي روايةٍ: ${esc(v.variant)}</p>` : ''}
      ${v.doubted ? '<p class="caveat">وردَ بين معقوفتين — علامةُ المحقّق على الشكّ فيه.</p>' : ''}`;
    body.append(el);
  }
}

/**
 * ★ معجمُ الصور الشعرية. ★
 * «المنيّة ← سهم» · «الشيب ← صبح» — يُجمع لكلّ صورةٍ أبياتُها مرتَّبةً بالأقدم،
 * فيرى الباحث ★ تطوّرَ الصورة ★ لا أبياتًا متفرّقة. وهو البابُ الذي سُمّي في
 * أوّل الطلب: «المعنى والموضوع والصور الشعرية».
 */
async function openImagery(label = null) {
  const box = $('imagery');
  const list = $('imagery-list');
  const body = $('imagery-verses');
  if (!box) return;
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const images = await imageryIndex();
  if (!images.length) {
    list.replaceChildren();
    const meta = await indexMeta().catch(() => null);
    body.innerHTML = meta
      ? '<p class="hint">لم تتكرّر صورةٌ مرصودةٌ مرّتين في هذا الفهرس بعد — والمعجمُ يكبر بكبره.</p>'
      : '<p class="hint">لا فهرسَ منشورٌ بعد، والمعجمُ يُبنى معه (tools/pack.js).</p>';
    return;
  }

  list.replaceChildren();
  for (const g of images) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (g.label === label ? ' on' : '');
    chip.textContent = `${g.label} (${ar(String(g.count))})`;
    chip.addEventListener('click', () => showImage(g));
    list.append(chip);
  }
  const chosen = images.find((g) => g.label === label);
  if (chosen) showImage(chosen);
  else body.replaceChildren();
}

async function showImage(g) {
  const body = $('imagery-verses');
  body.innerHTML = '<p class="hint">يُجلب…</p>';
  const verses = await versesByIds(g.ids);
  const ordered = verses.sort((a, b) => (a.deathYear ?? Infinity) - (b.deathYear ?? Infinity));
  const head = document.createElement('p');
  head.className = 'src';
  head.textContent = `${g.label} — ${countLabel(g.count, VERSE)}`
    + (g.poets ? ` عند ${countLabel(g.poets, POET).replace(/^لـ?/, '')}` : '')
    + (g.span ? ` · من ت ${ar(String(g.span.from))}هـ إلى ت ${ar(String(g.span.to))}هـ` : '')
    + ' · مرتَّبةً بالأقدم، فأوّلُها أسبقُها.';
  body.replaceChildren(head);
  ordered.forEach((v, i) => body.append(card(v, i + 1)));
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
    headers: { 'content-type': 'application/json', ...(SAFE_TOKEN ? { authorization: `Bearer ${SAFE_TOKEN}` } : {}) },
    body: JSON.stringify(useCouncil ? { query: verse } : { query: verse, mode: 'near', distance: 10, limit: 20 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(data.error ?? `تعذّر البحث (${res.status})`);
    // ★ «مفتاحك مرفوض» ليس كـ«الجسر مغلق» — وخلطُهما يُخفي عن المستخدم ما يمنعه ★
    e.code = (res.status === 401 || res.status === 403) ? 'UNAUTHORIZED' : data.code;
    throw e;
  }
  return data;
}

const DOUBLE_CLICK_GRACE = 500;

async function search({ more = false } = {}) {
  // ★ بحثُ المجلس قد يطول دقيقة — فزرُّ البحث يصير زرَّ إيقاف ★
  //   لكنّ من يضغط مرّتين سريعًا يظنّ أن الأولى لم تُسجَّل، لا يريد الإيقاف.
  //   فالضغطة التي تلي البدء بأقلّ من نصف ثانيةٍ تُهمَل ولا تُوقف شيئًا.
  if (searching) {
    if (Date.now() - startedAt > DOUBLE_CLICK_GRACE) controller?.abort();
    return;
  }
  const raw = q.value.trim();

  // ★ كلُّ سؤالٍ يمسح جوابَ ما قبله. ★ كانت نتائجُ السؤال السابق تبقى تحت
  //   رسالةِ رفضٍ أو خطأ، فيصف العدّادُ ما ليس جوابًا للمكتوب.
  const clearPrevious = () => {
    results.replaceChildren();
    lastVerses = [];
    $('itself').hidden = true;
    $('filters').hidden = true;
    $('results-head').hidden = true;
    renderVerses('');
  };

  if (!raw) { clearPrevious(); setStatus('اكتب بيتًا أولًا.', 'warn'); return; }
  // ★ «لا نتيجة» و«هذا ليس بيتًا» جوابان مختلفان — وخلطُهما يُضلّل ★
  if (!looksArabic(raw)) {
    clearPrevious();
    setStatus('هذا لا يبدو نصًّا عربيًّا. اكتب بيتًا أو شطرًا أو كلمةً بالعربية.', 'warn');
    return;
  }

  // ★ ما لُصق نثرًا يُقال له ما هو، ولا يُمنع. ★
  const kind = inputKind(raw);
  const kindNote = kind === 'prose'
    ? ' — وما كتبتَه يبدو نثرًا لا بيتًا، فبُحث بكلماته'
    : (kind === 'word' ? ' — بحثٌ بكلمة، لا ببيت' : '');

  const verses = splitVerses(raw);
  askedVerse = raw;
  askedList = verses;
  if (!more) { shownLimit = 20; canFetchMore = false; }
  const useCouncil = $('use-council')?.checked && Boolean(capabilities?.council);
  history.add(raw);
  renderHistory();
  controller = new AbortController();
  startedAt = Date.now();
  searching = true;
  btn.disabled = false;              // يبقى مفتوحًا ليُضغط للإيقاف
  btn.textContent = '■ أوقف البحث';
  btn.classList.add('stopping');
  results.replaceChildren();
  lastVerses = [];
  $('itself').hidden = true;
  $('filters').hidden = true;
  $('council').hidden = true;

  // ★ الأبيات المتعددة تُبحث بيتًا بيتًا وتُجمع — كانت تُبحث نصًّا واحدًا فتُخفق ★
  const merged = new Map();
  const itselfFound = [];         // بيتُ السائل كما ورد في الكتب
  let pagesRead = 0, rejectedCount = 0, anyCouncil = null, anyWeb = null;
  let bridgeFailed = false, authFailed = TOKEN_MALFORMED;

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
        if (e.code === 'UNAUTHORIZED') authFailed = true;
        else if (e.code === 'NO_COUNCIL') { try { data = await fetchFor(verse, false); } catch { /* يسقط للفهرس */ } }
        if (!data) bridgeFailed = true;
      }
    }
    if (!data) { try { data = await searchStatic(verse, { excludeVerse: verse, limit: shownLimit }); } catch { data = null; } }
    if (!data) continue;

    for (const v of data.itself ?? []) {
      if (!itselfFound.some((o) => o.text === v.text && o.source?.bookId === v.source?.bookId)) itselfFound.push(v);
    }
    pagesRead += data.pagesRead ?? 0;
    rejectedCount += data.rejectedCount ?? 0;
    anyCouncil ??= data.council ?? null;
    anyWeb ??= data.web ?? null;
    lastRanking = data.ranking ?? lastRanking;

    // ★ موافقاتُ المعنى تُضمّ مهما كان طريقُ البحث ★ — فالجسر يبحث في الشاملة
    //   باللفظ، والجيرةُ محسوبةٌ في الفهرس بالمعنى، وهما لا يتعارضان.
    let semantic = [];
    try { semantic = await semanticMatches(verse); } catch { /* لا جيرةَ منشورة */ }

    for (const v of [...(data.verses ?? []), ...semantic]) {
      if (rejected.has(v.text)) continue;              // ما قال عنه «ليس موافقًا»
      const prev = merged.get(v.text);
      if (prev) {
        prev.matchedQueries = [...new Set([...(prev.matchedQueries ?? []), ...(v.matchedQueries ?? [])])];
        // ما بلغه اللفظُ والمعنى معًا أوثقُ موافقةً، فيُحفظ وسمُ المعنى فيه
        if (v.semantic) { prev.semantic = true; prev.similarity ??= v.similarity; }
        if (!prev.askedFor) prev.askedFor = verse;
      } else merged.set(v.text, { ...v, askedFor: verse });
    }
  }

  renderItself(itselfFound);

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
    if (authFailed) { warnAuth(); return; }
    // ★ لا تُركَّب الجملة على ناتج العدد: «قُرئت لم تُقرأ صفحة» كسرٌ ظاهر ★
    const read = pagesRead ? ` — قُرئت ${countLabel(pagesRead, PAGE)}` : '';
    setStatus(`لم يُوجد بيتٌ موافق${read}.`);
    // ★ والصفرُ بلا تفسيرٍ يوقع الباحث في ظنٍّ خاطئ: أن المعنى لم يقله أحد. ★
    //   والعلّة في الغالب في نطاق البحث لا في الشعر — فتُفصَّل له.
    const reasons = await emptyExplanation();
    if (itselfFound.length) reasons.unshift('★ لكنّ بيتك نفسه في المكتبة — انظر «بيتُك في المكتبة» أعلاه.');
    const box = document.createElement('div');
    box.className = 'empty-why';
    box.innerHTML = '<h2>لم يُوجد بيتٌ موافق — وهذه علّةُ ذلك</h2><ul>'
      + reasons.map((r) => `<li>${esc(r)}</li>`).join('') + '</ul>';
    results.replaceChildren(box);
    renderScope();
    return;
  }

  const bits = [];
  if (pagesRead) bits.push(` — ${countLabel(pagesRead, PAGES_READ)}`);
  if (rejectedCount) bits.push(` · ${countLabel(rejectedCount, SUGGESTION)} لم يثبت في مصدرٍ فلم يُعرض`);
  if (kindNote) bits.push(kindNote);
  if (bridgeFailed || !capabilities) bits.push(' · من الفهرس المنشور وحده');
  if (stopped) bits.push(' · أُوقف البحث قبل تمامه');
  // بلغَ ما جاء الحدَّ؟ فلعلّ وراءه مزيدًا
  canFetchMore = lastVerses.length >= shownLimit;
  renderVerses(bits.join(''));
  if (authFailed) warnAuth();
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
// ── الأمثلة · البحث داخل النتائج · الاختصارات · حدود الموقع ───────────────
for (const b of document.querySelectorAll('.example')) {
  b.addEventListener('click', () => { q.value = b.textContent.trim(); refreshSearchButton(); search(); });
}
$('within')?.addEventListener('input', () => renderVerses());
$('imagery-btn')?.addEventListener('click', () => openImagery());
$('imagery-close')?.addEventListener('click', () => { $('imagery').hidden = true; });
$('limits-btn')?.addEventListener('click', async () => {
  const el = $('limits');
  el.hidden = !el.hidden;
  if (el.hidden || el.dataset.audited) return;
  el.dataset.audited = '1';
  // ★ ومشروعٌ شعارُه الصدقُ يَنشر نسبةَ خطئه المقيسة، لا يكتفي بدعوى الصدق ★
  const a = await auditReport();
  const li = document.createElement('li');
  li.innerHTML = a
    ? `<strong>خطؤه مقيسٌ ومنشور:</strong> أُعيد فتحُ صفحاتِ ${countLabel(a.checked, VERSE)} في المكتبة `
      + `وقُورن النصّ حرفًا بحرف — فوُجد ${ar(String(Math.round((a.textAccuracy ?? 0) * 100)))}٪ منها كما نُقلت`
      + (a.named ? `، ونسبةُ ${ar(String(Math.round((a.poetAccuracy ?? 0) * 100)))}٪ مؤيَّدةٌ بمصدرها` : '')
      + (a.completeness != null
        ? `، و${ar(String(Math.round(a.completeness * 100)))}٪ تامّةٌ لم يُبتر منها شطر`
        : '')
      + (a.books?.length ? `، ${countLabel(a.books.length, BOOK_IN)}` : '')
      + (a.sampledAt ? ` (قِيس في ${ar(new Date(a.sampledAt).toLocaleDateString('ar-EG'))})` : '')
      + '.'
    : '<strong>لم يُقس خطؤه بعد:</strong> التدقيق بالعيّنة (tools/audit.js) لم يُشغَّل على هذا الفهرس.';
  el.querySelector('ul')?.append(li);
});
$('keys-btn')?.addEventListener('click', () => { const el = $('keys'); el.hidden = !el.hidden; });

// ★ اختصاراتٌ لمن يعمل ساعاتٍ في الموقع ★ — ولا تُلتقط وهو يكتب في حقل
document.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '');
  if (e.key === '/' && !typing) { e.preventDefault(); q.focus(); return; }
  if (e.key === '؟' && !typing) { const el = $('keys'); el.hidden = !el.hidden; return; }
  if (e.key === 'د' && !typing) { $('open-notebook')?.click(); return; }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); search(); }
});

$('more')?.addEventListener('click', () => {
  shownLimit += 20;
  search({ more: true });
});
for (const id of ['f-meter', 'f-purpose', 'f-era']) $(id)?.addEventListener('change', () => renderVerses());
$('hide-weak')?.addEventListener('change', () => renderVerses());
$('tashkeel')?.addEventListener('change', (e) => {
  showTashkeel = e.target.checked;
  localStorage.setItem(TASHKEEL_KEY, showTashkeel ? 'on' : 'off');
  renderVerses();
});
for (const c of document.querySelectorAll('.trust-filter')) c.addEventListener('change', () => renderVerses());
$('sort')?.addEventListener('change', () => renderVerses());

installApproval({
  bridge: BRIDGE, token: SAFE_TOKEN,
  onApproved: (text) => { imageApproved = true; q.value = text; refreshSearchButton(); },
  onUnapproved: () => { imageApproved = false; refreshSearchButton(); },
});

// اسمُ الملف لاتينيٌّ عمدًا: بعض المتصفّحات تُسقط الاسم العربيّ فيصير «download»
// بلا امتداد، فلا يُفتح بنقرة. والمحتوى عربيٌّ كما هو.
$('export-saved')?.addEventListener('click', () => downloadText('muwafaqat-saved.txt', exportText()));

// ── الدفتر ─────────────────────────────────────────────────────────────────
$('open-notebook')?.addEventListener('click', () => {
  const nb = $('notebook');
  nb.hidden = !nb.hidden;
  if (!nb.hidden) { renderNotebook(); nb.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
});
$('nb-close')?.addEventListener('click', () => { $('notebook').hidden = true; });
$('group-name')?.addEventListener('change', () => { if (!$('notebook').hidden) renderNotebook(); });

// ★ نسخةُ الفهرس وتاريخُه يُختم بهما كلُّ ما يخرج ★ — فيُعرف بعد سنةٍ
//   من أيّ نسخةٍ نُقل، ويُفسَّر كلُّ فرقٍ يجده الباحث.
async function indexInfo() {
  const [meta, audit] = await Promise.all([
    indexMeta().catch(() => null), auditReport().catch(() => null),
  ]);
  return meta ? { ...meta, audit } : null;
}

// ★ ملفٌّ يُفتح في Word محافظًا على شكله — لا جدولٌ خامٌ يُعاد تنسيقه ★
$('nb-word')?.addEventListener('click', async () => {
  const group = $('group-name')?.value.trim() || 'الموافقات';
  const index = await indexInfo();
  downloadText(`${group}.doc`, researchHtml(notebookItems(), { title: group, index }), 'application/msword');
});
$('nb-csv')?.addEventListener('click', async () => {
  downloadText('muwafaqat.csv', csv(notebookItems(), { index: await indexInfo() }), 'text/csv;charset=utf-8');
});
$('nb-bib')?.addEventListener('click', async () => {
  downloadText('muwafaqat.bib', bibtexAll(notebookItems(), { index: await indexInfo() }), 'application/x-bibtex');
});
$('nb-print')?.addEventListener('click', () => window.print());

// ★ المطويّ يُفتح في الورقة ثم يُطوى بعدها. ★
//   المتصفّح يُخفي محتوى <details> ما لم يُفتح إخفاءً لا يُبطله CSS، فكان
//   شرحُ الغريب يُطبع عنوانًا بلا شرح — وهو أنفعُ ما في البطاقة للباحث.
let reopened = [];
window.addEventListener('beforeprint', () => {
  reopened = [...document.querySelectorAll('.glosses:not([open])')];
  for (const d of reopened) d.open = true;
});
window.addEventListener('afterprint', () => {
  for (const d of reopened) d.open = false;
  reopened = [];
});
$('clear-saved')?.addEventListener('click', () => {
  if (confirm('تُحذف المحفوظات كلها. أمتأكّد؟')) { saved.clear(); refreshSavedBar(); renderVerses(); }
});

refreshSavedBar();
renderHistory();
refreshSearchButton();
probeBridge();
