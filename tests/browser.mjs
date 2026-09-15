import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 760, height: 1100 }, deviceScaleFactor: 2 });

// نعترض نداء التفريغ ونردّ بنتيجةٍ كأنها من نموذجين
await p.route('**/v1/transcribe', async (route) => {
  const { diffTranscripts, disagreementCount, agreementRatio, proposedText } =
    await import('../core/transcript.js');
  const a = 'وَما نَيْلُ المَطالِبِ بِالتَمَنّي ... وَلَكِن تُؤْخَذُ الدُنيا غِلابا\nوَما اِستَعصى عَلى قَومٍ مَنالٌ ... إِذا الإِقدامُ كانَ لَهُم رِكابا';
  const c = 'وما نيل المطالب بالتمني ... ولكن تؤخذ الدنيا غصابا\nوما استعصى على قوم منال ... إذا الاقدام كان لهم ركابا';
  const segments = diffTranscripts(a, c);
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    text: proposedText(segments), segments, compared: true,
    disagreements: disagreementCount(segments), agreement: agreementRatio(segments),
    readings: [{ provider: 'gemini' }, { provider: 'openrouter' }], failed: [],
  }) });
});

await p.goto('http://localhost:8123/web/');
await p.click('#tab-image');
await p.setInputFiles('#file', { name: 'p.png', mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64') });
await p.waitForSelector('.w-word', { timeout: 5000 });

const before = await p.isDisabled('#search');
await p.click('#approve-btn');
const after = await p.isDisabled('#search');
await p.fill('#transcript', (await p.inputValue('#transcript')) + ' زيادة');
const afterEdit = await p.isDisabled('#search');

console.log('زرّ البحث قبل الاعتماد معطَّل:', before);
console.log('وبعد الاعتماد مفتوح:', !after);
console.log('وبعد تعديل النصّ عاد معطَّلًا:', afterEdit);
console.log('ملخّص:', await p.textContent('#approve-summary'));

await p.click('#approve-btn');
await p.screenshot({ path: '/tmp/approve.png', fullPage: true });
await p.emulateMedia({ colorScheme: 'dark' });
await p.screenshot({ path: '/tmp/approve-dark.png', fullPage: true });
await b.close();
