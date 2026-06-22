// Unified interface to Gemini, OpenAI, and Anthropic chat-completion APIs.
//
// Each provider exposes a streaming function that calls onDelta(chunk) for
// each new token batch and resolves with the full text. There is also a
// non-streaming generate() that wraps streaming and accumulates the text.
import { MODELS, SUPABASE_URL, SUPABASE_ANON } from './config.js';
import { getSession } from './supabase.js';

const SETTINGS_KEY = 'ais_settings';
const KEYS_KEY     = 'ais_keys';

export async function getApiKeys() {
  const { [KEYS_KEY]: k } = await chrome.storage.local.get(KEYS_KEY);
  return k || {};
}
export async function setApiKeys(partial) {
  const cur = await getApiKeys();
  const next = { ...cur, ...partial };
  await chrome.storage.local.set({ [KEYS_KEY]: next });
  return next;
}

export async function getSettings() {
  const { [SETTINGS_KEY]: s } = await chrome.storage.local.get(SETTINGS_KEY);
  return s || {};
}
export async function setSettings(partial) {
  const cur = await getSettings();
  const next = { ...cur, ...partial };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

// ---------------------------------------------------------------------------
// SSE helper: take a fetch Response and yield one event payload (string) at a
// time. The caller decides how to interpret each payload (JSON, [DONE], etc.).
// ---------------------------------------------------------------------------

async function* iterSSE(response) {
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (_) {}
    const msg = parsed?.error?.message || text || ('HTTP ' + response.status);
    const e = new Error(msg);
    e.status = response.status;
    throw e;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE events are separated by blank lines. Within an event each line may
    // be `data: …`, `event: …`, etc. We yield the concatenated `data:` payload.
    // Events are separated by a blank line. Gemini sends CRLF (\r\n\r\n) and
    // OpenAI/Anthropic send LF (\n\n) — handle all variants, or we'd parse zero
    // events and the stream would look empty ("returned no text").
    let m;
    while ((m = /\r\n\r\n|\n\n|\r\r/.exec(buf))) {
      const eventBlock = buf.slice(0, m.index);
      buf = buf.slice(m.index + m[0].length);
      const dataLines = [];
      for (const line of eventBlock.split(/\r\n|\n|\r/)) {
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      }
      if (dataLines.length) yield dataLines.join('\n');
    }
  }
}

// ---------------------------------------------------------------------------
// Provider streaming implementations
// ---------------------------------------------------------------------------

function bytesToBase64(bytes) {
  // Convert Uint8Array → base64. Service workers don't have FileReader so we
  // chunk through String.fromCharCode + btoa.
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

// Self-healing fallback: if Google retires a model id, retry once with the
// always-valid "latest" alias so summarization never silently 404s.
const GEMINI_FALLBACK_MODEL = 'gemini-flash-latest';

async function streamGemini({ apiKey, model, prompt, onDelta, attachments }) {
  const parts = [];
  if (attachments && attachments.length) {
    for (const a of attachments) {
      if (a && a.type === 'pdf' && a.bytes) {
        parts.push({
          inlineData: {
            mimeType: a.mimeType || 'application/pdf',
            data:     bytesToBase64(a.bytes),
          },
        });
      }
    }
  }
  parts.push({ text: prompt });

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.4 },
    // Summarizing is not generating — don't let Gemini's default safety filters
    // return an empty response on edgy/political/news content the user is reading.
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };

  async function callModel(modelId) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  let resp = await callModel(model);
  // If the chosen model is gone (404 / NOT_FOUND), transparently retry with the
  // latest-flash alias once.
  if (resp.status === 404 && model !== GEMINI_FALLBACK_MODEL) {
    resp = await callModel(GEMINI_FALLBACK_MODEL);
  }
  let full = '';
  for await (const payload of iterSSE(resp)) {
    try {
      const data = JSON.parse(payload);
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const chunk = parts.map((p) => p.text).filter(Boolean).join('');
      if (chunk) {
        full += chunk;
        onDelta && onDelta(chunk);
      }
    } catch (_) { /* ignore non-JSON keepalive */ }
  }
  if (!full) throw new Error('Gemini returned no text');
  return full;
}

const OPENAI_FALLBACK_MODEL = 'gpt-4o-mini';

async function streamOpenAI({ apiKey, model, prompt, onDelta }) {
  // Reasoning models (o1/o3/o4 family) and the GPT-5 family reject any
  // temperature other than the default — omit the param for them.
  const isReasoning = /^o[0-9]/.test(model) || /^gpt-5/.test(model);
  function buildBody(modelId) {
    const b = { model: modelId, messages: [{ role: 'user', content: prompt }], stream: true };
    if (!isReasoning) b.temperature = 0.4;
    return JSON.stringify(b);
  }
  async function call(modelId) {
    return fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: buildBody(modelId),
    });
  }
  let resp = await call(model);
  // Self-heal if the model id was retired (404 model_not_found).
  if (resp.status === 404 && model !== OPENAI_FALLBACK_MODEL) {
    resp = await call(OPENAI_FALLBACK_MODEL);
  }
  let full = '';
  for await (const payload of iterSSE(resp)) {
    if (payload === '[DONE]') break;
    try {
      const data = JSON.parse(payload);
      const chunk = data?.choices?.[0]?.delta?.content || '';
      if (chunk) {
        full += chunk;
        onDelta && onDelta(chunk);
      }
    } catch (_) { /* ignore */ }
  }
  if (!full) throw new Error('OpenAI returned no text');
  return full;
}

