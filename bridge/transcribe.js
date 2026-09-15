// تفريغ الصورة بنموذجين متوازيين، ثم مقارنتهما.
//
// ولا يُبحث بشيءٍ من هذا حتى يعتمده المستخدم بيده — التفريغ اقتراحٌ لا نتيجة.

import * as gemini from './providers/gemini.js';
import * as openrouter from './providers/openrouter.js';
import { diffTranscripts, disagreementCount, agreementRatio, proposedText } from '../core/transcript.js';

const PROVIDERS = [gemini, openrouter];

export function availableProviders(env = process.env) {
  return PROVIDERS.filter((p) => p.configured(env)).map((p) => p.name);
}

export async function transcribeImage({ imageBase64, mimeType = 'image/jpeg' }, env = process.env) {
  const ready = PROVIDERS.filter((p) => p.configured(env));
  if (!ready.length) {
    const e = new Error('لا مفتاح تفريغٍ مضبوط. اضبط GEMINI_API_KEY أو OPENROUTER_API_KEY.');
    e.code = 'NO_PROVIDER';
    throw e;
  }

  const settled = await Promise.allSettled(
    ready.map((p) => p.transcribe({ imageBase64, mimeType }, env)),
  );
  const ok = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  const failed = settled
    .map((s, i) => (s.status === 'rejected' ? { provider: ready[i].name, error: String(s.reason?.message ?? s.reason) } : null))
    .filter(Boolean);

  if (!ok.length) {
    const e = new Error(`تعذّر التفريغ: ${failed.map((f) => f.error).join(' · ')}`);
    e.code = 'ALL_FAILED';
    throw e;
  }

  // نموذجٌ واحدٌ نجح: نصٌّ بلا مقارنة — ويُصرَّح بذلك، فالثقة أقلّ.
  if (ok.length === 1) {
    return {
      text: ok[0].text,
      readings: ok,
      segments: null,
      compared: false,
      disagreements: 0,
      agreement: null,
      failed,
      note: 'فُرِّغت بنموذجٍ واحد — لا مقارنة تكشف مواضع الشكّ. راجع النصّ كله.',
    };
  }

  const segments = diffTranscripts(ok[0].text, ok[1].text);
  return {
    text: proposedText(segments),
    readings: ok,
    segments,
    compared: true,
    disagreements: disagreementCount(segments),
    agreement: agreementRatio(segments),
    failed,
  };
}
