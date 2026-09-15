// تفريغ الصور عبر Google AI Studio — طبقةٌ مجانيةٌ سخيّة، وأقوى المتاح في العربية المصوَّرة.
// المفتاح: GEMINI_API_KEY  ·  النموذج: GEMINI_MODEL (قابلٌ للتغيير حين تتبدّل الأسماء)

import { TRANSCRIBE_PROMPT } from './prompt.js';

export const name = 'gemini';

export function configured(env = process.env) {
  return Boolean(env.GEMINI_API_KEY);
}

export async function transcribe({ imageBase64, mimeType }, env = process.env) {
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts: [
        { text: TRANSCRIBE_PROMPT },
        { inline_data: { mime_type: mimeType, data: imageBase64 } },
      ] }],
      generationConfig: { temperature: 0 }, // لا إبداع في النقل
    }),
  });

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n');
  if (!text) throw new Error('Gemini لم يُرجع نصًّا');
  return { text: text.trim(), model, provider: name };
}
