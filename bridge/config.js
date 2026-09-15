// إعداد الجسر — كله من متغيّرات البيئة، ولا مفتاح في ملفٍ يُرفع.

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`المتغيّر ${name} مطلوب. انظر bridge/README.md`);
  return v;
}

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT || 8787),
    host: env.HOST || '127.0.0.1',
    // المفتاح الذي يحمي الجسر. بلا مفتاحٍ يصير بحثُ مكتبتك مفتوحًا لمن وجد النفق.
    token: env.BRIDGE_TOKEN || required('BRIDGE_TOKEN'),
    // كيف يُشغَّل خادم MCP للشاملة على جهازك
    mcpCommand: env.SHAMELA_MCP_CMD || 'shamela-mcp',
    mcpArgs: (env.SHAMELA_MCP_ARGS || '').split(' ').filter(Boolean),
    // النطاقات المسموح لها بمناداة الجسر من المتصفّح
    allowedOrigins: (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    timeoutMs: Number(env.MCP_TIMEOUT_MS || 60_000),
    rateLimitPerMinute: Number(env.RATE_LIMIT_PER_MINUTE || 60),
  };
}
