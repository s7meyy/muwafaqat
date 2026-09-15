#!/usr/bin/env node
// اختبارات «الموافقات» — بلا مكتبات. `npm test`
//
// الشاهد الأساس (tests/fixtures/maani-66.json) صفحةٌ حقيقيةٌ من «علم المعاني»
// فيها عشرة أبياتٍ لستّة قائلين، وفيها الفخاخ الثلاثة: المجهول، والضمير، والنسبة الواحدة
// تخدم أبياتًا عدّة. من نجح فيها نجح في أكثر كتب الشاملة.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize, fingerprint, toArabicDigits } from '../core/normalize.js';
import { extractVerses } from '../core/verses.js';
import { attributeVerses, poetFromBookName, readAttributionLine } from '../core/attribution.js';
import { gate } from '../core/verify.js';
import { dedupe, similarity } from '../core/dedupe.js';
import { eraOf, hijriToGregorian, lifespanLabel } from '../core/eras.js';
import { parseLifespan, findLifespanFor } from '../core/lifespan.js';
import { Shamela } from '../bridge/shamela.js';
import { diffTranscripts, disagreementCount, agreementRatio, proposedText } from '../core/transcript.js';
import { countLabel, VERSE, PAGE, MATCHED_VERSE } from '../core/plural.js';
import { availableProviders, transcribeImage } from '../bridge/transcribe.js';
import { rejectReason, mergeQueries, parseModelJson } from '../core/queries.js';
import { expand, councilSize } from '../bridge/council.js';
import { installFakeFetch, FAKE_ENV } from './fake-models.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const page = JSON.parse(fs.readFileSync(path.join(here, 'fixtures/maani-66.json'), 'utf8'));

let passed = 0, failed = 0;
const fails = [];
function ok(name, cond, detail = '') {
  if (cond) { passed++; }
  else { failed++; fails.push(`${name}${detail ? ' — ' + detail : ''}`); }
}
function eq(name, actual, expected) {
  ok(name, Object.is(actual, expected), `توقّعتُ «${expected}» فجاء «${actual}»`);
}

// ── التطبيع ────────────────────────────────────────────────────────────────
eq('التشكيل لا يفرّق بين نسختي البيت',
  normalize('وَما نَيلُ المَطالِبِ بِالتَمَنّي'), normalize('وما نيل المطالب بالتمنِّي'));
eq('الهمزات تُوحَّد', normalize('أحمد إبراهيم آمن'), 'احمد ابراهيم امن');
eq('التاء المربوطة تصير هاءً', normalize('قصيدة'), 'قصيده');
eq('الألف المقصورة تصير ياءً', normalize('على'), 'علي');
eq('الأرقام تُعرَض عربية', toArabicDigits('354'), '٣٥٤');
ok('البصمة تحذف الفراغ', fingerprint('وما نيل') === 'ومانيل');

// ── اقتناص الأبيات ─────────────────────────────────────────────────────────
const verses = extractVerses(page.body);
eq('عشرة أبياتٍ في الصفحة', verses.length, 10);
ok('لا يلتقط النثر بيتًا',
  !verses.some((v) => /فإذا نظرنا|وقد ذكرنا/.test(v.text)));
ok('★ الشطر يُنقل كاملًا: «وقور» لا تسقط من شعر الشريف الرضي',
  verses.some((v) => v.sadr.includes('وقور')),
  'قطعُ البيت عند أول نقطتين يُسقط كلمةً — وذاك نقصٌ في النقل');
ok('الشطران متوازنان في كل بيت',
  verses.every((v) => {
    const a = v.sadr.split(/\s+/).length, b = v.ajz.split(/\s+/).length;
    return Math.min(a, b) / Math.max(a, b) >= 0.4;
  }));

// ── النسبة ─────────────────────────────────────────────────────────────────
const attributed = attributeVerses(page.body, verses, { bookName: page.book_name });
const expectedPoets = [
  'الفرزدق', 'جرير', null, 'الشريف الرضي', 'الشريف الرضي',
  'الشريف الرضي', 'شوقي', 'شوقي', 'شوقي', 'ابن نباتة السعدي',
];
attributed.forEach((v, i) => {
  eq(`نسبة البيت ${i + 1}`, v.poet ?? null, expectedPoets[i]);
});
ok('★ مؤلّف الكتاب لا يُنسب إليه بيت',
  !attributed.some((v) => v.poet === page.author_name),
  'عبد العزيز عتيق صاحب الكتاب، ولا بيت له فيه');
