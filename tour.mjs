import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await b.newContext({ viewport: { width: 760, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.addInitScript(() => {
  localStorage.setItem('muwafaqat.bridge', 'http://localhost:8790');
  localStorage.setItem('muwafaqat.token', 'test');
});

await p.goto('http://localhost:8123/web/');
await p.waitForTimeout(2500);

console.log('=== الجسر حيًّا ===');
console.log('التلميح     :', JSON.stringify((await p.textContent('#hint'))?.trim()));
console.log('المجلس      :', JSON.stringify((await p.textContent('#council-hint'))?.trim()),
  '· معطَّل؟', await p.isDisabled('#use-council'));
console.log('تبويب الصورة:', await p.isDisabled('#tab-image') ? 'معطَّل' : 'متاح');

await p.fill('#q', 'وما نيل المطالب بالتمني ... ولكن تؤخذ الدنيا غلابا');
const t0 = Date.now();
await p.click('#search');
await p.waitForTimeout(6000);
console.log('\nزمن البحث بالمجلس:', Date.now() - t0, 'م.ث');
console.log('الحالة :', (await p.textContent('#status'))?.trim().slice(0, 120));
console.log('المجلس :', (await p.textContent('#council-note'))?.trim().slice(0, 150));
const cards = await p.locator('.card').count();
console.log('بطاقات :', cards);

if (cards) {
  console.log('\n=== النسخ ===');
  await p.locator('.card [data-act="copy"]').first().click();
  await p.waitForTimeout(400);
  console.log('نصّ الزرّ بعد النقر:', await p.locator('.card [data-act="copy"]').first().textContent());
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => '(تعذّر)'));
  console.log('ما نُسخ:\n' + clip.split('\n').map((l) => '  ' + l).join('\n'));

  console.log('\n=== الحفظ والثبات بعد إعادة التحميل ===');
  await p.locator('.card [data-act="save"]').first().click();
  await p.waitForTimeout(300);
  console.log('شريط المحفوظات:', (await p.textContent('#saved-bar'))?.replace(/\s+/g, ' ').trim());
  await p.reload();
  await p.waitForTimeout(2500);
  console.log('بعد إعادة التحميل — الشريط ظاهر؟', !(await p.locator('#saved-bar').isHidden()));
  console.log('                    نصّه:', (await p.textContent('#saved-bar'))?.replace(/\s+/g, ' ').trim());

  console.log('\n=== التصدير ===');
  const dl = p.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await p.click('#export-saved');
  const d = await dl;
  console.log('اسم الملف:', d ? await d.suggestedFilename() : '✗ لم يبدأ تنزيل');
}

console.log('\n=== مسار الصورة ===');
await p.click('#tab-image');
await p.setInputFiles('#file', { name: 'p.png', mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
await p.waitForTimeout(4000);
console.log('ملخّص التفريغ:', JSON.stringify((await p.textContent('#approve-summary'))?.trim().slice(0, 110)));
console.log('زرّ البحث معطَّل قبل الاعتماد؟', await p.isDisabled('#search'));

console.log('\n=== لوحة المفاتيح ===');
await p.click('#tab-text');
await p.keyboard.press('Tab');
for (let i = 0; i < 6; i++) {
  const el = await p.evaluate(() => {
    const a = document.activeElement;
    return a ? `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}` : 'none';
  });
  process.stdout.write(el + ' → ');
  await p.keyboard.press('Tab');
}
console.log();

console.log('\n=== مفتاحٌ خاطئ ===');
await p.evaluate(() => localStorage.setItem('muwafaqat.token', 'wrong'));
await p.reload();
await p.waitForTimeout(2200);
await p.fill('#q', 'المطالب التمني');
await p.click('#search');
await p.waitForTimeout(4000);
console.log('الحالة:', (await p.textContent('#status'))?.trim().slice(0, 140));

console.log('\nأخطاء جافاسكربت:', errs.length ? errs.slice(0, 4) : 'لا شيء');
await b.close();
