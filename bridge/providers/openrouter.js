// تفريغٌ مُقابِل عبر OpenRouter — بوابةٌ واحدةٌ لعشرات النماذج المجانية.
// وجوده ليس احتياطًا: نريد نموذجًا **مختلفًا** يقرأ الصورة نفسها، فيكشف اختلافُهما
// المواضعَ التي لا يُوثق بها. ونموذجان من عائلةٍ واحدةٍ يخطئان الخطأ نفسه.
//
// المفتاح: OPENROUTER_API_KEY  ·  النموذج: OPENROUTER_VISION_MODEL

import { TRANSCRIBE_PROMPT } from './prompt.js';

export const name = 'openrouter';

export function configured(env = process.env) {
  return Boolean(env.OPENROUTER_API_KEY);
}

export async function transcribe({ imageBase64, mimeType }, env = process.env) {
  const model = env.OPENROUTER_VISION_MODEL || 'qwen/qwen2.5-vl-72b-instruct:free';

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'x-title': 'muwafaqat',
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [{ role: 'user', content: [
        { type: 'text', text: TRANSCRIBE_PROMPT },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
      ] }],
    }),
  });

  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenRouter لم يُرجع نصًّا');
  return { text: String(text).trim(), model, provider: name };
}