eq('«ولآخر» تُقرأ تصريحًا بالجهل لا اسمًا', attributed[2].poet, null);
eq('«وقوله» ترث القائل السابق', attributed[8].poetSource, 'inherit');
eq('الديوان ينسب نفسه', poetFromBookName('شرح ديوان المتنبي للواحدي'), 'المتنبي');
eq('«وللشريف الرضي:» لامٌ ملتصقة', readAttributionLine('وللشريف الرضي:')?.name, 'الشريف الرضي');
eq('«لكن» ليست لام نسبة', readAttributionLine('ولكن الأمر كذلك:'), null);

// ── بوابة التحقّق ──────────────────────────────────────────────────────────
const docs = [{ id: 'd1', text: page.body }];
const real = { text: 'وما نيل المطالب بالتمني ... ولكن تؤخذ الدنيا غلابا',
  sadr: 'وما نيل المطالب بالتمني', ajz: 'ولكن تؤخذ الدنيا غلابا' };
const notInSource = { text: 'ومن يتهيب صعود الجبال ... يعش أبد الدهر بين الحفر',
  sadr: 'ومن يتهيب صعود الجبال', ajz: 'يعش أبد الدهر بين الحفر' };
const g = gate([real, notInSource], docs);
eq('البيت الموجود في الوثيقة يمرّ', g.passed.length, 1);
ok('★ البيت الصحيح الذي لم يرد في وثيقة يسقط',
  g.rejectedCount === 1 && g.rejected[0].reason === 'NOT_IN_SOURCE',
  'بيت الشابي حقيقيّ — لكنه ليس في المصدر المسترجَع، فلا يُعرض');
ok('المشكول يمرّ على غير المشكول',
  gate([{ text: 'وَما نَيلُ المَطالِبِ بِالتَمَنّي ... وَلَكِن تُؤخَذُ الدُنيا غِلابا',
    sadr: 'وَما نَيلُ المَطالِبِ بِالتَمَنّي', ajz: 'وَلَكِن تُؤخَذُ الدُنيا غِلابا' }], docs).passed.length === 1);

// ── المكرَّر ───────────────────────────────────────────────────────────────
const dup = dedupe([
  { ...real, poet: 'شوقي', source: { bookName: 'علم المعاني' } },
  { ...real, poet: 'شوقي', source: { bookName: 'علم العروض' } },
]);
eq('البيت في كتابين يُجمع في واحد', dup.length, 1);
eq('ومصادره تُحفظ كلها', dup[0].sources.length, 2);
const disputed = dedupe([
  { ...real, poet: 'شوقي', source: { bookName: 'أ' } },
  { ...real, poet: 'حافظ إبراهيم', source: { bookName: 'ب' } },
]);
ok('★ عند اختلاف المصادر في القائل يُعرض الاثنان ولا يُرجَّح',
  disputed[0].disputedPoets?.length === 2);
ok('التشابه يقيس الروايات', similarity('وما نيل المطالب بالتمني', 'وما نيل المطالب بالتمنى') > 0.9);

// ── العصور ────────────────────────────────────────────────────────────────
eq('ت ١١٠هـ أموي', eraOf(110)?.name, 'أموي');
eq('ت ٣٥٤هـ عباسي', eraOf(354)?.name, 'عباسي');
eq('ت ٤٠٦هـ عباسي', eraOf(406)?.name, 'عباسي');
eq('ت ١٣٥١هـ حديث', eraOf(1351)?.name, 'حديث ومعاصر');
eq('المخضرم يُمرَّر تمريرًا', eraOf(20, { mukhadram: true })?.name, 'مخضرم');
eq('★ بلا سنةٍ لا عصر', eraOf(null), null);
eq('الهجري إلى الميلادي', hijriToGregorian(354), 965);
eq('المجهول يُصرَّح به', lifespanLabel(null), 'غير معروف');

