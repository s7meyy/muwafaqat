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
