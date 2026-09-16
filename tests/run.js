#!/usr/bin/env node
// اختبارات «الموافقات» — بلا مكتبات. `npm test`
//
// الشاهد الأساس (tests/fixtures/maani-66.json) صفحةٌ حقيقيةٌ من «علم المعاني»
// فيها عشرة أبياتٍ لستّة قائلين، وفيها الفخاخ الثلاثة: المجهول، والضمير، والنسبة الواحدة
// تخدم أبياتًا عدّة. من نجح فيها نجح في أكثر كتب الشاملة.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize, fingerprint, toArabicDigits, isMostlyArabic } from '../core/normalize.js';
import { extractVerses } from '../core/verses.js';
import { attributeVerses, poetFromBookName, readAttributionLine, entrySubject } from '../core/attribution.js';
import { bookHealth, healthLine, looksLikeName, needsReview } from '../core/health.js';
import { matchReason, sharedWords, markShared, isMeaningful } from '../core/why.js';
import { citationOf } from '../core/citation.js';
import { researchHtml, csv, bibtexAll, byOldest } from '../core/export.js';
import { rhyme, scan, meterOf } from '../core/prosody.js';
import { meterFromHeading, occasionOf, parseFootnotes } from '../core/apparatus.js';
import { gate } from '../core/verify.js';
import { dedupe, similarity } from '../core/dedupe.js';
import { eraOf, hijriToGregorian, lifespanLabel } from '../core/eras.js';
import { parseLifespan, findLifespanFor } from '../core/lifespan.js';
import { Shamela } from '../bridge/shamela.js';
import { diffTranscripts, disagreementCount, agreementRatio, proposedText } from '../core/transcript.js';
import { countLabel, VERSE, PAGE, MATCHED_VERSE } from '../core/plural.js';
import { availableProviders, transcribeImage } from '../bridge/transcribe.js';
import { rejectReason, mergeQueries, parseModelJson } from '../core/queries.js';
import { looksArabic, inputKind } from '../core/input.js';
import { expand, councilSize } from '../bridge/council.js';
import { installFakeFetch, FAKE_ENV } from './fake-models.js';
import { installFakeWeb, FAKE_WEB_ENV, fakeLookup } from './fake-web.js';
import { htmlToText, titleOf, decodeEntities } from '../core/html.js';
import { extractVersesFromLines, rhymeOf } from '../core/verses.js';
import { trustOf, siteNameOf, TRUST } from '../core/trust.js';
import { detectRegister } from '../core/register.js';
import { poetFromWebPage } from '../core/attribution.js';
import { isPrivateAddress, assertPublicUrl } from '../bridge/fetch-page.js';
import { collectFromWeb } from '../bridge/web.js';
import { splitVerses, looksArabic } from '../core/input.js';
import { shamelaUrl } from '../core/trust.js';
import { detectTadweer } from '../core/verses.js';
import { queryGroups } from '../core/verse-index.js';
import { rankBySimilarity, rankingNote, lexicalSimilarity, cosine, documentFrequencies } from '../core/semantic.js';
import { buildIndex, searchIndex, indexTokens, bucketOf, verseBucketOf,
  TOKEN_SHARDS, VERSE_SHARDS, withinProximity, fromRecord, toRecord, neighborsOf } from '../core/verse-index.js';
import { buildNeighbors, kmeans, unit, dot } from '../core/neighbors.js';

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

// ── HTML ← نصّ ────────────────────────────────────────────────────────────
eq('الوسوم تُجرَّد', htmlToText('<p>سطر</p><p>آخر</p>'), 'سطر\nآخر');
ok('والنصوص البرمجية تُطرح', !htmlToText('<script>var x=1;</script><p>نصّ</p>').includes('var'));
eq('★ الفراغ بين الأشطر يُسقَط فلا يقطع التتابع',
  htmlToText('<span>شطر</span><span>عجز</span>').split('\n').length, 2);
eq('الكيانات تُفكّ', decodeEntities('&laquo;نصّ&raquo;'), '«نصّ»');
eq('العنوان يُقرأ', titleOf('<title>ديوان الشافعي</title>'), 'ديوان الشافعي');

// ── القافية تفصل الشعر من النثر ───────────────────────────────────────────
eq('★ القافية حرفان: الرويّ ووصلُه', rhymeOf('وطب نفسا اذا حكم القضاء'), 'اء');
eq('وتتّفق في أبيات القصيدة', rhymeOf('فما لحوادث الدنيا بقاء'), 'اء');
eq('★ وتُقرأ بلا تطبيع — التطبيع يحذف الهمزة وهي القافية', rhymeOf('وشيمتك السماحة والوفاء'), 'اء');
eq('والنبطيّ كذلك', rhymeOf('لكن عسى دربي يجيب الخبر'), 'بر');
ok('★ وحرفٌ واحدٌ كان يُقرئ النثرَ شعرًا',
  rhymeOf('وثالث من جنسه') !== rhymeOf('وخامس يشبهه'),
  'كلاهما ينتهي بهاء، والحرفان يفصلان: «سه» ليست «هه»');
{
  const poem = htmlToText(`<div><span>دع الأيام تفعل ما تشاء</span><span>وطب نفسا اذا حكم القضاء</span>
    <span>ولا تجزع لحادثة الليالي</span><span>فما لحوادث الدنيا بقاء</span>
    <span>وكن رجلا على الأهوال جلدا</span><span>وشيمتك السماحة والوفاء</span></div>`);
  eq('قصيدةٌ بلا فاصلٍ صريح تُقتنَص بقرن الأسطر', extractVersesFromLines(poem).length, 3);
  eq('وتُوسم بطريقها', extractVersesFromLines(poem)[0].pairing, 'lines');

  const prose = htmlToText('<p>هذا كلام</p><p>وهذا كلام آخر</p><p>وثالث من جنسه</p><p>ورابع كذلك تمامًا</p><p>وخامس يشبهه</p><p>وسادس مثله</p>');
  ok('★ النثر القصير المتوازن لا يُقرأ شعرًا — القافية تمنعه',
    extractVersesFromLines(prose).length === 0,
    'عرضُ نثرٍ على أنه شعرٌ كذبٌ وإن مرّ بالبوابة');

  // سطرٌ دخيلٌ قبل القصيدة يُزيح الاقتران — يُعالَج بتجربة الموضعين
  const withPrefix = htmlToText(`<p>وجدت هذي الأبيات ونسبوها للشافعي</p><div>
    <span>ولا تر للأعادي قط ذلا</span><span>فإن شماتة الأعدا بلاء</span>
    <span>ولا ترج السماحة من بخيل</span><span>فما في النار للظمآن ماء</span></div>`);
  eq('★ والسطر الدخيل لا يُضيّع القصيدة', extractVersesFromLines(withPrefix).length, 2);
}

// ── درجات التوثيق ─────────────────────────────────────────────────────────
eq('موقعٌ متخصص = منشور', trustOf('https://www.aldiwan.net/p').key, 'published');
eq('وتويتر = متداوَل', trustOf('https://x.com/a/status/1').key, 'circulated');
eq('والمنتدى كذلك', trustOf('https://x.example.com/showthread.php?t=1').key, 'circulated');
eq('★ والمجهول يُعامَل متداوَلًا — الأحوطُ أصدق', trustOf('https://unknown.tld/p').key, 'circulated');
ok('و«متداوَل» يقول صراحةً إن النسبة غير مؤكَّدة', /غير مؤكَّدة/.test(TRUST.circulated.note));
eq('واسم الموقع يُعرَّب', siteNameOf('https://aldiwan.net/x'), 'الديوان');
ok('والموثَّق أعلى رتبةً من المنشور', TRUST.documented.rank > TRUST.published.rank);

// ── النبطي ────────────────────────────────────────────────────────────────
eq('علاماتٌ قاطعة ⇒ نبطي', detectRegister('اللي يبي العالي عليه السهر').register, 'nabati');
ok('وبثقةٍ عالية', detectRegister('اللي يبي العالي عليه السهر').confidence > 0.8);
eq('وعلامتان مرجِّحتان ⇒ نبطي بترجيح', detectRegister('ودي اقول وخاطري عسى').register, 'nabati');
eq('★ وخلوُّ البيت من التشكيل ليس دليلًا على النبطية',
  detectRegister('وما نيل المطالب بالتمني ولكن تؤخذ الدنيا غلابا').register, 'fasih');
ok('★ ولا تبلغ الثقة في الفصاحة حدَّ الجزم',
  detectRegister('وما نيل المطالب بالتمني').confidence < 1);

// ── نسبة صفحات الويب ──────────────────────────────────────────────────────
eq('العنوان ينسب', poetFromWebPage({ title: 'دع الأيام - الإمام الشافعي' }).poet, 'الإمام الشافعي');
eq('★ ولام النسبة الملتصقة تُحلّ', poetFromWebPage({ title: 'قصيدة للمتنبي في المجد' }).poet, 'المتنبي');
eq('واسم الموقع لا يُنسب إليه شعر', poetFromWebPage({ title: 'قصائد وأشعار | الديوان' }).poet, null);

// ── حراسة الجلب ───────────────────────────────────────────────────────────
ok('★ العناوين الداخلية تُمنع',
  ['127.0.0.1', '10.0.0.5', '192.168.1.1', '169.254.169.254', '172.16.0.1', '::1'].every(isPrivateAddress),
  'الجسر يعمل على جهاز صاحب المكتبة، والروابط تأتيه من نتائج بحثٍ خارجية');
ok('والعامّة تُقبل', !isPrivateAddress('8.8.8.8') && !isPrivateAddress('93.184.216.34'));
{
  const blocked = [];
  for (const u of ['http://localhost:9/x', 'file:///etc/passwd', 'https://169.254.169.254/', 'http://192.168.0.1/']) {
    try { await assertPublicUrl(u); } catch { blocked.push(u); }
  }
  eq('وكلُّ رابطٍ خطر يُردّ', blocked.length, 4);
}

