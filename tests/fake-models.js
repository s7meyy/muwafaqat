// نماذجُ مزيَّفةٌ تردّ كما تردّ الحقيقية — لاختبار المجلس بلا مفاتيح ولا شبكة.
// وفيها عمدًا: نموذجٌ يعصي التعليمة ويكتب بيتًا، ونموذجٌ يلفّ ردَّه بسياج،
// ونموذجٌ يردّ كلامًا لا يُفهم، ونموذجٌ يسقط. فالمجلس يُختبر بأسوأ أعضائه.

export function installFakeFetch() {
  const original = globalThis.fetch;

  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const body = JSON.parse(init?.body ?? '{}');
    const model = body.model ?? 'gemini';

    const reply = (text) => new Response(JSON.stringify(
      u.includes('generativelanguage')
        ? { candidates: [{ content: { parts: [{ text }] } }] }
        : { choices: [{ message: { content: text } }] },
    ), { status: 200, headers: { 'content-type': 'application/json' } });

    if (model.includes('llama')) throw new Error('الشبكة انقطعت');           // عضوٌ ساقط
    if (model.includes('gemma')) return reply('لا أستطيع مساعدتك في ذلك.');   // ردٌّ غير مفهوم

    if (model.includes('deepseek')) {
      // ★ نموذجٌ عصى التعليمة ودسّ بيتًا مكان استعلام ★
      return reply('```json\n' + JSON.stringify({
        meaning: 'لا يُنال المطلوب بالتمنّي بل بالسعي',
        register: 'فصيح',
        queries: [
          { text: 'الجد والاجتهاد' },
          { text: 'وما نيل المطالب بالتمني ... ولكن تؤخذ الدنيا غلابا' },
          { text: 'بلوغ المنى' },
        ],
      }) + '\n```');
    }

    if (model.includes('mistral')) {
      return reply(JSON.stringify({
        meaning: 'الأماني لا تُغني عن العمل',
        queries: [{ text: 'المطالب التمني' }, { text: 'effort and will' }, { text: 'من في على' }],
      }));
    }

    return reply(JSON.stringify({
      meaning: 'لا تُدرك المعالي بالتمنّي وإنما بالسعي والغلاب',
      register: 'فصيح',
      queries: [
        { text: 'المطالب التمني' },
        { text: 'الجد والاجتهاد' },
        { text: 'طلب المعالي' },
        { text: 'السعي المجد' },
      ],
    }));
  };

  return () => { globalThis.fetch = original; };
}

export const FAKE_ENV = {
  GEMINI_API_KEY: 'fake',
  OPENROUTER_API_KEY: 'fake',
  OPENROUTER_MODELS: 'qwen/q:free,deepseek/d:free,meta-llama/llama:free,mistralai/mistral:free,google/gemma-3:free',
};
