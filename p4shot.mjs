import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 760, height: 1200 }, deviceScaleFactor: 2 });
await p.addInitScript(() => {
  localStorage.setItem('muwafaqat.bridge', 'http://localhost:8790');
  localStorage.setItem('muwafaqat.token', 'test');
});
await p.goto('http://localhost:8123/web/');
await p.fill('#q', 'دع الأيام تفعل ما تشاء ... وطب نفسا اذا حكم القضاء');
await p.click('#search');
await p.waitForSelector('.card', { timeout: 30000 });
console.log('الحالة:', await p.textContent('#status'));
console.log('المجلس:', await p.textContent('#council-note'));
console.log('بطاقات:', await p.locator('.card').count());
await p.screenshot({ path: '/tmp/p4.png', fullPage: true });
await b.close();