// ── الشبكة من طرفها إلى طرفها ─────────────────────────────────────────────
{
  const restore = installFakeWeb();
  try {
    const mk = () => ({ documents: [], candidates: [], bodies: new Map(), citations: new Map(), pagesLeft: 50 });
    const a = mk();
    await collectFromWeb('الأيام القضاء', a, FAKE_WEB_ENV, { lookup: fakeLookup });
    eq('موقعُ الشعر يُعطي بيتًا منسوبًا', a.candidates.length, 1);
    eq('بدرجة «منشور»', a.candidates[0].source.trust, 'published');
    eq('وبقائله من العنوان', a.candidates[0].poet, 'الإمام الشافعي');
    ok('ومعه رابطه', /^https:\/\//.test(a.candidates[0].source.url));

    const b = mk();
    await collectFromWeb('السهر المراقي', b, FAKE_WEB_ENV, { lookup: fakeLookup });
    eq('★ والنبطي مصدره الشبكة لا المكتبة', b.candidates[0]?.register, 'nabati');
    eq('ويُوسم «متداوَلًا»', b.candidates[0]?.source.trust, 'circulated');
    eq('وقائله غير معروف فلا يُخمَّن', b.candidates[0]?.poet, null);

    const c = mk();
    await collectFromWeb('الصبر مفتاح الفرج', c, FAKE_WEB_ENV, { lookup: fakeLookup });
    eq('★ وصفحةُ نثرٍ لا تُعطي شعرًا', c.candidates.length, 0);
  } finally { restore(); }
}

// ── الفهرس الساكن ─────────────────────────────────────────────────────────
{
  const sample = [
    { text: 'وما نيل المطالب بالتمني ... ولكن تؤخذ الدنيا غلابا', poet: 'شوقي', deathYear: 1351,
      source: { bookName: 'علم المعاني', printedPage: '66', bookId: 17670, pageId: 60 } },
    { text: 'دع الأيام تفعل ما تشاء ... وطب نفسا اذا حكم القضاء', poet: 'الشافعي', deathYear: 204,
      source: { bookName: 'الديوان', printedPage: '12' } },
    { text: 'ومن يتهيب صعود الجبال ... يعش أبد الدهر بين الحفر', poet: null,
      source: { bookName: 'ديوان الشابي' } },
    { text: 'وما نيل المطالب بالتمني ... ولكن تؤخذ الدنيا غلابا', poet: 'شوقي',
      source: { bookName: 'كتابٌ آخر' } },
  ];
  const built = buildIndex(sample);
  eq('★ المكرَّر لا يُفهرس مرّتين', built.meta.verses, 3);
  ok('حروف المعاني لا تُفهرس', !indexTokens('من في على الدنيا').includes('في'));
  ok('والكلمة القصيرة كذلك', !indexTokens('لم يد به').includes('يد'));
  ok('★ شظايا السجلّات أكثرُ من شظايا الكلمات', VERSE_SHARDS > TOKEN_SHARDS,
    'المرشَّحون يتفرّقون في شظايا السجلّات، فتكثيرُها يُصغّر ما يُجلب لكل بحث');
  eq('وبصمة الكلمة ثابتة', bucketOf('المطالب'), bucketOf('المطالب'));
  ok('وتقع في المدى', bucketOf('المطالب') < TOKEN_SHARDS && verseBucketOf(7) < VERSE_SHARDS);
  ok('★ وعددُ الشظايا يتبع الحجم لا يكون ثابتًا',
    built.meta.verseShards < VERSE_SHARDS,
    'فهرسٌ فيه خمسون بيتًا كان يُكتب في ١٨٤٣٣ ملفًا');

  const shardOpts = { tokenShards: built.meta.tokenShards, verseShards: built.meta.verseShards };
  const load = async (kind, b) => (kind === 'tokens' ? built.tokens.get(b) : built.store.get(b)) ?? {};
  {
    const r = await searchIndex('المطالب التمني', load, shardOpts);
    eq('البحث يجد البيت', r.verses.length, 1);
    eq('بقائله', r.verses[0].poet, 'شوقي');
    eq('وبكتابه وصفحته', r.verses[0].source.printedPage, '66');
    eq('ومجهولُ القائل يبقى مجهولًا', (await searchIndex('صعود الجبال', load, shardOpts)).verses[0].poet, null);
    eq('وما ليس فيه لا يُخترع', (await searchIndex('كلمات غائبة تماما', load, shardOpts)).verses.length, 0);
  }
  ok('★ والتقارب يُشترط: الكلمتان في بيتٍ واحدٍ لا يكفي، بل قريبتان',
    withinProximity('وما نيل المطالب بالتمني ولكن تؤخذ الدنيا غلابا', ['المطالب', 'التمني'], 12)
    && !withinProximity('المطالب ' + 'حشو '.repeat(20) + 'التمني', ['المطالب', 'التمني'], 12));

  const rec = toRecord(sample[0], 1);
  ok('★ سجلّ الفهرس مفاتيحُه قصيرة — الحجم يُضرب في مئات الألوف',
    Object.keys(rec).every((k) => k.length === 1));
  eq('ويعود إلى شكله المعروف', fromRecord(rec).source.bookName, 'علم المعاني');
  eq('بشطرَيه', fromRecord(rec).ajz, 'ولكن تؤخذ الدنيا غلابا');
}

// ── ما كشفته جولةُ المستخدم ───────────────────────────────────────────────
// كلُّ اختبارٍ هنا يحرس عيبًا وقع فعلًا في الجولة، لا عيبًا متخيَّلًا.

// (١) الدواوين مشكولة، وكانت عربيّتُها تُرفض
ok('★ البيت المشكول كاملًا عربيّ',
  isMostlyArabic('فَجِئْتُ وَقَدْ نَضَّتْ لنَومٍ ثيابَها'),
  'التشكيل كان يُحسب محارف غير عربية، فيُسقَط أكثرُ شعر الدواوين صامتًا');
ok('واللاتينيّ يبقى مرفوضًا', !isMostlyArabic('see Journal of Arabic Literature vol 3'));
eq('والبيت المشكول يُقتنص',
  extractVerses('٢٨ - فَجِئْتُ وَقَدْ نَضَّتْ لنَومٍ ثيابَها ... لَدَى السِّتْر إلّا لِبْسَةَ الْمُتَفَضِّلِ').length, 1);
ok('★ وترقيم المحقّق لا يدخل نصّ البيت',
  !extractVerses('٣١ - فقالتْ يَمينَ الله ما لكَ حيلَةٌ ... وَما إنْ أرى عنكَ الغَوايةَ تَنْجلي')[0].text.startsWith('٣١'));

// (٢) شاهدٌ داخل ديوان ليس من شعر صاحبه
{
  const page = 'وإن في قوله وما إن زائدة ومنه قول الشاعر:\n'
    + 'وما إن طِبُّنا جبن ولكن ... منايانا ودولة آخرينا\n'
    + '٣٢ - خَرَجْتُ بها أمشي تَجُرّ وراءَنا ... على أَثَرَيْنَا ذَيْلَ مِرْطٍ مُرَحَّلِ';
  const v = attributeVerses(page, extractVerses(page), { bookName: 'ديوان امرئ القيس ت المصطاوي' });
  eq('★ «قول الشاعر:» لا يُملأ بقائل الديوان', v[0].poet, null);
  eq('★ والجهل لا يسري إلى البيت المرقَّم بعده', v[1].poet, 'امرئ القيس');
  eq('لأن المحقّق يرقّم أبيات صاحبه لا الشواهد', v[1].poetSource, 'book-numbered');
}
eq('★ علامةُ المحقّق تُقطع من اسم الشاعر',
  poetFromBookName('ديوان امرئ القيس ت المصطاوي'), 'امرئ القيس');
eq('وكذلك «بشرح فلان»', poetFromBookName('ديوان جرير بشرح محمد بن حبيب'), 'جرير');

// (٣) الأبيات المتعددة كانت تُبحث نصًّا واحدًا فتُخفق
eq('بيتٌ واحد', splitVerses('صدر ... عجز').length, 1);
eq('★ شطران في سطرين = بيتٌ واحد لا بيتان',
  splitVerses('وما نيل المطالب بالتمني\nولكن تؤخذ الدنيا غلابا').length, 1);
eq('وثلاثة أبياتٍ بفواصل = ثلاثة', splitVerses('أ ... ب\nج ... د\nهـ ... و').length, 3);
eq('وأربعةُ أشطرٍ = بيتان', splitVerses('شطر اول\nشطر ثان\nشطر ثالث\nشطر رابع').length, 2);
ok('★ و«ليس بيتًا عربيًّا» جوابٌ غيرُ «لا نتيجة»',
  !looksArabic('Hello world') && !looksArabic('؟؟؟') && looksArabic('وما نيل المطالب'));

// (٤) البيت كان يعود جوابًا لنفسه، ولا رابط، ولا تأريخ
{
  const sample = [{ text: 'وما نيل المطالب بالتمني ... ولكن تؤخذ الدنيا غلابا', poet: 'شوقي',
    deathYear: 1351, lifespanSource: { label: 'الأعلام للزركلي' },
    source: { bookName: 'علم المعاني', printedPage: '66', bookId: 17670, pageId: 60 } }];
  const ix = buildIndex(sample);
  const so = { tokenShards: ix.meta.tokenShards, verseShards: ix.meta.verseShards };
  const load = async (k, b) => (k === 'tokens' ? ix.tokens.get(b) : ix.store.get(b)) ?? {};
  eq('★ البيت لا يعود جوابًا لنفسه',
    (await searchIndex('المطالب التمني', load, { ...so, excludeVerse: sample[0].text })).verses.length, 0);
  const got = (await searchIndex('المطالب التمني', load, so)).verses[0];
  eq('★ والعصر يُشتقّ في الفهرس — كانت البطاقة تقول «عصره غير معروف»', got.era?.name, 'حديث ومعاصر');
  eq('والميلاديّ معه', got.deathYearGregorian, 1932);
  eq('★ وللمصدر رابطٌ يُفتح', got.source.url, 'https://shamela.ws/book/17670/60');
  ok('موسومًا بحدّه', /يقارب/.test(got.source.urlNote));
  eq('وسندُ التأريخ يُذكر', got.lifespanSource?.label, 'الأعلام للزركلي');

  // (٥) السوابق: «التمني» كانت لا تجد «بالتمني»
  ok('★ السابقة الملتصقة تُجرَّد', indexTokens('بالتمني').includes('تمني'));
  for (const query of ['التمني غلابا', 'بالتمني الدنيا', 'تمني مطالب', 'المطالب دنيا']) {
    ok(`ويجد «${query}»`, (await searchIndex(query, load, so)).verses.length === 1);
  }
}
eq('ورابط الكتاب بلا صفحة', shamelaUrl(17670), 'https://shamela.ws/book/17670');
eq('ولا رابط بلا كتاب', shamelaUrl(null), null);

// ── ما كشفه أول تشغيلٍ حقيقيٍّ لأداة الاستخراج ────────────────────────────
// شُغِّلت على «ديوان جرير بشرح محمد بن حبيب»، فأخرجت ١٠ أبياتٍ من ٣٢ منسوبةً
// إلى ما ليس اسمًا. وهذه الاختبارات تحرس ما أُصلح.

eq('★ نثرٌ يبدأ بفعلٍ لا يُقبل اسمًا',
  readAttributionLine('وقال يمدح عبد الملك ويهجو الأخطل:'), null);
eq('★ ولا ظرفٌ يبدأ بحرف جرّ — ولا يُخترع له اسم',
  readAttributionLine('وهو قوله في كلمته:')?.name ?? null, null);
ok('★ ولا ما فيه علامةُ اقتباسٍ أو نقطتان',
  readAttributionLine('قوله "ألستم" أراد: أنتم', { requireColon: false })?.name == null,
  'كان يُستخرج «"ألستم" أراد: أنتم» قائلًا للشعر');
ok('★ ولا ما فيه فاصلة',
  !/،/.test(readAttributionLine('وأتيت على قول أم حزرة وبنيها، وأتيت', { requireColon: false })?.name ?? ''));
eq('والاسم الصحيح يمرّ', readAttributionLine('وقال جرير:')?.name, 'جرير');

// الترقيم بلا شرطة — «ديوان جرير» يرقّم «١ أتصحو» لا «١ - أتصحو»
{
  const withDash = extractVerses('٣١ - فقالتْ يَمينَ الله ما لكَ حيلَةٌ ... وَما إنْ أرى عنكَ الغَوايةَ تَنْجلي');
  const bare = extractVerses('١٥ ألستم خير من ركب المطايا ... وأندى العالمين بطون راح');
  ok('★ الترقيم بالشرطة يُقطع', !withDash[0].text.startsWith('٣١'));
  ok('★ والترقيم بلا شرطة كذلك', !bare[0].text.startsWith('١٥'),
    'واشتراط الشرطة كان يُبقي الرقم فيمنع دمج روايتي البيت الواحد');
  eq('والبيت المرقَّم يُعرف بأنه من شعر صاحب الديوان', bare[0].numbered, true);
  eq('ونصُّه يطابق نصَّ الرواية غير المرقَّمة',
    normalize(bare[0].text), normalize(extractVerses('ألستم خير من ركب المطايا ... وأندى العالمين بطون راح')[0].text));
}

// الشاهد في الشرح ليس من شعر صاحب الديوان
{
  const page = '١٠ سأمتاح البحور فجبنيني ... أذاة اللوم وانتظري امتياحي\n'
    + 'الميح: العطاء، وأنشد:\n'
    + 'يترك ما رقّح من عيشه ... يعيث فيه همج هامج\n'
    + '١١ ثقي بالله ليس له شريك ... ومن عند الخليفة بالنجاح';
  const v = attributeVerses(page, extractVerses(page), { bookName: 'ديوان جرير بشرح محمد بن حبيب' });
  eq('المرقَّم لصاحب الديوان', v[0].poet, 'جرير');
  eq('★ وغيرُ المرقَّم في ديوانٍ مرقَّم لا يُنسب إليه', v[1].poet, null);
  eq('والمرقَّم بعده يعود إليه', v[2].poet, 'جرير');
}

// ── البيت المدوَّر ─────────────────────────────────────────────────────────
{
  const t = detectTadweer('ودعوا اليأس والتعلل بالوه', 'م، ولا تركنوا إلى الأحلام');
  ok('★ الكلمة الموزَّعة على الشطرين تُكشف', Boolean(t),
    'ليست خطأ صفٍّ بل تدويرٌ يقتضيه العروض — ونقلُه كما هو يُري القارئ نصًّا مكسورًا');
  eq('وتُوصل للمطابقة', t.word, 'بالوهم');
  eq('والصدر يُعرض موصولًا في نسخة المطابقة', t.joinedSadr, 'ودعوا اليأس والتعلل بالوهم');
  eq('والعجز بلا الحرف المقتطع', t.joinedAjz, 'ولا تركنوا إلى الأحلام');
  ok('و«بالقول» كذلك', detectTadweer('تعست أمة تحاول بالقو', 'ل بلوغ المنى')?.word === 'بالقول');
  eq('★ والبيت السليم لا يُمَسّ',
    detectTadweer('وما نيل المطالب بالتمني', 'ولكن تؤخذ الدنيا غلابا'), null);
  eq('★ ولا الكلمة القصيرة القائمة بنفسها',
    detectTadweer('قفا نبك من ذكرى', 'يا دار مي على البلى'), null);
  const v = extractVerses('ودعوا اليأس والتعلل بالوه ... م، ولا تركنوا إلى الأحلام')[0];
  eq('والمعروض يبقى كما طُبع', v.text, 'ودعوا اليأس والتعلل بالوه ... م، ولا تركنوا إلى الأحلام');
  ok('ومعه نسخةٌ موصولةٌ للمطابقة', v.joined.includes('بالوهم') && v.mudawwar);
}

// ── الترتيب بالمعنى (المرحلة ٦) ───────────────────────────────────────────
eq('جيب التمام للمتطابقين', cosine([1, 2, 3], [1, 2, 3]), 1);
eq('وللمتعامدين', cosine([1, 0], [0, 1]), 0);
eq('ولمتجهٍ فارغ', cosine([], [1]), 0);
ok('التشابه اللفظيّ يقيس الاشتراك',
  lexicalSimilarity('السعي إلى المعالي', 'من طلب المعالي سهر') > 0
  && lexicalSimilarity('السعي إلى المعالي', 'ذهب الفتى إلى السوق') === 0);
ok('★ والكلمة النادرة أثقل من الشائعة في الوزن', (() => {
  // «الدنيا» في كل الأبيات، و«غلابا» في واحد. فالسؤال فيه الكلمتان،
  // ومن شارك في النادرة أولى ممّن شارك في الشائعة.
  const texts = ['الدنيا زائله', 'الدنيا فانيه', 'الدنيا دار', 'الدنيا غلابا'];
  const { df, total } = documentFrequencies(texts);
  const rare = lexicalSimilarity('الدنيا غلابا', 'ونعم غلابا', { df, total });
  const common = lexicalSimilarity('الدنيا غلابا', 'ونعم الدنيا', { df, total });
  return rare > common;
})());

{
  const q = 'وما نيل المطالب بالتمني ... ولكن تؤخذ الدنيا غلابا';
  const mk = (text, poet, mq) => ({ text, poet, matchedQueries: mq });

  // بلا مجلسٍ ولا تضمينات: اللفظ وحده — ★ ويُقال إنه لا يقيس المعنى ★
  const weak = rankBySimilarity(q, [mk('ومن يتهيب صعود الجبال ... يعش أبد الدهر بين الحفر', 'الشابي')]);
  eq('أساس الترتيب يُسمّى', weak[0].ranking.basis, 'lexical');
  ok('★ وضعفُه يُقال صراحةً للمستخدم', /لا يقيس المعنى/.test(rankingNote('lexical')),
    'البيت الموافق في المعنى قد لا يشترك مع بيتك في كلمة واحدة');

  // مع المجلس: عددُ مداخل المعنى أصدقُ من اللفظ
  const withCouncil = rankBySimilarity(q, [
    mk('وقال الخليفة إن الدنيا زائلة ... وما في الدنيا من باق', null, ['الدنيا']),
    mk('بقدر الكد تكتسب المعالي ... ومن طلب العلا سهر الليالي', 'مجهول',
      ['طلب المعالي', 'السعي المجد', 'الجد والاجتهاد', 'بلوغ المنى']),
  ], { queryCount: 4 });
  eq('الأساس يصير «مداخل المجلس»', withCouncil[0].ranking.basis, 'council');
  ok('★ والبيت الموافق معنًى يتقدّم على المشارك لفظًا',
    withCouncil[0].text.includes('بقدر الكد'),
    'اللفظ كان يرفع «إن الدنيا زائلة» لمجرّد كلمة «الدنيا»');

  // مع التضمينات: المتجه هو الأصل
  const A = mk('أ ... ب', null), B = mk('ج ... د', null);
  const emb = new Map([[A.text, [1, 0, 0]], [B.text, [0, 1, 0]]]);
  const ranked = rankBySimilarity('س', [A, B], { embeddings: emb, queryVector: [0.9, 0.1, 0] });
  eq('الأساس تضميناتٌ', ranked[0].ranking.basis, 'embeddings');
  eq('والأقربُ متجهًا يتقدّم', ranked[0].text, 'أ ... ب');
}

// ── ما كشفته الجولة الثالثة ───────────────────────────────────────────────

// (١) النسبة في كتب الأدب — بِنيةٌ غير بِنية الديوان
eq('★ «رجل من بني الحارث» تصريحٌ بالجهل لا اسم',
  readAttributionLine('وقال رجل من بني الحارث:')?.kind, 'anonymous');
eq('★ «ونحوه:» انتقالٌ إلى بيتِ غيره لا ضميرٌ يعود عليه',
  readAttributionLine('ونحوه:')?.kind, 'anonymous');
eq('و«ومثله:» كذلك', readAttributionLine('ومثله:')?.kind, 'anonymous');
eq('★ والوصفُ بعد الاسم يُقطع',
  readAttributionLine('وقال زهير بن خباب الكلبي وكان من المعمرين:')?.name, 'زهير بن خباب الكلبي');
eq('والنسبة بلا نقطتين تُقرأ', readAttributionLine('وقال المتنبّي')?.name, 'المتنبي');

// (٢) تجريدُ السوابق كان يُبطل شرط المطابقة
{
  const g = queryGroups('التمني الأماني');
  eq('كلمتان لا أربع', g.length, 2);
  ok('ولكلٍّ صيغتاها', g[0].forms.length === 2 && g[0].forms.includes('تمني'));
}

{
  const index = buildIndex([
    { text: 'إذا ازدحمت همومي في فؤادي ... طلبت لها المخارج بالتمنّي', poet: null, source: {} },
    { text: 'من كان مرعى عزمه وهمومه ... روض الأماني لم يزل مهزولا', poet: 'أبو تمام', source: {} },
    { text: 'وما نيل المطالب بالتمني ... ولكن تؤخذ الدنيا غلابا', poet: 'شوقي', source: {} },
  ]);
  const sh = { tokenShards: index.meta.tokenShards, verseShards: index.meta.verseShards };
  const load = async (k, b) => (k === 'tokens' ? index.tokens.get(b) : index.store.get(b)) ?? {};

  ok('★ «التمني الأماني» تجد ثلاثة — وكانت تعود صفرًا',
    (await searchIndex('التمني الأماني', load, sh)).verses.length === 3,
    'تجريد السوابق ضاعف كلمات السؤال، فصار شرط «كلّها إلا واحدة» يطلب ثلاثًا من أربع');

  const whole = await searchIndex('وما نيل المطالب بالتمني ... ولكن تؤخذ الدنيا غلابا', load,
    { ...sh, excludeVerse: 'وما نيل المطالب بالتمني ... ولكن تؤخذ الدنيا غلابا' });
  ok('★ والبحث بالبيت كاملًا يجد موافقه — وكان يعود صفرًا دائمًا',
    whole.verses.length >= 1 && whole.verses[0].text.includes('المخارج بالتمنّي'),
    'بيتٌ من ثماني كلماتٍ كان يطلب سبعًا مشتركة، ولا يشترك بيتان في سبعٍ إلا أن يكونا واحدًا');
  ok('ولا يُعيد البيت جوابًا لنفسه',
    !whole.verses.some((v) => v.text.startsWith('وما نيل')));
}

// ── بِنية المعاجم ─────────────────────────────────────────────────────────
{
  // المعجم يضع البيت داخل اقتباسٍ مع مثالٍ نثريٍّ قبله تفصله شرطة
  const page = '٣ - هدف يُسعى إلى تحقيقه "الحريَّة مطلبُ الناس جميعهم- '
    + 'وما نيل المطالب بالتمنِّي ... ولكن تُؤخذ الدُّنيا غِلابا".';
  const v = extractVerses(page);
  eq('بيتٌ واحد', v.length, 1);
  ok('★ والمثال النثريّ لا يلتصق بصدر البيت',
    !v[0].sadr.includes('الحريَّة'),
    'المعاجم تفصل أمثلتها بشرطةٍ داخل الاقتباس الواحد');
  eq('والصدر نظيف', normalize(v[0].sadr), normalize('وما نيل المطالب بالتمني'));
  eq('والعجز بلا علامة الاقتباس', normalize(v[0].ajz), normalize('ولكن تؤخذ الدنيا غلابا'));

  // ★ والشرطة حدٌّ مرشَّحٌ لا قاطع: شرطتا هذا البيت من صلبه ★
  const inner = extractVerses('٩ تعلل - وهي ساغبة - بنيها ... بأنفاس من الشَّبم القراح');
  eq('البيت الذي شرطتاه منه لا يُقطع', inner.length, 1);
  ok('ويبقى تامًّا', inner[0].sadr.includes('تعلل') && inner[0].sadr.includes('بنيها'));
}

// ── بِنية كتب الشواهد ─────────────────────────────────────────────────────
{
  const page = '(وَهل يعمن من كَانَ أحدث عَهده ... ثَلَاثِينَ شهرا فِي ثَلَاثَة أَحْوَال)\n'
    + 'قَالَ العسكري نقلا عَن الْأَصْمَعِي وَابْن السّكيت يَقُول كَيفَ ينعم من كَانَ أقرب عَهده بالرفاهية\n'
    + '(ديار لسلمى عافيات بِذِي الْخَال ... الح عَلَيْهَا كل أسحم هطال)';
  const v = attributeVerses(page, extractVerses(page), { bookName: 'خزانة الأدب ولب لباب لسان العرب للبغدادي' });
  eq('بيتان', v.length, 2);
  ok('★ والقوسُ الذي يحتضن الشاهد ليس منه',
    !v[0].text.includes('(') && !v[0].text.includes(')'),
    'كتب الشواهد تضع البيت بين قوسين، وكان قوس الفتح يبقى في النصّ');
  ok('★ وسطرُ شرحٍ طويلٌ لا ينتهي بنقطتين ليس نسبة',
    v.every((x) => x.poet === null),
    '«قال العسكري … يقول كيف ينعم …» كان يُخرج «كيف ينعم» شاعرًا، ويدوم على ما بعده');
}
eq('والاستفهام لا يكون اسمًا',
  readAttributionLine('يقول كيف ينعم من كان أقرب عهده بالرفاهية ثلاثين شهرا', { requireColon: true }), null);
eq('والنسبة القصيرة بلا نقطتين تبقى مقبولة',
  readAttributionLine('وقال المتنبّي', { requireColon: true })?.name, 'المتنبي');

// ── حدُّ قوائم المواضع ────────────────────────────────────────────────────
{
  // خمسةُ آلاف بيتٍ تشترك كلها في كلمة — وهي حال الكلمة المطروقة في مكتبةٍ كبيرة
  const many = Array.from({ length: 4000 }, (_, i) => ({
    text: `الدنيا كلمة${i} فريدة ... عجز رقم ${i} هنا`, poet: null, source: {},
  }));
  const ix = buildIndex(many);
  const bucket = ix.tokens.get(bucketOf('الدنيا', ix.meta.tokenShards));
  ok('★ قائمةُ الكلمة المطروقة تُقصّ عند حدّ',
    bucket['الدنيا'].length <= ix.meta.maxPostings,
    'بلا حدٍّ تبلغ شظيّةٌ واحدةٌ ميغابايتًا، ينزّلها المتصفّح كاملةً لأن كلمةً مطروقةً وقعت في السؤال');
  ok('★ ويُقال إنها قُصَّت ولا يُكتم',
    ix.meta.cappedTokens.includes('الدنيا'));
  ok('والكلمة النادرة لا تُمَسّ',
    ix.tokens.get(bucketOf('كلمه7', ix.meta.tokenShards))?.['كلمه7']?.length === 1);
}

// ── بِنية كتب التراجم ─────────────────────────────────────────────────────
{
  const page = 'قال: أنشد أبو محمد البافي قول الشاعر [من الوافر]:\n'
    + 'دخلنا كارهين لها فلما … ألفناها خرجنا مكرهينا\n'
    + 'فقال: يوشك أن يكون هذا في بغداد، وأنشد لنفسه في معنى ذلك [من الوافر]:\n'
    + 'على بغداد معدن كل طيب … ومغنى نزهة المتنزهينا';
  const v = attributeVerses(page, extractVerses(page), { bookName: 'تاريخ بغداد - ت بشار' });
  eq('بيتان', v.length, 2);
  ok('★ «وأنشد لنفسه» إحالةٌ لا اسم',
    v.every((x) => x.poet === null),
    'كان يخرج منها شاعرٌ اسمه «لنفسه»، ويدوم على سبعة أبياتٍ بعده — منها قصيدةٌ لأخي الراوي');
  eq('والإحالة تُقرأ إرثًا', readAttributionLine('وأنشد لنفسه في معنى ذلك:')?.kind, 'inherit');
  eq('والاسم الصريح بعد «أنشد» يبقى', readAttributionLine('وأنشد أبو تمام:')?.name, 'أبو تمام');
  eq('و«…» فاصلٌ كـ«...»', extractVerses('صدر البيت هنا … عجز البيت هناك').length, 1);
}

// ── عددُ الشظايا يتبع الحجم ───────────────────────────────────────────────
{
  const small = buildIndex(Array.from({ length: 50 }, (_, i) =>
    ({ text: `بيت رقم ${i} هنا ... وعجزه رقم ${i} هناك`, poet: null, source: {} })));
  ok('★ فهرسٌ صغيرٌ لا يُكتب في ١٨٤٣٣ ملفًا',
    small.tokens.size + small.store.size < 100,
    'التقسيم يتبع الحجم؛ والمقصود صغرُ الشظيّة لا كثرةُ الملف');
  eq('وشظايا السجلّات ستّ عشرة', small.meta.verseShards, 16);

  const big = buildIndex(Array.from({ length: 5000 }, (_, i) =>
    ({ text: `بيت رقم ${i} كلمة${i} ... عجز رقم ${i}`, poet: null, source: {} })));
  ok('وتكثر بكثرة الأبيات', big.meta.verseShards > small.meta.verseShards);
  ok('ولا تتجاوز الحدّ', big.meta.verseShards <= VERSE_SHARDS);
}

// ── الاستبعاد بالاحتواء ───────────────────────────────────────────────────
{
  const sample = [
    { text: 'ترى الناس ما سرنا يسيرون خلفنا ... وإن نحن أومأنا إلى الناس وقفوا', poet: 'الفرزدق', source: {} },
    { text: 'إذا غضبت عليك بنو تميم ... رأيت الناس كلهم غضابا', poet: 'جرير', source: {} },
  ];
  const ix = buildIndex(sample);
  const so = { tokenShards: ix.meta.tokenShards, verseShards: ix.meta.verseShards };
  const load = async (k, b) => (k === 'tokens' ? ix.tokens.get(b) : ix.store.get(b)) ?? {};

  const half = await searchIndex('ترى الناس ما سرنا يسيرون خلفنا', load,
    { ...so, excludeVerse: 'ترى الناس ما سرنا يسيرون خلفنا' });
  ok('★ السؤال بشطرٍ من البيت لا يُعيد البيت نفسه',
    !half.verses.some((v) => v.text.startsWith('ترى الناس')),
    'الاستبعاد كان بالتطابق التامّ، والمستخدم يلصق شطرًا أو روايةً ناقصة');
  ok('ويُعيد غيره', half.verses.length >= 1);

  const full = await searchIndex(sample[0].text, load, { ...so, excludeVerse: sample[0].text });
  ok('والتطابق التامّ يُستبعد كما كان', !full.verses.some((v) => v.text === sample[0].text));
}

// ── تجريدُ السوابق لا يُلبِس كلمةً بكلمة ─────────────────────────────────
ok('★ «المنى» لا تُجرَّد فتصير «منى» فتطابق «منّي»',
  !indexTokens('المنى').includes('مني'),
  'التجريد بلا تحليلٍ صرفيّ يُصيب في الطويل ويخطئ في القصير');
ok('و«بالتمني» ما زالت تُجرَّد', indexTokens('بالتمني').includes('تمني'));
ok('و«الدنيا» كذلك', indexTokens('الدنيا').includes('دنيا'));

// ── بِنية شروح المنظومات (ألفية ابن مالك) ─────────────────────────────────
// صفحاتٌ حقيقية من «شرح الفارضي على ألفية ابن مالك» (تصنيف ٣١، وفيه ٢١٣ كتابًا).
{
  const page = '٨ - كَلَامُنَا لَفْظٌ مُفِيدٌ كاستَقِم ... واسْمٌ وفِعْلٌ ثمَّ حَرفٌ الكَلِم (¬٢)\n'
    + 'ومعنى (جمعي): أنه يدل على جماعة.\n'
    + '٩ - وَاحِدُهُ: كَلِمَةٌ وَالْقَولُ: عَمْ ... وَكِلْمَةٌ: بهَا كَلَامٌ قَد يُؤَم (¬٣)';
  const v = attributeVerses(page, extractVerses(page), { bookName: 'شرح الفارضي على ألفية ابن مالك' });
  eq('★ النقطتان داخل الشطر لا تُسقط البيت', v.length, 2,
     'الوقوف عند أول حدٍّ في العجز كان يجعله كلمةً واحدة، فيُردّ البيت ويسقط من الفهرس');
  ok('والبيت يخرج تامًّا', v[1].text.includes('وَكِلْمَةٌ') && v[1].text.includes('قَد يُؤَم'));
  eq('★ والمنظومة تنسب نفسها كما ينسب الديوان', poetFromBookName('شرح الفارضي على ألفية ابن مالك'), 'ابن مالك');
  eq('وأبياتها المرقَّمة لناظمها', v[0].poet, 'ابن مالك');
  eq('و«أوضح المسالك إلى ألفية ابن مالك» مثله', poetFromBookName('أوضح المسالك إلى ألفية ابن مالك'), 'ابن مالك');
  ok('★ و«لامية العرب» ليست لشاعرٍ اسمه «العرب»', poetFromBookName('لامية العرب') === null,
     'المنظومة تُضاف إلى موضوعها كما تُضاف إلى ناظمها، و«غير معروف» أصدق من «العرب»');
  ok('و«نظم المتون» كذلك', poetFromBookName('نظم المتون') === null);
}

// الشاهد غير المرقَّم في شرح المنظومة ليس من نظمها
{
  const page = 'وكذلك قال ﷺ: "أفضل كلمة قالها شاعر كلمة لبيد" وهو يريد قصيدة لبيد ابن ربيعة العامري التي أولها:\n'
    + 'ألَا كُلُّ شَيءٍ مَا خَلا اللَّهَ باطِلُ ... وَكُل نَعيمٍ لَا مَحَالَةَ زَائِلُ';
  const v = attributeVerses(page, extractVerses(page), { bookName: 'شرح الفارضي على ألفية ابن مالك' });
  eq('بيتٌ واحد', v.length, 1);
  eq('★ والنسبة تُقرأ من «قصيدة فلان» لا من داخل الحديث المقتبَس', v[0].poet, 'لبيد ابن ربيعة العامري',
     'كان «قالها شاعر» داخل الحديث يُقرأ تصريحًا بالجهل، فيُمحى لبيدٌ من بيته');
  ok('ولم يُنسب إلى ناظم الألفية', v[0].poet !== 'ابن مالك');
}

// ── بِنية كتب الأعيان (الصفدي) ────────────────────────────────────────────
// صفحاتٌ حقيقية من «أعيان العصر وأعوان النصر» (تصنيف ٢٦، وفيه ٥٧٩ كتابًا).
{
  eq('★ «ومن شعره:» إحالةٌ على صاحب الترجمة', readAttributionLine('ومن شعره:', { requireColon: true })?.kind, 'inherit');
  eq('و«ومنه في وصف الربيع:» مثلها', readAttributionLine('ومنه في وصف الربيع:', { requireColon: true })?.kind, 'inherit');
  eq('★ والاسم قد يسبق «قوله:»',
     readAttributionLine('وكما اقتبس سيف الدين بن قزل المشد قوله:', { requireColon: true })?.name,
     'سيف الدين بن قزل المشد');
  eq('و«ومن شعر الطيبي رحمه الله تعالى:» تصريحٌ باسمه',
     readAttributionLine('ومن شعر الطيبي رحمه الله تعالى:', { requireColon: true })?.name, 'الطيبي');

  // ★ لامُ النسبة لا تقع في حشو الكلام ★
  const r = readAttributionLine('وأنشدني من لفظه فيما يكتب على سيف:', { requireColon: true });
  eq('★ «من لفظه» إحالةٌ لا اسم', r?.kind, 'inherit',
     'كانت لام «لفظه» تُقرأ لامَ نسبةٍ فيخرج شاعرٌ اسمه «فظه» يرث صفحةً من الشعر');

  // عنوان الفهرس يسمّي صاحب الترجمة
  eq('وعنوان الترجمة اسمُ صاحبها', entrySubject('أحمد بن يوسف بن هلال بن أبي البركات'), 'أحمد بن يوسف بن هلال');
  ok('★ ولا يُقطع النسب عند «بن»', !/\sبن$/.test(entrySubject('أحمد بن يوسف بن هلال بن أبي البركات')));
  ok('و«الألقاب والأنساب» ليست ترجمةَ أحد', entrySubject('الألقاب والأنساب') === null);
  ok('و«كتب التفسير» كذلك', entrySubject('كتب التفسير') === null);
  ok('و«قافية الباء» كذلك', entrySubject('قافية الباء') === null);

  const page = 'ومن شعره:\n'
    + 'لست أنسى الأحباب ما دمتُ حيّاً ... إذا نَوَرا للنوى مكاناً قصيّاً\n'
    + 'وتلَوا آيةَ الدموع فخرّوا ... خِيفة البينِ سُجّداً وبُكيّا';
  const v = attributeVerses(page, extractVerses(page), {
    bookName: 'أعيان العصر وأعوان النصر', entryPoet: 'أحمد بن يوسف بن يعقوب',
  });
  eq('بيتان', v.length, 2);
  eq('★ وضمير «شعره» يعود على صاحب الترجمة', v[0].poet, 'أحمد بن يوسف بن يعقوب');
  eq('ومصدر النسبة معلوم', v[0].poetSource, 'entry');

  // ولا يُنسب شيءٌ إلى صاحب الترجمة بلا إحالةٍ من النصّ
  const bare = 'ألَا كُلُّ شَيءٍ مَا خَلا اللَّهَ باطِلُ ... وَكُل نَعيمٍ لَا مَحَالَةَ زَائِلُ';
  const b = attributeVerses(bare, extractVerses(bare), { bookName: 'أعيان العصر', entryPoet: 'أحمد بن يوسف' });
  ok('★ وبيتٌ بلا إحالةٍ يبقى «غير معروف»', b[0].poet === null,
     'صاحب الترجمة يُملأ حيث أحال النصُّ على «من قبله»، لا حيث سكت');
}

// ── القصيدة تعبر حدّ الصفحة ───────────────────────────────────────────────
{
  const first = 'ومن شعر الطيبي رحمه الله تعالى:\n'
    + 'النهر وافى شاهراً سيفَه ... ولَمْعُه يحتبس الأعينا';
  const a = attributeVerses(first, extractVerses(first), { bookName: 'أعيان العصر وأعوان النصر' });
  eq('النسبة قُرئت', a[0].poet, 'الطيبي');
  eq('★ وتُورَّث إلى الصفحة التالية', a.carry?.name, 'الطيبي');

  const next = 'فماجت البركة من خوفه ... وارتعدت وادّرعت جَوشنا';
  const b = attributeVerses(next, extractVerses(next), { bookName: 'أعيان العصر وأعوان النصر', carry: a.carry });
  eq('فيُنسب تتمّة القصيدة إلى قائلها', b[0].poet, 'الطيبي',
     'كانت ثلاثون بيتًا من قصيدةٍ واحدة تخرج «غير معروف» لأن النسبة في أول صفحاتها');
  eq('ومصدر النسبة معلوم', b[0].poetSource, 'carry');

  // ★ ولا يُورَّث إلى صفحةٍ تبدأ بعنوان ترجمةٍ جديدة ★
  const other = 'أحمد بن يوسف بن يعقوب\n'
    + 'القاضي الكاتب الفاضل شمس الدين الطِيبيّ.\n'
    + 'لست أنسى الأحباب ما دمتُ حيّاً ... إذا نَوَرا للنوى مكاناً قصيّاً';
  const c = attributeVerses(other, extractVerses(other), { bookName: 'أعيان العصر', carry: a.carry });
  ok('★ فما بدأ بنثرٍ لا يرث', c[0].poet === null,
     'الميراث عبر حدّ الصفحة مشروطٌ بأن يكون أولُ ما فيها بيتًا — وإلا كانت ترجمةً جديدة');
}

// ── التعاضد والخلاف في النسبة ─────────────────────────────────────────────
{
  const sample = [
    { text: 'ألا كل شيء ما خلا الله باطل ... وكل نعيم لا محالة زائل', poet: null,
      source: { bookName: 'شرح الفارضي', bookId: 174, pageId: 37 } },
    { text: 'ألا كل شيء ما خلا الله باطل ... وكل نعيم لا محالة زائل', poet: 'لبيد', deathYear: 41,
      source: { bookName: 'خزانة الأدب', bookId: 12, pageId: 9 } },
    { text: 'ألا كل شيء ما خلا الله باطل ... وكل نعيم لا محالة زائل', poet: 'لبيد',
      source: { bookName: 'الأغاني', bookId: 30, pageId: 4 } },
    { text: 'تعز فإن الصبر بالحر أجمل ... وليس على ريب الزمان معول', poet: 'أبو تمام',
      source: { bookName: 'ديوان أبي تمام', bookId: 5, pageId: 2 } },
    { text: 'تعز فإن الصبر بالحر أجمل ... وليس على ريب الزمان معول', poet: 'البحتري',
      source: { bookName: 'كتابٌ آخر', bookId: 6, pageId: 3 } },
  ];
  const ix = buildIndex(sample);
  eq('البيتان يُفهرسان مرّةً واحدة', ix.meta.verses, 2);

  const recs = [...ix.store.values()].flatMap((b) => Object.values(b));
  const lubaid = fromRecord(recs.find((r) => /باطل/.test(r.t)));
  const disputed = fromRecord(recs.find((r) => /تعز/.test(r.t)));

  eq('★ ورودُ البيت في ثلاثة كتبٍ يُحفظ', lubaid.occurrences, 3,
     'كان الفهرس يُبقي أوّل نسخةٍ ويطرح ما بعدها، فيضيع التعاضد');
  eq('★ والنسبة تُكسَب ولا تُفقَد', lubaid.poet, 'لبيد',
     'الكتاب الأول سكت عن قائله، والثاني سمّاه — وكان السكوتُ يغلب لأنه سبق');
  eq('ومعها سنةُ وفاته', lubaid.deathYear, 41);
  ok('ولا خلافَ فيه', lubaid.disputedPoets === null);
  ok('وتُذكر الكتب الأخرى', lubaid.alsoIn?.includes('خزانة الأدب') && lubaid.alsoIn?.includes('الأغاني'));

  eq('★ واختلافُ الكتب في القائل يُعرض ولا يُرجَّح', disputed.disputedPoets?.length, 2,
     'كثيرٌ من الشعر مختلَفٌ في نسبته، وعرضُ قولٍ واحدٍ كأنه إجماعٌ تدليس');
  ok('بالقولين معًا', disputed.disputedPoets.includes('أبو تمام') && disputed.disputedPoets.includes('البحتري'));
  eq('والبيت المنفرد يبقى واحدًا', fromRecord(recs.find((r) => /باطل/.test(r.t))).occurrences, 3);
}

// ── تقرير صحّة الاستخراج ──────────────────────────────────────────────────
// ★ الدرس المتكرّر: كلُّ بِنيةِ كتابٍ جديدة تكسر شيئًا بصمت. ★
{
  const many = (n, poet) => Array.from({ length: n }, () => ({ poet, deathYear: poet ? 110 : null }));

  const silent = bookHealth({ bookName: 'أعيان العصر', pages: 6, verses: many(21, null) });
  eq('★ كتابٌ أخرج أبياتًا بلا قائلٍ واحدٍ يُعلَّم', silent.flags[0]?.kind, 'no-attribution',
     'هكذا خرجت واحدٌ وعشرون بيتًا من الصفديّ بلا نسبةٍ ولم يقل شيءٌ كلمة');
  eq('ويُقال بالعربية وبالجمع الصحيح', healthLine(silent).startsWith('٢١ بيتًا من ٦ صفحات'), true);

  const good = bookHealth({ bookName: 'ديوان جرير', pages: 100, verses: many(300, 'جرير') });
  eq('والسليمُ لا يُعلَّم', good.flags.length, 0);
  eq('ونسبتُه تامّة', good.attributedRatio, 1);

  const empty = bookHealth({ bookName: 'ديوانٌ ما', pages: 80, verses: [], expectVerses: true });
  eq('★ وكتابُ شعرٍ لم يخرج منه بيتٌ واحدٌ يُعلَّم', empty.flags[0]?.kind, 'no-verses',
     'بِنيةٌ لم تُعرف، وهي التي تُكتشف بعد ساعاتٍ من العمل لو لم تُقَل');

  const junk = bookHealth({
    bookName: 'كتابٌ فيه نثرٌ التُقط', pages: 40,
    verses: [...many(30, 'جرير'), { poet: 'كيف ينعم', deathYear: null }, { poet: 'فظه', deathYear: null }],
  });
  ok('★ والأسماء التي ليست أسماءً تُعرَض', junk.flags.some((f) => f.kind === 'odd-names'));
  ok('وتُقدَّم في القائمة', junk.oddNames.slice(0, 2).every((o) => o.suspect));

  ok('و«جرير» و«لبيد» أسماءُ شعراء', looksLikeName('جرير') && looksLikeName('لبيد'),
     'اشتراطُ كلمتين كان يرمي بأسماء الشعراء المشهورين في قائمة الشكّ');
  ok('و«في كلمته» و«يمدح عبد الملك» ليست كذلك',
     !looksLikeName('في كلمته') && !looksLikeName('يمدح عبد الملك'));

  const review = needsReview([good, silent, empty]);
  eq('والمراجعةُ تُرتَّب بالأكثر أبياتًا', review[0].bookName, 'أعيان العصر');
  eq('ولا يدخلها السليم', review.length, 2);
}

// ── جيرانُ المعنى ─────────────────────────────────────────────────────────
// ★ العلّة التي لا يُصلحها بحثُ الألفاظ، والجواب عنها. ★
{
  // متجهاتٌ مصنوعةٌ لا مُتعلَّمة: ثلاثةُ معانٍ متباعدة، كلٌّ في جهة.
  // (الاختبار يقيس البناءَ والبحث، لا جودةَ نموذجٍ لا يُشغَّل هنا.)
  const V = {
    saee1:  [0.95, 0.05, 0.0],   // السعي والكدّ
    saee2:  [0.90, 0.10, 0.0],
    saee3:  [0.88, 0.14, 0.0],
    sabr1:  [0.05, 0.95, 0.0],   // الصبر
    sabr2:  [0.10, 0.92, 0.0],
    ghazal: [0.0, 0.05, 0.98],   // الغزل
  };
  const text = {
    saee1: 'وما نيل المطالب بالتمني ... ولكن تؤخذ الدنيا غلابا',
    saee2: 'بقدر الكد تكتسب المعالي ... ومن طلب العلا سهر الليالي',
    saee3: 'ومن يتهيب صعود الجبال ... يعش أبد الدهر بين الحفر',
    sabr1: 'تعز فإن الصبر بالحر أجمل ... وليس على ريب الزمان معول',
    sabr2: 'وللصبر عاقبة محمودة ... إذا اشتد بالمرء ما يكره',
    ghazal: 'قفا نبك من ذكرى حبيب ومنزل ... بسقط اللوى بين الدخول فحومل',
  };
  const keys = Object.keys(V);
  const items = keys.map((k) => ({ id: k, vector: V[k] }));

  ok('★ ولا تشترك «التمنّي» و«الكدّ» في كلمة',
    !normalize(text.saee1).split(' ').some((w) => normalize(text.saee2).split(' ').includes(w) && w.length > 2),
    'وهذا هو الحدّ الذي يقف عنده كلُّ بحثٍ لفظيّ مهما حُسّن');

  const nb = buildNeighbors(items, { clusters: 2, topK: 5 });
  const forSaee = (nb.get('saee1') ?? []).map((n) => n.id);
  ok('★ فيجمعهما جارُ المعنى', forSaee.includes('saee2'),
    'المتجه يقرّب المعنيين وإن تباعد اللفظان — وهذا أصلُ الموقع');
  ok('ويجمع الثالث معهما', forSaee.includes('saee3'));
  ok('★ ولا يخلط الغزلَ بالسعي', !forSaee.includes('ghazal'),
    'الجيرةُ بلا حدٍّ أدنى تُخرج كلَّ شيءٍ جارًا لكل شيء');
  ok('ولا الصبرَ', !forSaee.includes('sabr1'));
  ok('والبيت ليس جارَ نفسه', !forSaee.includes('saee1'));

  eq('والترتيب بالأقرب', nb.get('saee1')[0].id, 'saee2');
  ok('والتشابه مذكورٌ مع كل جار', nb.get('saee1')[0].sim > 0.9);

  // البناء ثابتٌ بين تشغيلين — فالفهرس يُعاد بناؤه فيُطابق
  const again = buildNeighbors(items, { clusters: 2, topK: 5 });
  eq('★ وبناءُ الفهرس مُعادٌ للتحقّق', JSON.stringify([...again.get('saee1')]), JSON.stringify([...nb.get('saee1')]));

  eq('والتطبيع يجعل الطول واحدًا', Math.round(dot(unit([3, 4, 0]), unit([3, 4, 0])) * 1000), 1000);
  eq('والعناقيد لا تزيد على الأبيات', kmeans(items.map((i) => unit(i.vector)), 99).centroids.length, 6);
}

// جيرانُ المعنى في الفهرس الساكن — من السؤال إلى الجواب بلا نموذج
{
  const texts = {
    a: 'وما نيل المطالب بالتمني ... ولكن تؤخذ الدنيا غلابا',
    b: 'بقدر الكد تكتسب المعالي ... ومن طلب العلا سهر الليالي',
    c: 'قفا نبك من ذكرى حبيب ومنزل ... بسقط اللوى بين الدخول فحومل',
  };
  const verses = [
    { text: texts.a, poet: 'شوقي', deathYear: 1351, source: { bookName: 'علم المعاني', bookId: 1, pageId: 2 } },
    { text: texts.b, poet: 'المتنبي', deathYear: 354, source: { bookName: 'ديوان المتنبي', bookId: 2, pageId: 3 } },
    { text: texts.c, poet: 'امرؤ القيس', deathYear: -80, source: { bookName: 'ديوان امرئ القيس', bookId: 3, pageId: 4 } },
  ];
  const neighbors = new Map([
    [normalize(texts.a), [{ text: texts.b, sim: 0.88 }]],
    [normalize(texts.b), [{ text: texts.a, sim: 0.88 }]],
  ]);
  const ix = buildIndex(verses, { neighbors });
  ok('★ ويُعلن الفهرس أنه مبنيٌّ بالمعنى', ix.meta.semantic === true,
    'فالموقع يقول لقارئه على أيّ أساسٍ رُتِّب، ولا يوهمه معنًى وهو لفظ');
  eq('وكم بيتًا له جيرة', ix.meta.withNeighbors, 2);

  const load = async (kind, bucket) => (kind === 'tokens' ? ix.tokens.get(bucket) : ix.store.get(bucket)) ?? {};
  const opts = { tokenShards: ix.meta.tokenShards, verseShards: ix.meta.verseShards };

  const lexical = await searchIndex(texts.a, load, { ...opts, excludeVerse: texts.a });
  ok('★ البحث اللفظيّ لا يجد الموافق في المعنى', !lexical.verses.some((v) => v.text === texts.b),
    'لا كلمةَ مشتركة، فلا سبيل للّفظ إليه — وهذا ليس عيبًا في التنفيذ بل حدٌّ للطريقة');

  const found = await neighborsOf(texts.a, load, opts);
  eq('★ وجارُ المعنى يجده بلا نموذجٍ ولا شبكة', found.verses[0]?.text, texts.b,
    'محسوبٌ يوم الفهرسة، فيأتي مجّانًا وفوريًّا لمن لا مفتاح له');
  eq('ومعه قائلُه وعصره', found.verses[0]?.poet, 'المتنبي');
  eq('ودرجةُ قربه مذكورة', found.verses[0]?.similarity, 0.88);
  eq('ولا يُخلط الغزل', found.verses.length, 1);

  const none = await neighborsOf('بيتٌ ليس في الفهرس أصلًا وليس فيه شيء', load, opts);
  eq('★ وما ليس في الفهرس لا جيرةَ له، ولا تُختلق له', none.verses.length, 0);
}

// ── «لماذا ظهر هذا البيت؟» ────────────────────────────────────────────────
// ★ ما كشفته جولةُ باحثٍ في الأدب: بطاقةٌ لا تقول سببَ ظهورها تُضلّل. ★
{
  const q = 'ألا كل شيء ما خلا الله باطل ... وكل نعيم لا محالة زائل';

  const weak = matchReason({ text: 'والله يقضي بهبات وافره ... لي وله في درجات الآخره' }, q);
  eq('★ الاشتراكُ في لفظٍ شائعٍ ليس موافقة', weak.kind, 'weak',
     'سُئل الموقع ببيتٍ في فناء الدنيا فجاءه بيتُ دعاءٍ لاشتراكهما في «الله» — وسكت');
  ok('ويُقال ذلك صراحة', /لا يدلّ على موافقةٍ في المعنى/.test(weak.label));

  ok('و«الله» و«إلا» لفظان شائعان', !isMeaningful('الله') && !isMeaningful('إلا'));
  ok('و«المطالب» و«المعالي» يُعتدّ بهما', isMeaningful('المطالب') && isMeaningful('المعالي'));

  const sense = matchReason({ text: 'بقدر الكد تكتسب المعالي', semantic: true, similarity: 0.88 }, q);
  eq('وموافقةُ المعنى تُقال بدرجتها', sense.kind, 'sense');
  ok('بنسبتها', /88/.test(sense.label));

  const council = matchReason({ text: 'وما نيل المطالب بالتمني', matchedQueries: ['طلب العلا'] }, q);
  eq('ومدخلُ المجلس يُنسب إليه', council.kind, 'council');

  const lex = matchReason({ text: 'وكل نعيم لا محالة زائل ... فانظر لنفسك' },
    'ألا كل شيء ما خلا الله باطل ... وكل نعيم لا محالة زائل');
  eq('والاشتراكُ في كلمٍ دالٍّ موافقةٌ لفظية', lex.kind, 'lexical');
  ok('وتُسمّى كلماتُه', lex.words.some((w) => /نعيم|محالة|زائل/.test(w)));

  eq('★ ولا يُختلق سبب', matchReason({ text: 'لا شيء مشترك هنا البتة' }, 'كلام آخر مختلف تماما').kind, 'none');

  const marked = markShared('وكل نعيم لا محالة زائل', q);
  ok('★ والمشترك يُظلَّل في البيت نفسه', marked.filter((w) => w.shared).length >= 2,
     'فيرى الباحث بعينه سببَ الجمع، لا يقرأ عنه');
  ok('وغيرُ المشترك لا يُظلَّل', marked.some((w) => !w.shared));

  ok('والسوابق لا تمنع المطابقة', sharedWords('المطالب', 'بالمطالب العلا').length === 1);
}

// ── الإحالة الجاهزة ───────────────────────────────────────────────────────
{
  const v = {
    text: 'ألا كل شيء ما خلا الله باطل ... وكل نعيم لا محالة زائل',
    poet: 'لبيد بن ربيعة', deathYear: 41,
    source: { bookName: 'شرح الفارضي', bookAuthor: 'الفارضي', printedPage: '1/ 37', autoNumbered: true },
  };
  const c = citationOf(v, { verse: v.text });
  ok('الإحالة فيها الكتاب ومؤلّفه والصفحة', /الفارضي/.test(c) && /شرح الفارضي/.test(c) && /١\/ ٣٧/.test(c));
  ok('وسنةُ الوفاة بالأرقام العربية', /ت ٤١هـ/.test(c));
  ok('★ ويُصرَّح بأن الترقيم آليّ', /بترقيم الشاملة آليًّا/.test(c),
     'من أحال بترقيمٍ آليٍّ إلى صفحةٍ في مطبوعٍ أخطأ، والباحث لا يعرف ذلك من تلقائه');
  ok('★ ولا تُلصق لامُ الجرّ بالاسم', !/لـلبيد/.test(c),
     '«لـلبيد» شائنٌ في حاشيةٍ تُنشر');
  ok('والمجهولُ يُقال فيه ذلك', /غير معروف/.test(citationOf({ text: 'x', source: {} }, { verse: 'x' })));
  ok('وBibTeX تخرج صالحة', /@incollection\{/.test(citationOf(v, { style: 'bibtex' })));
}

// ── ما يخرج به الباحث إلى بحثه ────────────────────────────────────────────
{
  const items = [
    { text: 'بقدر الكد تكتسب المعالي ... ومن طلب العلا سهر الليالي', poet: 'المتنبي',
      deathYear: 354, era: { name: 'العصر العباسي' }, note: 'يصلح شاهدًا للفصل الثاني',
      tags: ['السعي'], source: { bookName: 'ديوان المتنبي', bookAuthor: 'المتنبي', printedPage: '12' } },
    { text: 'ألا كل شيء ما خلا الله باطل ... وكل نعيم لا محالة زائل', poet: 'لبيد',
      deathYear: 41, source: { bookName: 'شرح الفارضي', bookAuthor: 'الفارضي' } },
  ];

  eq('★ والترتيب بالأقدم، فذاك ترتيبُ الموافقات في النقد', byOldest(items)[0].poet, 'لبيد',
     '«أوّل من قاله فلان، ثم تبعه فلان» — وهو ما يسأل عنه الباحث في الموافقات أولًا');

  const doc = researchHtml(items, { title: 'الفناء' });
  ok('الملفّ يُفتح بالعربية من اليمين', /dir="rtl"/.test(doc) && /lang="ar"/.test(doc));
  ok('★ والبيت فيه شطران لا سطرٌ واحد', /class="sadr"/.test(doc) && /class="ajz"/.test(doc),
     'الباحث ينقله إلى رسالته كما هو، فلو خرج نثرًا أعاد تنسيقه بيتًا بيتًا');
  ok('ومعه الإحالة كاملة', /ديوان المتنبي/.test(doc) && /ص ١٢/.test(doc));
  ok('وملاحظتُه ووسمُه', /يصلح شاهدًا للفصل الثاني/.test(doc) && /\[السعي\]/.test(doc));
  ok('ولبيدٌ أوّلًا في الملفّ', doc.indexOf('لبيد') < doc.indexOf('المتنبي'));
  ok('ولا وسمَ HTML يتسرّب من النصّ', !/<script/i.test(researchHtml([{ text: '<script>x</script>' }])));

  const table = csv(items);
  ok('★ وجدولُ Excel يُفتح بالعربية لا بطلاسم', table.startsWith('\ufeff'),
     'بغير BOM يقرأ Excel العربية حروفًا مبعثرة، فيظنّ الباحث الملفّ معطوبًا');
  eq('وفيه صفٌّ لكل بيت', table.trim().split('\n').length, 3);
  ok('والصدر والعجز منفصلان', /"بقدر الكد تكتسب المعالي"/.test(table));

  ok('وBibTeX لكل بيت', bibtexAll(items).match(/@incollection/g)?.length === 2);
}

// ── القافية والتقطيع ──────────────────────────────────────────────────────
{
  eq('الرويّ آخرُ حرفٍ صحيح', rhyme('وكل نعيم لا محالة زائلُ')?.rawi, 'ل');
  eq('وحرفُ المدّ بعده وصلٌ لا رويّ', rhyme('ولكن تؤخذ الدنيا غلابا')?.tail, 'با');
  eq('ورويُّه الباء', rhyme('ولكن تؤخذ الدنيا غلابا')?.rawi, 'ب');
  eq('و«ترتيلا» رويُّها اللام', rhyme('ثم رتلت ذكركم ترتيلا')?.rawi, 'ل');
  ok('وما قصُر عن حرفين لا قافيةَ له', rhyme('و') === null);

  const s1 = scan('كَلَامُنَا لَفْظٌ مُفِيدٌ كاستَقِم ... واسْمٌ وفِعْلٌ ثمَّ حَرفٌ الكَلِم');
  ok('التقطيع حركةٌ وسكون', /^[10?]+$/.test(s1.pattern));
  ok('★ وما لم يضبطه النصّ يُترك «؟» ولا يُفرض عليه حكم', s1.pattern.includes('?'),
     'فرضُ الحركة على حرفٍ ساكنٍ يزيح النمط كلَّه فيخرج البيت عن كلّ بحر');
  ok('والمشكول أعلى ضبطًا من غيره',
     s1.vocalized > scan('كلامنا لفظ مفيد كاستقم ... واسم وفعل ثم حرف الكلم').vocalized);

  // ★ ولا يُعلَن بحرٌ لم يقم عليه دليل ★
  const m = meterOf('كَلَامُنَا لَفْظٌ مُفِيدٌ كاستَقِم ... واسْمٌ وفِعْلٌ ثمَّ حَرفٌ الكَلِم');
  eq('★ فالبحر لا يُعلَن', m.bahr, null,
     'قِيس على سبعة أبياتٍ حقيقية فأصاب «الأقرب» في أربعة، والفرقُ بين الأول والثاني ٠٫٠١ — '
     + 'وإعلانُ بحرٍ خاطئٍ في بطاقةٍ يَنسخها باحثٌ إلى رسالته أسوأُ من السكوت');
  ok('ويُقال سببُ السكوت', /لم يُحكم ببحر|غير مشكول/.test(m.reason));
  ok('ويبقى الأقربُ للاستئناس', typeof m.closest === 'string');
}

// ── جهازُ المحقّق: ما كتبه الكتابُ نفسه ───────────────────────────────────
// ★ الكشفُ الذي غيّر الحكم: البحرُ الذي امتنعتُ عن إعلانه مكتوبٌ في الديوان. ★
{
  eq('★ الديوان يكتب بحرَ قصيدته فوقها', meterFromHeading('فتىً كان [الطويل]'), 'الطويل',
     'وكان الموقع يعتذر عن البحر لأن التقطيع الآليّ لا يفصل بين البحور — والمصدرُ القاطع في النصّ');
  eq('و«[الوافر]»', meterFromHeading('يذكرني بأربدَ كلُّ خصمٍ [الوافر]'), 'الوافر');
  eq('و«[الرجز]»', meterFromHeading('إنّ أبانَ كان حلواً بَسرا [الرجز]'), 'الرجز');
  eq('و«[من الوافر]» في كتب التراجم', meterFromHeading('قال: أنشد لنفسه [من الوافر]:'), 'الوافر');
  ok('ولا يُختلق بحرٌ من سطرٍ عاديّ', meterFromHeading('وقال في هجاء قوم:') === null);

  eq('★ والغرضُ يُقرأ من فعل المناسبة لا يُخمَّن', occasionOf('أنشد يرثي أخاه أربد:')?.purpose, 'رثاء');
  eq('ومعه نصُّ المناسبة', occasionOf('أنشد يرثي أخاه أربد:')?.occasion, 'يرثي أخاه أربد');
  eq('و«في هجاء قوم» هجاء', occasionOf('وقال في هجاء قوم:')?.purpose, 'هجاء');
  ok('★ وما لم يدلّ على غرضٍ يبقى بلا غرض',
     occasionOf('وقال يخاطب ابنتيه لما حضرته الوفاة:')?.purpose === null,
     'المناسبة تُنقل كما هي، والغرضُ لا يُستنبط إلا من لفظٍ صريح');

  const notes = parseFootnotes(
    '(٣) شطبة: هي الفرس الطويلة. تدف: أي تطير. الرائح: هو الطير الذي يغادر موضعه.\n'
    + '(٤) المعصر: الملجأ والحزر. وما بين قوسين يروى بلفظ: [بغير].');
  eq('حاشيتان', notes.size, 2);
  eq('★ وشرحُ الغريب يُلتقط من الحاشية', notes.get('3').glosses.length, 3,
     'وهو أوّلُ ما يحتاجه الباحث في الصور الشعرية، وكان يُطرح مع الحاشية طرحًا');
  eq('بكلمته وشرحها', notes.get('3').glosses[0].word, 'شطبة');
  eq('ويُنظَّف الشرح من «هي» و«أي»', notes.get('3').glosses[0].gloss, 'الفرس الطويلة');
  eq('★ والروايةُ الأخرى مصرَّحٌ بها', notes.get('4').variant, 'بغير');
  ok('ولا تُقرأ الروايةُ شرحَ غريب', !notes.get('4').glosses.some((g) => /يروى/.test(g.word)));
}

// البيتُ يحمل ما قاله كتابُه: بحرًا وغرضًا وشرحًا ورواية
{
  const page = 'فتىً كان [الطويل]\n'
    + 'أنشد يرثي أخاه أربد:\n'
    + 'لَعَمري لئِنْ كانَ المُخَبِّرُ صادِقاً ... لَقَدْ رُزِئَتْ في سالِفِ الدَّهرِ جعفَرُ (٥)\n'
    + 'فتىً كانَ؛ أمّا كُلَّ شيء سألْتَهُ ... فيُعْطي، وأمّا كُلَّ ذَنْبٍ فيَغْفِرُ';
  const v = attributeVerses(page, extractVerses(page), { bookName: 'ديوان لبيد بن ربيعة العامري' });
  eq('بيتان', v.length, 2);
  eq('★ وبحرُهما من الديوان', v[0].meter, 'الطويل');
  eq('ومصدرُ البحر معلوم', v[0].meterSource, 'book');
  eq('وغرضُهما رثاء', v[1].purpose, 'رثاء');
  eq('ويسري الغرضُ على أبيات القصيدة', v[1].occasion, 'يرثي أخاه أربد');
  eq('★ ورقمُ الحاشية يُلتقط ليوصل البيت بشرحه', v[0].footnote, '٥');
  ok('ولا يبقى الرقمُ في نصّ البيت', !v[0].text.includes('(٥)') && !v[0].text.includes('(٥'));
}

// ★ أفعالُ القطع على أصلها لا على صورةٍ منها ★
{
  ok('«وأنشد يرثيه أيضاً:» لا تُخرج شاعرًا اسمه «يرثيه»',
     readAttributionLine('وأنشد يرثيه أيضاً:', { requireColon: true }) === null,
     'كانت القائمة تحفظ «يرثي» وحدها، فينفذ منها ما لحقته هاء — واسمٌ مختلَق لا يطابق ترجمةً قطّ');
  eq('و«وأنشد لبيد يخاطب امرأته:» تُخرج «لبيد» وحده',
     readAttributionLine('وأنشد لبيد يخاطب امرأته:', { requireColon: true })?.name, 'لبيد');
  eq('والاسمُ الصريح يبقى', readAttributionLine('وقال المتنبي يعاتب سيف الدولة:', { requireColon: true })?.name, 'المتنبي');
}

// ★ معقوفتا المحقّق حكمٌ لا زينة ★
{
  const v = extractVerses('٢١ - [فَتى لا تَراهُ النّابُ إلفاً لسَقْبِها ... إذا اخْتَلَجتْ بالناسِ إحْدى الكَبائرِ]');
  eq('يُستخرج البيت', v.length, 1);
  ok('★ ويُعلَّم بأن المحقّق أطبق عليه معقوفتين', v[0].doubted === true,
     'وقصُّهما صامتًا إخفاءُ حكمٍ علميّ بأن البيت زائدٌ أو مشكوكٌ في نسبته');
  const keep = extractVerses('وقُولا هوَ المرءُ الذي لا [خَليلَهُ] ... أضاعَ، وَلا خانَ الصَّديقَ وَلا غَدَرْ (٤)');
  ok('★ ولا يُبتر قوسٌ له قرينٌ في شطره', keep[0].sadr.endsWith(']'),
     'كان القصُّ يبتلع المعقوفة الخاتمة ويُبقي الفاتحة: «لا [خَليلَهُ ... أضاعَ»');
  ok('وليس هذا شكًّا في البيت', keep[0].doubted === false);
  const shahid = extractVerses('(وهل يعمن من كان في العصر الخالي ... نعم وهل تعمن أحوال)');
  ok('وقوسا الشاهد يُقصَّان كما كانا', !shahid[0].sadr.startsWith('(') && !shahid[0].ajz.endsWith(')'));
}

// ── «بيتُك في المكتبة» ────────────────────────────────────────────────────
// ★ كان بيتُ السائل يُستبعد من النتائج ويُطرح صامتًا. ★
{
  const verses = [
    { text: 'يذكرني بأربد كل خصم ... ألد تخال خطته ضرارا', poet: 'لبيد بن ربيعة', deathYear: 41,
      meter: 'الوافر', source: { bookName: 'ديوان لبيد', bookId: 35077, pageId: 43, printedPage: '48' } },
    { text: 'إذا اقتصدوا فمقتصد أريب ... وإن جاروا سواء الحق جارا', poet: 'لبيد بن ربيعة',
      source: { bookName: 'ديوان لبيد', bookId: 35077, pageId: 43, printedPage: '48' } },
  ];
  const ix = buildIndex(verses);
  const load = async (kind, bucket) => (kind === 'tokens' ? ix.tokens.get(bucket) : ix.store.get(bucket)) ?? {};
  const opts = { tokenShards: ix.meta.tokenShards, verseShards: ix.meta.verseShards };

  const r = await searchIndex('يذكرني بأربد كل خصم ... ألد تخال خطته ضرارا', load,
    { ...opts, excludeVerse: 'يذكرني بأربد كل خصم ... ألد تخال خطته ضرارا' });
  ok('★ بيتُك لا يعود جوابًا لنفسه', !r.verses.some((v) => /يذكرني/.test(v.text)));
  eq('★ ولكنّه يُردّ في بابه: «بيتُك في المكتبة»', r.itself?.length, 1,
     'كان يُقال «لم يُوجد بيتٌ موافق» وبيتُه في ديوان لبيد ص٤٨ بروايته ونسبته وبحره');
  eq('ومعه كتابه وصفحته', r.itself[0].source.printedPage, '48');
  eq('ونسبتُه', r.itself[0].poet, 'لبيد بن ربيعة');
  eq('وبحرُه كما في الديوان', r.itself[0].meter, 'الوافر');
}

// ── الرجزُ المشطور ────────────────────────────────────────────────────────
// ★ بابٌ من الشعر كان خارج الفهرس كلَّه، والأداةُ لا تعلم. ★
{
  const page = 'إنّ أبانَ كان حلواً بَسرا [الرجز]\n'
    + 'وأنشد:\n'
    + 'إنَّ أبَانَ كانَ حُلْوَاً بسرَا\n'
    + 'مُلِّئَ عَمْراً وأُرِبَّ عَمْرَا\n'
    + 'ونالَ مِنْ يكْسُومَ يَوْماً صِهْرَا (٥)\n'
    + 'وَرْدٌ إذا كانَ النَّواصي غُبْرَا';
  const v = attributeVerses(page, extractVerses(page), { bookName: 'ديوان لبيد بن ربيعة العامري' });
  eq('★ أربعةُ أبياتٍ مشطورة', v.length, 4,
     'الاقتناصُ كلُّه مبنيٌّ على «...» بين الشطرين، والأرجوزةُ بيتٌ في كل سطرٍ بلا فاصل');
  ok('وكلُّها مشطورة', v.every((x) => x.mashtur === true));
  ok('ولا عجزَ لها', v.every((x) => x.ajz === ''));
  eq('وبحرُها من الديوان', v[0].meter, 'الرجز');
  eq('ونسبتُها لصاحب الديوان', v[0].poet, 'لبيد بن ربيعة العامري');
  eq('ورقمُ الحاشية يُلتقط منها كذلك', v[2].footnote, '٥');
  ok('ولا يبقى الرقمُ في النصّ', !v[2].text.includes('٥)'));

  // ★ والفارقُ عن قصيدةٍ كُتبت شطرًا في كلّ سطر هو القافية ★
  const split = 'ألا كل شيء ما خلا الله باطل\nوكل نعيم لا محالة زائل\nوكل أناس سوف تدخل بينهم\nدويهية تصفر منها الأنامل';
  const notRajaz = extractVerses(split).filter((x) => x.mashtur);
  ok('فما اختلفت قوافيه لا يُقرأ أرجوزة', notRajaz.length === 0,
     'وإلّا صار البيتُ الواحد بيتين، وهو تحريفٌ في النقل');

  // ★ ولا يُختلق شعرٌ من نثر ★
  const prose = 'وقال المؤلف رحمه الله تعالى\nوهذا باب في ذكر الأحكام\nوفيه مسائل كثيرة جدا\nثم قال بعد ذلك';
  eq('والنثرُ لا يُقرأ شعرًا', extractVerses(prose).length, 0);
}

// ── مدخلُ الباحث: كلمةٌ أم بيتٌ أم نثر؟ ───────────────────────────────────
{
  ok('★ «الدهر» نصٌّ عربيٌّ يُبحث به', looksArabic('الدهر'),
     'كان شرطُ الكلمتين يردّه برسالة «هذا لا يبدو بيتًا عربيًّا» — وهي كاذبة، '
     + 'والباحثُ في الصور الشعرية أوّلُ ما يبحث بكلمة');
  ok('و«الشيب» كذلك', looksArabic('الشيب'));
  ok('و«hello» ليس عربيًّا', !looksArabic('hello'));
  ok('وحرفٌ واحدٌ لا يُبحث به', !looksArabic('أ'));

  eq('★ والكلمةُ تُعرف كلمةً', inputKind('الدهر'), 'word');
  eq('والبيتُ بيتًا', inputKind('وما نيل المطالب بالتمني ... ولكن تؤخذ الدنيا غلابا'), 'verse');
  eq('★ والفقرةُ المرسلة نثرًا', inputKind(
    'هذا كلامٌ نثريٌّ طويلٌ لا شعر فيه البتة وإنما أردت أن أرى ماذا يقول الموقع لمن لصق فقرةً من كتاب فيها كلام'), 'prose',
     'لُصقت فقرةٌ فقال «بيتان موافقان» — فالأداة تميّز الشعر في مخرجها ولا تميّزه في مدخلها');
  eq('والشطران في سطرين بيت', inputKind('ألا كل شيء ما خلا الله باطل\nوكل نعيم لا محالة زائل'), 'verse');
}

// ── التصدير يحمل ما يُعرض ────────────────────────────────────────────────
{
  const v = {
    text: 'طوته المنايا فوق جرداء شطبة ... تدف دفيف الرائح المتمطر',
    poet: 'لبيد بن ربيعة', deathYear: 41, meter: 'الطويل', purpose: 'رثاء',
    occasion: 'يرثي أخاه أربد', variant: 'بغير', doubted: true, occurrences: 3,
    alsoIn: ['خزانة الأدب'], disputedPoets: ['لبيد', 'النابغة'],
    why: { label: 'شارك بيتك في: المنايا' },
    glosses: [{ word: 'شطبة', gloss: 'الفرس الطويلة' }],
    source: { bookName: 'ديوان لبيد', bookAuthor: 'لبيد', printedPage: '45' },
  };
  const doc = researchHtml([v]);
  ok('★ الملفّ يحمل البحرَ والغرض', /البحر: الطويل/.test(doc) && /الغرض: رثاء/.test(doc),
     'كان الباحث يرى على الشاشة ما لا يجده في ملفّه — وهو الملفّ الذي يدخل بحثه');
  ok('وشرحَ الغريب', /شطبة: الفرس الطويلة/.test(doc));
  ok('والروايةَ الأخرى', /وفي روايةٍ: بغير/.test(doc));
  ok('وشكَّ المحقّق', /بين معقوفتين/.test(doc));
  ok('والخلافَ في النسبة', /اختُلف في نسبته/.test(doc));
  ok('وسببَ الموافقة', /سببُ الموافقة/.test(doc));
  ok('★ وجمعُ المواضع صحيح', /ورد في ٣ مواضع/.test(doc), '«٣ موضعًا» كسرٌ ظاهر');

  const table = csv([v]);
  const head = table.split('\n')[0];
  for (const col of ['البحر', 'الغرض', 'القافية', 'شرح الغريب', 'الرواية الأخرى', 'سبب الموافقة']) {
    ok(`وعمودُ «${col}» في الجدول`, head.includes(col));
  }
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
