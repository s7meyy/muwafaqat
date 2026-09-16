import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [token, label] of [['wrong-key-123','مفتاحٌ خاطئ'],['مفتاحٌ-عربي','مفتاحٌ عربيّ'],['test','مفتاحٌ صحيح']]) {
  const ctx = await b.newContext();
  await ctx.addInitScript(() => localStorage.setItem('muwafaqat.bridge','http://localhost:8790'));
  const p = await ctx.newPage();
  await p.goto('http://localhost:8123/web/');
  await p.evaluate((t)=>localStorage.setItem('muwafaqat.token',t), token);
  await p.reload(); await p.waitForTimeout(2200);
  await p.fill('#q','التمني الأماني'); await p.click('#search'); await p.waitForTimeout(5000);
  console.log(`\n— ${label} —`);
  console.log('  التلميح:', (await p.textContent('#hint'))?.trim() || '(لا شيء)');
  console.log('  الحالة :', (await p.textContent('#status'))?.trim().slice(0,80));
  await ctx.close();
}
await b.close();
