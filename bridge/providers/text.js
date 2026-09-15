// مزوّدو النصّ — بوابةٌ واحدةٌ تشغّل نماذج مختلفة بواجهةٍ واحدة.
//
// كلُّ نموذجٍ اختياريّ ومستقل: من سقط سقط اقتراحُه وحده ولم يُعطِّل المجلس.
// والحدود المجانية تُحترم بطابورٍ يحدّ التوازي (انظر runCouncil).

import { EXPAND_PROMPT } from './expand-prompt.js';

const DEFAULT_OPENROUTER_MODELS = [
  'qwen/qwen-2.5-72b-instruct:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'mistralai/mistral-small-3.2-24b-instruct:free',
  'google/gemma-3-27b-it:free',
];

/** يبني قائمة أعضاء المجلس من المفاتيح المضبوطة. */
export function councilMembers(env = process.env) {
  const members = [];

  if (env.GEMINI_API_KEY) {
    members.push({ id: `gemini:${env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash'}`, call: geminiCall });
  }
  if (env.OPENROUTER_API_KEY) {
    const models = (env.OPENROUTER_MODELS || DEFAULT_OPENROUTER_MODELS.join(','))
      .split(',').map((s) => s.trim()).filter(Boolean);
    for (const model of models) {
      members.push({ id: `openrouter:${model}`, call: (v, e) => openAiCompatible(v, e, {
        url: 'https://openrouter.ai/api/v1/chat/completions',
        key: e.OPENROUTER_API_KEY, model, extraHeaders: { 'x-title': 'muwafaqat' },
      }) });
    }
  }
  if (env.GROQ_API_KEY) {
    const model = env.GROQ_MODEL || 'llama-3.3-70b-versatile';
    members.push({ id: `groq:${model}`, call: (v, e) => openAiCompatible(v, e, {
      url: 'https://api.groq.com/openai/v1/chat/completions', key: e.GROQ_API_KEY, model,
    }) });
  }

  return members;
}

async function geminiCall(verse, env) {
  const model = env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${EXPAND_PROMPT}\n${verse}` }] }],
        generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
      }),
    });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('');
}

async function openAiCompatible(verse, env, { url, key, model, extraHeaders = {} }) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, ...extraHeaders },
    body: JSON.stringify({
      model, temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: `${EXPAND_PROMPT}\n${verse}` }],
    }),
  });
  if (!res.ok) throw new Error(`${model} ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content;
}
