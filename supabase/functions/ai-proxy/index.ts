// =============================================================================
// Supabase Edge Function: ai-proxy
//
// Streams an LLM completion to the authenticated user using OUR pooled API
// keys. Enforces per-tier monthly quota via the `me_status` view + `bump_usage`
// RPC defined in schema.sql.
//
// Wire format:
//
//   Request  POST /functions/v1/ai-proxy
//            Authorization: Bearer <supabase-jwt>
//            apikey: <supabase-anon>
//            Body: {
//              provider: 'gemini' | 'openai' | 'anthropic',
//              model:    string,        // must be in ALLOWED[provider]
//              prompt:   string,
//              attachments?: [{ type:'pdf', mimeType, dataBase64 }],
//            }
//
//   Response Content-Type: text/event-stream
//            Each event is `data: {"text":"<chunk>"}\n\n`
//            Terminal event: `data: {"done":true}\n\n`
//            On error: `data: {"error":"<msg>","code":"..."}\n\n`
//
// Required env (set with `supabase secrets set ...`):
//   AIS_GEMINI_KEY      AIza…
//   AIS_OPENAI_KEY      sk-…
//   AIS_ANTHROPIC_KEY   sk-ant-…
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPA_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPA_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GEMINI_KEY       = Deno.env.get('AIS_GEMINI_KEY')      || '';
const OPENAI_KEY       = Deno.env.get('AIS_OPENAI_KEY')      || '';
const ANTHROPIC_KEY    = Deno.env.get('AIS_ANTHROPIC_KEY')   || '';

const FREE_MONTHLY_LIMIT = 25;
const PRO_MONTHLY_LIMIT  = 50;

const ALLOWED: Record<string, string[]> = {
  gemini:    ['gemini-2.0-flash', 'gemini-2.5-pro'],
  openai:    ['gpt-4o-mini', 'gpt-4o'],
  anthropic: ['claude-haiku-4-5', 'claude-sonnet-4-6'],
};
const PRO_MODELS = new Set(['gemini-2.5-pro', 'gpt-4o', 'claude-sonnet-4-6']);

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------

function sseLine(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

function errStream(error: string, code?: string): Response {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(sseLine({ error, code: code || 'ERROR' }));
      controller.enqueue(sseLine({ done: true }));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}

// ---------------------------------------------------------------------------
// Provider streaming → normalized SSE
// ---------------------------------------------------------------------------

async function* iterUpstreamSSE(resp: Response): AsyncGenerator<string> {
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`upstream HTTP ${resp.status}: ${t.slice(0, 200)}`);
  }
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const lines = block.split('\n').filter((l) => l.startsWith('data:'));
      if (lines.length) yield lines.map((l) => l.slice(5).trimStart()).join('\n');
    }
  }
}

async function* streamGemini(model: string, prompt: string, attachments: Attachment[]): AsyncGenerator<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_KEY}`;
  const parts: any[] = [];
  for (const a of attachments || []) {
    if (a.type === 'pdf' && a.dataBase64) {
      parts.push({ inlineData: { mimeType: a.mimeType || 'application/pdf', data: a.dataBase64 } });
    }
  }
  parts.push({ text: prompt });

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.4 } }),
  });
  for await (const payload of iterUpstreamSSE(resp)) {
    try {
      const j = JSON.parse(payload);
      const chunks = j?.candidates?.[0]?.content?.parts || [];
      const t = chunks.map((p: any) => p.text).filter(Boolean).join('');
      if (t) yield t;
    } catch (_) { /* ignore keepalives */ }
  }
}

async function* streamOpenAI(model: string, prompt: string): AsyncGenerator<string> {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + OPENAI_KEY },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      stream: true,
    }),
  });
  for await (const payload of iterUpstreamSSE(resp)) {
    if (payload === '[DONE]') break;
    try {
      const j = JSON.parse(payload);
      const t = j?.choices?.[0]?.delta?.content || '';
      if (t) yield t;
    } catch (_) {}
  }
}

async function* streamAnthropic(model: string, prompt: string): AsyncGenerator<string> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
  });
  for await (const payload of iterUpstreamSSE(resp)) {
    try {
      const j = JSON.parse(payload);
      if (j.type === 'content_block_delta' && j.delta && j.delta.type === 'text_delta') {
        if (j.delta.text) yield j.delta.text;
      } else if (j.type === 'error') {
        throw new Error(j.error?.message || 'anthropic stream error');
      }
    } catch (e) {
      if (e instanceof SyntaxError) continue;
      throw e;
    }
  }
}

interface Attachment { type: string; mimeType?: string; dataBase64?: string }

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  // 1. Authenticate
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return errStream('Unauthorized', 'AUTH_REQUIRED');

  const supa = createClient(SUPA_URL, SUPA_SERVICE_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userRes, error: userErr } = await supa.auth.getUser();
  if (userErr || !userRes?.user) return errStream('Unauthorized', 'AUTH_REQUIRED');
  const user = userRes.user;
  const admin = createClient(SUPA_URL, SUPA_SERVICE_KEY);

  // 2. Tier + quota
  const { data: statusRow } = await supa.from('me_status').select('*').maybeSingle();
  const tier        = (statusRow?.tier as string) || 'free';
  const monthUsage  = (statusRow?.month_usage as number) || 0;
  const limit       = tier === 'pro' ? PRO_MONTHLY_LIMIT : FREE_MONTHLY_LIMIT;
  if (monthUsage >= limit) {
    return errStream(`Monthly quota exceeded (${monthUsage}/${limit})`, 'QUOTA_EXCEEDED');
  }

  // 3. Parse body + validate
  let body: any;
  try { body = await req.json(); } catch (_) { return errStream('Bad JSON', 'BAD_REQUEST'); }
  const provider    = String(body.provider || '');
  const model       = String(body.model    || '');
  const prompt      = String(body.prompt   || '');
  const attachments = (body.attachments as Attachment[]) || [];

  if (!ALLOWED[provider]?.includes(model)) {
    return errStream(`Unknown provider/model: ${provider}/${model}`, 'BAD_MODEL');
  }
  if (PRO_MODELS.has(model) && tier !== 'pro') {
    return errStream('Pro model requires a Pro subscription', 'PRO_REQUIRED');
  }
  if (!prompt) return errStream('Empty prompt', 'BAD_REQUEST');

  // Refuse if provider key isn't configured
  const keyMissing =
    (provider === 'gemini'    && !GEMINI_KEY) ||
    (provider === 'openai'    && !OPENAI_KEY) ||
    (provider === 'anthropic' && !ANTHROPIC_KEY);
  if (keyMissing) {
    return errStream(`Provider ${provider} not configured on server`, 'POOL_KEY_MISSING');
  }

  // 4. Stream
  const iter =
    provider === 'gemini'    ? streamGemini(model, prompt, attachments) :
    provider === 'openai'    ? streamOpenAI(model, prompt) :
                               streamAnthropic(model, prompt);

  let aborted = false;
  req.signal.addEventListener('abort', () => { aborted = true; });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of iter) {
          if (aborted) break;
          controller.enqueue(sseLine({ text: chunk }));
        }
        if (!aborted) {
          controller.enqueue(sseLine({ done: true }));
          // 5. Bill *after* a successful stream
          try { await admin.rpc('bump_usage', { p_user_id: user.id }); } catch (_) {}
        }
      } catch (e) {
        const msg = (e as Error).message || 'upstream error';
        controller.enqueue(sseLine({ error: msg, code: 'UPSTREAM_ERROR' }));
        controller.enqueue(sseLine({ done: true }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...cors,
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
});