// ── قراءة التراجم ─────────────────────────────────────────────────────────
const alaamPage = 'ما اختلف به الحنفية مع الإمام الشافعيّ (١) . أَبُو الطَّيِّبِ المُتَنَبِّي. '
  + '(٣٠٣ - ٣٥٤ هـ = ٩١٥ - ٩٦٥ م) أحمد بن الحسين بن الحسن بن عبد الصمد الجعفي';
eq('سنة الوفاة من «الأعلام»', parseLifespan(alaamPage)?.deathYear, 354);
eq('وسنة المولد معها', parseLifespan(alaamPage)?.birthYear, 303);
eq('والميلادي كما كتبه الزركلي', parseLifespan(alaamPage)?.gregorian?.death, 965);
eq('صيغة «(ت ٤٠٥ هـ)»', parseLifespan('فلان (ت ٤٠٥ هـ)')?.deathYear, 405);
eq('«٠٠٠» مولدٌ غير معروف', parseLifespan('فلان (٠٠٠ - ٣٢٠ هـ)')?.birthYear, null);
eq('الترجمة تخصّ صاحبها', findLifespanFor('المتنبي', alaamPage)?.deathYear, 354);
ok('★ الاسم المجاور لا تُنسب إليه وفاة غيره',
  findLifespanFor('الشافعي', alaamPage) === null,
  'الشافعيّ ذيلُ الترجمة السابقة — لا صاحبَ هذه');
ok('واسمٌ غائبٌ عن الصفحة لا يُؤرَّخ', findLifespanFor('جرير', alaamPage) === null);

// ── التأريخ عبر الجسر (على خادمٍ مزيَّفٍ ببياناتٍ حقيقية) ──────────────────
{
  const s = new Shamela({ command: 'node', args: [path.join(here, 'fake-shamela-mcp.js')] });
  try {
    const shawqi = await s.deathYearOf('شوقي');
    ok('★ «شوقي» لا يُؤخذ من فهرسٍ فيه ثلاثةٌ متساوون',
      shawqi?.confidence === 'alaam',
      'أوّلهم «شوقي ضيف» الناقد (ت ١٤٢٦) لا الشاعر — فالفهرس يُترك ويُرجع إلى «الأعلام»');
    eq('وسنته من «الأعلام» ١٣٥١', shawqi?.deathYear, 1351);
    eq('وتُذكر الترجمة التي جاءت منها', shawqi?.matchedName, 'أحمد شوقي');

    const jarir = await s.deathYearOf('جرير');
    eq('«جرير» مطابقٌ قاطعٌ في الفهرس', jarir?.confidence, 'exact');
    eq('وسنته ١١٠', jarir?.deathYear, 110);

    const mutanabbi = await s.deathYearOf('المتنبي');
    ok('★ المتنبي ليس في فهرس المؤلّفين — و«الأعلام» يسدّها',
      mutanabbi?.deathYear === 354 && mutanabbi?.confidence === 'alaam');

    eq('★ ومن لم يوجد يبقى غير معروف', await s.deathYearOf('الفرزدق'), null);

    const out = await s.verses('المطالب التمني', { mode: 'near' });
    eq('الجسر يُرجع بيتًا واحدًا موثَّقًا', out.verses.length, 1);
    eq('بقائله', out.verses[0].poet, 'شوقي');
    eq('وعصره', out.verses[0].era?.name, 'حديث ومعاصر');
    ok('ومعه دليلٌ من الوثيقة', Boolean(out.verses[0].evidence?.documentId));
    ok('★ ومؤلّف الكتاب مذكورٌ منفصلًا لا كقائل',
      out.verses[0].source.bookAuthor === 'عبد العزيز عتيق' && out.verses[0].poet !== 'عبد العزيز عتيق');
  } finally {
    s.client.stop();
  }
}

