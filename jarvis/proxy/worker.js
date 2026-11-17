/**
 * JARVIS 共有サーバー（Cloudflare Worker）
 *
 * ジャービスのページから呼ばれ、管理者の API キーを付けて Claude / Gemini に転送する。
 * 利用者はキーを持たなくてよい。合言葉（PASSPHRASE）と、IP ごと・全体の回数制限で守る。
 *
 * 設定（Cloudflare ダッシュボード → Worker → Settings → Variables and Secrets）
 *   PROVIDER          "gemini" または "claude"
 *   MODEL             例: "gemini-3.5-flash-lite" / "claude-haiku-5-5"
 *   GEMINI_API_KEY    （Secret）PROVIDER=gemini のとき
 *   ANTHROPIC_API_KEY （Secret）PROVIDER=claude のとき
 *   PASSPHRASE        （Secret・任意）合言葉。空なら誰でも使える
 *   ALLOWED_ORIGINS   （任意）呼び出しを許すページの origin をカンマ区切り。例: "https://keiiijima.github.io"
 *   NAME              （任意）表示名
 *   LIMIT_PER_MIN     （任意）1 IP あたり 1 分の上限。既定 12
 *   LIMIT_GLOBAL_MIN  （任意）全体で 1 分の上限。既定 60
 */

const buckets = new Map();   // 簡易レート制限（インスタンス内メモリ。厳密ではないが暴走は止まる）
function allow(key, limit) {
  const now = Date.now(), w = 60000;
  const b = buckets.get(key) || { start: now, n: 0 };
  if (now - b.start > w) { b.start = now; b.n = 0; }
  b.n++; buckets.set(key, b);
  if (buckets.size > 5000) for (const [k, v] of buckets) if (now - v.start > w) buckets.delete(k);
  return b.n <= limit;
}
function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const ok = !allowed.length || allowed.includes(origin);
  return {
    'access-control-allow-origin': ok ? (origin || '*') : 'null',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'content-type, x-jarvis-pass, anthropic-beta',
    'access-control-max-age': '86400',
    'vary': 'Origin',
  };
}
const json = (obj, status, h) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...h } });
const err = (status, message, h) => json({ error: { message, status } }, status, h);

export default {
  async fetch(req, env) {
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const url = new URL(req.url);
    const provider = (env.PROVIDER || 'gemini').toLowerCase();
    const needsPass = !!env.PASSPHRASE;

    if (url.pathname === '/config' && req.method === 'GET') {
      if (needsPass && req.headers.get('x-jarvis-pass') !== env.PASSPHRASE) return err(401, 'passphrase required', h);
      return json({ provider, model: env.MODEL || (provider === 'claude' ? 'claude-haiku-5-5' : 'gemini-3.5-flash-lite'), needsPass, name: env.NAME || 'JARVIS shared' }, 200, h);
    }
    if (req.method !== 'POST') return err(404, 'not found', h);
    if (needsPass && req.headers.get('x-jarvis-pass') !== env.PASSPHRASE) return err(401, 'passphrase required', h);

    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    if (!allow('ip:' + ip, +env.LIMIT_PER_MIN || 12)) return err(429, 'rate limit (per user)', h);
    if (!allow('global', +env.LIMIT_GLOBAL_MIN || 60)) return err(429, 'rate limit (global)', h);

    let body;
    try { body = await req.json(); } catch { return err(400, 'invalid JSON', h); }
    let upstream;

    if (url.pathname === '/v1/messages' && provider === 'claude') {
      if (!env.ANTHROPIC_API_KEY) return err(500, 'ANTHROPIC_API_KEY not set', h);
      body.model = env.MODEL || 'claude-haiku-5-5';                        // モデルはサーバー側で固定（高いモデルを勝手に使わせない）
      body.max_tokens = Math.min(+body.max_tokens || 4096, 8000);
      if (/haiku/.test(body.model)) delete body.fallbacks;                   // Haiku はフォールバック非対応
      const fh = { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2026-10-21' };
      if (!/haiku/.test(body.model) && body.fallbacks) fh['anthropic-beta'] = 'server-side-fallback-2026-07-01';
      upstream = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: fh, body: JSON.stringify(body) });
    } else if (url.pathname === '/gemini' && provider === 'gemini') {
      if (!env.GEMINI_API_KEY) return err(500, 'GEMINI_API_KEY not set', h);
      const model = env.MODEL || 'gemini-3.5-flash-lite';
      upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY }, body: JSON.stringify(body) });
    } else {
      return err(404, `unknown route for provider ${provider}`, h);
    }
    // 残高不足は 402 に寄せて、ページ側で分かりやすく出す
    if (upstream.status === 400 && provider === 'claude') {
      const txt = await upstream.text();
      if (/credit|billing/i.test(txt)) return err(402, 'insufficient credit on server key', h);
      return new Response(txt, { status: 400, headers: { 'content-type': 'application/json', ...h } });
    }
    return new Response(upstream.body, { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') || 'application/json', 'cache-control': 'no-store', ...h } });
  },
};