const ANTHROPIC_FALLBACK_MODEL = 'claude-haiku-4-5';

async function streamAnthropic({ apiKey, model, prompt, onDelta }) {
  async function call(modelId) {
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':       'application/json',
        'x-api-key':          apiKey,
        'anthropic-version':  '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      }),
    });
  }
  let resp = await call(model);
  // Self-heal if the model id was retired (404). Anthropic also returns 404 for
  // invalid "-latest" aliases — fall back to a known-valid current model.
  if (resp.status === 404 && model !== ANTHROPIC_FALLBACK_MODEL) {
    resp = await call(ANTHROPIC_FALLBACK_MODEL);
  }
  let full = '';
  for await (const payload of iterSSE(resp)) {
    try {
      const data = JSON.parse(payload);
      // Anthropic event types: message_start, content_block_start,
      // content_block_delta, content_block_stop, message_delta, message_stop, ping
      if (data.type === 'content_block_delta' && data.delta && data.delta.type === 'text_delta') {
        const chunk = data.delta.text || '';
        if (chunk) {
          full += chunk;
          onDelta && onDelta(chunk);
        }
      } else if (data.type === 'error' && data.error) {
        throw new Error(data.error.message || 'Anthropic stream error');
      }
    } catch (e) {
      if (e instanceof SyntaxError) continue;
      throw e;
    }
  }
  if (!full) throw new Error('Anthropic returned no text');
  return full;
}

// ---------------------------------------------------------------------------
// Pooled API: calls our Supabase Edge Function (ai-proxy) which uses OUR
// pooled provider keys. Auth via the user's Supabase JWT. Returns text the
// same way as the direct provider streamers.
// ---------------------------------------------------------------------------

async function streamPooled({ provider, model, prompt, onDelta, attachments }) {
  const session = await getSession();
  if (!session || !session.access_token) {
    const err = new Error('Sign in to use the pooled keys.');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  // Serialize attachments for JSON (bytes → base64)
  const att = (attachments || []).map((a) => ({
    type:       a.type,
    mimeType:   a.mimeType || 'application/octet-stream',
    dataBase64: bytesToBase64(a.bytes),
  }));

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + session.access_token,
      'apikey':         SUPABASE_ANON,
    },
    body: JSON.stringify({ provider, model, prompt, attachments: att }),
  });

  if (!resp.ok && !resp.body) {
    const t = await resp.text().catch(() => '');
    const err = new Error('ai-proxy HTTP ' + resp.status + ': ' + t);
    err.code = 'POOL_HTTP_ERROR';
    throw err;
  }

  let full = '';
  for await (const payload of iterSSE(resp)) {
    try {
      const j = JSON.parse(payload);
      if (j.error) {
        const err = new Error(j.error);
        err.code = j.code || 'POOL_ERROR';
        throw err;
      }
      if (j.done) break;
      if (typeof j.text === 'string' && j.text) {
        full += j.text;
        onDelta && onDelta(j.text);
      }
    } catch (e) {
      if (e instanceof SyntaxError) continue;
      throw e;
    }
  }
  if (!full) throw new Error('Pool returned no text');
  return full;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function resolveModel(modelKey, keys) {
  if (modelKey && MODELS[modelKey]) return MODELS[modelKey];
  if (modelKey === 'gpt')    return MODELS.gpt;
  if (modelKey === 'gemini') return MODELS.gemini;
  if (modelKey === 'claude') return MODELS.claude;
  if (keys.gemini)    return MODELS.gemini;
  if (keys.openai)    return MODELS.gpt;
  if (keys.anthropic) return MODELS.claude;
  return MODELS.gemini;
}

export function pickProviderFromKey(modelKey, keys) {
  return resolveModel(modelKey, keys || {});
}

export async function generateStream(prompt, modelKey, onDelta, options) {
  const keys = await getApiKeys();
  const { provider, model } = resolveModel(modelKey, keys);
  const attachments = (options && options.attachments) || null;
  const usePool     = (options && options.usePool)     || false;

  if (attachments && provider !== 'gemini') {
    const err = new Error('PDF attachments require Gemini. Switch the model to a Gemini one.');
    err.code = 'PDF_REQUIRES_GEMINI';
    throw err;
  }

  // Pool route: skip local API keys, go through our Edge Function.
  if (usePool) {
    return await streamPooled({ provider, model, prompt, onDelta, attachments });
  }

  if (provider === 'gemini') {
    if (!keys.gemini) throw makeNoKeyError('gemini');
    return await streamGemini({ apiKey: keys.gemini, model, prompt, onDelta, attachments });
  }
  if (provider === 'openai') {
    if (!keys.openai) throw makeNoKeyError('openai');
    return await streamOpenAI({ apiKey: keys.openai, model, prompt, onDelta });
  }
  if (provider === 'anthropic') {
    if (!keys.anthropic) throw makeNoKeyError('anthropic');
    return await streamAnthropic({ apiKey: keys.anthropic, model, prompt, onDelta });
  }
  throw new Error('Unknown provider: ' + provider);
}

// Backwards-compatible non-streaming wrapper
export async function generate(prompt, modelKey, options) {
  return await generateStream(prompt, modelKey, null, options);
}

function makeNoKeyError(provider) {
  const err = new Error('NO_API_KEY:' + provider);
  err.code = 'NO_API_KEY';
  err.provider = provider;
  return err;
}
