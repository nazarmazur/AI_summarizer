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
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const eventBlock = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const dataLines = [];
      for (const line of eventBlock.split('\n')) {
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

async function streamGemini({ apiKey, model, prompt, onDelta, attachments }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

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
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
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

async function streamOpenAI({ apiKey, model, prompt, onDelta }) {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
      stream: true,
    }),
  });
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

async function streamAnthropic({ apiKey, model, prompt, onDelta }) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':       'application/json',
      'x-api-key':          apiKey,
      'anthropic-version':  '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
  });
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
    const err = new Error('PDF attachments require Gemini. Switch the model to a Gemini one, or pick "pdfjs" PDF mode.');
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