// ── جمع العربية ───────────────────────────────────────────────────────────
eq('صفر: صيغةٌ خاصة', countLabel(0, VERSE), 'لم يوجد بيت');
eq('واحد', countLabel(1, VERSE), 'بيتٌ واحد');
eq('★ المثنّى صيغةٌ مستقلّة', countLabel(2, VERSE), 'بيتان');
eq('القلّة ٣-١٠', countLabel(7, VERSE), '٧ أبيات');
eq('★ الكثرة ١١+ تُنصب مفردًا', countLabel(11, VERSE), '١١ بيتًا');
eq('والمئة مفردٌ مجرور', countLabel(100, VERSE), '١٠٠ بيت');
eq('والصفحة كذلك', countLabel(2, PAGE), 'صفحتان');
eq('★ الصفة تتبع العدد: المثنّى', countLabel(2, MATCHED_VERSE), 'بيتان موافقان');
eq('★ والقلّة', countLabel(3, MATCHED_VERSE), '٣ أبياتٍ موافقة');
eq('★ والكثرة', countLabel(11, MATCHED_VERSE), '١١ بيتًا موافقًا');
eq('★ والمفرد', countLabel(1, MATCHED_VERSE), 'بيتٌ واحدٌ موافق');

// ── مقارنة التفريغين ──────────────────────────────────────────────────────
{
  const A = 'وَما نَيلُ المَطالِبِ بِالتَمَنّي ... وَلَكِن تُؤخَذُ الدُنيا غِلابا';
  const B = 'وما نيل المطالب بالتمني ... ولكن تؤخذ الدنيا غصابا';
  const segs = diffTranscripts(A, B);
  eq('اختلاف الكلمة يُعدّ موضعًا واحدًا', disagreementCount(segs), 1);
  ok('★ اختلاف التشكيل وحده ليس اختلافَ كلمة',
    segs.some((s) => s.type === 'vowel'),
    'النموذجان قرآ «نَيلُ» و«نيل» — الحروف واحدة');
  ok('والكلمة المختلفة تحمل القراءتين',
    segs.some((s) => s.type === 'word' && s.a[0] === 'غِلابا' && s.b[0] === 'غصابا'));
  ok('نسبة الاتفاق بين ٠ و١', agreementRatio(segs) > 0.8 && agreementRatio(segs) < 1);
  ok('★ المقترح نسخةُ الأول لا خليطًا — ولا يُختار عن المستخدم',
    proposedText(segs).includes('غِلابا') && !proposedText(segs).includes('غصابا'));

  // ★ البيت سطرٌ مستقل ★
  const two = diffTranscripts(
    'وما نيل المطالب بالتمني ... ولكن تؤخذ الدنيا غلابا\nوما استعصى على قوم منال ... إذا الإقدام كان لهم ركابا',
    'وما نيل المطالب بالتمني ... ولكن تؤخذ الدنيا غصابا\nوما استعصى على قوم منال ... إذا الإقدام كان لهم ركابا');
  eq('★ الأبيات لا تُدمج في سطر', proposedText(two).split('\n').length, 2);
  eq('وموضع الاختلاف واحد', disagreementCount(two), 1);

  const add = diffTranscripts('قف نبك من ذكرى حبيب ومنزل', 'قف نبك من ذكرى الحبيب');
  ok('الزيادة والنقص يُرصدان', add.some((s) => s.type === 'word' && s.a.length !== s.b.length));
}

// ── التفريغ بلا مفاتيح ────────────────────────────────────────────────────
eq('بلا مفاتيح لا مزوّد', availableProviders({}).length, 0);
{
  let code = null;
  try { await transcribeImage({ imageBase64: 'x' }, {}); } catch (e) { code = e.code; }
  eq('★ ويُصرَّح بالسبب لا يُصمَت عليه', code, 'NO_PROVIDER');
}

// ── تصفية استعلامات المجلس ────────────────────────────────────────────────
eq('استعلامٌ صالح', rejectReason('المطالب التمني'), null);
eq('★ البيت المدسوس مكان استعلامٍ يُرفض',
  rejectReason('وما نيل المطالب بالتمني ... ولكن تؤخذ الدنيا غلابا'), 'LOOKS_LIKE_VERSE');
eq('اللاتينية تُرفض', rejectReason('effort and will'), 'NOT_ARABIC');
eq('★ حروف المعاني وحدها لا تصلح استعلامًا', rejectReason('من في على'), 'STOPWORDS_ONLY');
eq('والإطالة تُفقر البحث بالتقارب', rejectReason('السعي والجد وبلوغ المعالي بالكد'), 'TOO_LONG');
eq('الفارغ', rejectReason('   '), 'EMPTY');

