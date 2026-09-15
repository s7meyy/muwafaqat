// عميل MCP على stdio — بلا تبعيات.
//
// الشاملة تعمل على جهاز المالك خادمَ MCP يتكلّم JSON-RPC أسطرًا على stdin/stdout.
// وهذا الملف يشغّله ويتكلّم معه، فيصير بحثُ ٧٫٦ مليون صفحةٍ متاحًا لدالّةٍ واحدة.

import { spawn } from 'node:child_process';

const PROTOCOL_VERSION = '2024-11-05';

export class McpStdioClient {
  constructor({ command, args = [], env = {}, timeoutMs = 60_000 }) {
    this.command = command;
    this.args = args;
    this.env = env;
    this.timeoutMs = timeoutMs;
    this.child = null;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = '';
    this.ready = null;
  }

  async start() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      this.child = spawn(this.command, this.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...this.env },
      });
      this.child.stdout.setEncoding('utf8');
      this.child.stdout.on('data', (chunk) => this._onData(chunk));
      this.child.stderr.setEncoding('utf8');
      this.child.stderr.on('data', (d) => { if (process.env.MUWAFAQAT_DEBUG) process.stderr.write(`[shamela] ${d}`); });
      this.child.on('exit', (code) => {
        const err = new Error(`خادم الشاملة توقّف (رمز ${code})`);
        for (const { reject } of this.pending.values()) reject(err);
        this.pending.clear();
        this.child = null;
        this.ready = null;
      });

      await this._request('initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'muwafaqat-bridge', version: '0.1.0' },
      });
      this._notify('notifications/initialized', {});
    })();
    return this.ready;
  }

  _onData(chunk) {
    this.buffer += chunk;
    let i;
    while ((i = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, i).trim();
      this.buffer = this.buffer.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      const entry = this.pending.get(msg.id);
      if (!entry) continue;
      this.pending.delete(msg.id);
      clearTimeout(entry.timer);
      if (msg.error) entry.reject(new Error(msg.error.message || 'خطأ من خادم الشاملة'));
      else entry.resolve(msg.result);
    }
  }

  _send(payload) {
    if (!this.child) throw new Error('خادم الشاملة غير مشغَّل');
    this.child.stdin.write(JSON.stringify(payload) + '\n');
  }

  _notify(method, params) {
    this._send({ jsonrpc: '2.0', method, params });
  }

  _request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`انتهت مهلة «${method}» بعد ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try { this._send({ jsonrpc: '2.0', id, method, params }); }
      catch (e) { this.pending.delete(id); clearTimeout(timer); reject(e); }
    });
  }

  /** ينادي أداةً من أدوات الشاملة ويُرجع بياناتها المهيكلة. */
  async callTool(name, args) {
    await this.start();
    const result = await this._request('tools/call', { name, arguments: args });
    if (result?.structuredContent) return result.structuredContent;
    const text = result?.content?.find?.((c) => c.type === 'text')?.text;
    if (text) { try { return JSON.parse(text); } catch { return { text }; } }
    return result;
  }

  stop() {
    if (this.child) { this.child.kill(); this.child = null; this.ready = null; }
  }
}