{
  const m = mergeQueries([
    { model: 'a', queries: [{ text: 'المطالب التمني' }, { text: 'السعي المجد' }] },
    { model: 'b', queries: [{ text: 'المطالب التمني' }, { text: 'الجد والاجتهاد' }] },
    { model: 'c', queries: [{ text: 'المطالب التمني' }, { text: 'السعي المجد' }] },
  ]);
  eq('المكرَّر يُدمج', m.queries.length, 3);
  eq('★ ما اتفق عليه أكثرُ نموذجٍ يُقدَّم', m.queries[0].text, 'المطالب التمني');
  eq('وتُذكر النماذج التي اقترحته', m.queries[0].models.length, 3);
  eq('الحدُّ يُحترم', mergeQueries([{ model: 'a', queries: [{ text: 'طلب المعالي' }, { text: 'الجد والسعي' }] }], { limit: 1 }).queries.length, 1);
}
eq('JSON ملفوفٌ بسياج يُقرأ', parseModelJson('حسنًا:\n```json\n{"x":1}\n```')?.x, 1);
eq('وردٌّ ليس JSON يُرجع null', parseModelJson('لا أستطيع'), null);

// ── المجلس بأسوأ أعضائه ───────────────────────────────────────────────────
eq('بلا مفاتيح لا مجلس', councilSize({}), 0);
{
  const restore = installFakeFetch();
  try {
    const verse = 'وما نيل المطالب بالتمني ... ولكن تؤخذ الدنيا غلابا';
    const plan = await expand(verse, FAKE_ENV);
    eq('ستّة أعضاء', councilSize(FAKE_ENV), 6);
    ok('★ سقوط عضوين لا يُعطّل المجلس', plan.answered.length === 4 && plan.failed.length === 2);
    ok('العضو المنقطع يُذكر باسمه', plan.failed.some((f) => /llama/.test(f.model)));
    ok('والردُّ غير المفهوم كذلك', plan.failed.some((f) => /gemma/.test(f.model)));
    ok('★ البيت الذي دسّه العضو العاصي رُفض ولم يُبحث به',
      plan.rejected.some((r) => r.reason === 'LOOKS_LIKE_VERSE'),
      'نموذجٌ خالف التعليمة وكتب شطرين مكان كلمات بحث');
    ok('ولا بيت في الاستعلامات المقبولة',
      !plan.queries.some((q) => /\.{3}|…/.test(q.text)));
    eq('واتفاق ثلاثةٍ يتصدّر', plan.queries[0].models.length, 3);
    ok('ويُعرض فهمُهم للمعنى', plan.meanings.length >= 3);

    const { Shamela } = await import('../bridge/shamela.js');
    const sh = new Shamela({ command: 'node', args: [path.join(here, 'fake-shamela-mcp.js')] });
    try {
      const out = await sh.council(verse, FAKE_ENV);
      ok('المجلس يُرجع أبياتًا مرّت بالبوابة', out.verses.length > 0);
      ok('★ والبيت المسؤول به لا يُعاد جوابًا لنفسه',
        !out.verses.some((v) => v.text.includes('نيل المطالب')),
        'البيت الذي سألتَ به ليس موافقةً له');
      ok('وكل بيتٍ معه دليلُه', out.verses.every((v) => v.evidence?.documentId));
      ok('والصفحة تُقرأ مرّةً واحدةً مهما تعدّدت الاستعلامات', out.pagesRead === 1);
      ok('ويُذكر لكل مدخلٍ ماذا وجد', out.council.perQuery.every((q) => typeof q.found === 'number'));
    } finally { sh.client.stop(); }
  } finally { restore(); }
}

// ── الخلاصة ───────────────────────────────────────────────────────────────
const line = '─'.repeat(52);
process.stdout.write(`\n${line}\n`);
if (failed) {
  process.stdout.write(`✗ ${toArabicDigits(String(failed))} اختبارًا أخفق من ${toArabicDigits(String(passed + failed))}\n\n`);
  fails.forEach((f) => process.stdout.write(`  ✗ ${f}\n`));
  process.stdout.write('\n');
  process.exit(1);
}
process.stdout.write(`✓ نجحت ${toArabicDigits(String(passed))} اختبارًا كلها\n${line}\n`);
