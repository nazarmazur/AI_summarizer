// Per-source conversation store backed by chrome.storage.session.
//
// Each summarised page gets a `sourceKey` (videoId for videos, full URL for
// articles/PDF, hash of bytes for uploaded PDFs). We keep:
//
//   {
//     sourceKey,
//     title:       string,
//     content:     string,   // extracted text — used as context for chat
//     contentMode: 'full' | 'summary',  // when content > MAX_CTX, we store only the summary
//     summary:     string,   // markdown of the produced summary
//     messages:    [ { role:'user'|'assistant', text:string, ts:number } ],
//     createdAt:   number,
//   }
//
// chrome.storage.session is volatile — cleared when the browser quits — which
// is exactly what we want for a transient chat. For permanent history we use
// Supabase (separate concern).

const PREFIX = 'ais_chat::';
const MAX_CTX = 40_000;                  // chars; bigger than this we strip to summary only
const MAX_MESSAGES = 30;                 // keep convos short to control token usage
const TTL_MS = 6 * 60 * 60 * 1000;       // 6h soft TTL (session storage also self-clears)

export function sourceKeyFromResult(result) {
  if (!result) return null;
  if (result.videoId) return 'vid:' + result.videoId;
  if (result.url)     return 'url:' + result.url;
  return null;
}

export async function saveContext({ sourceKey, title, content, summary }) {
  if (!sourceKey) return;
  const trimmed = (content || '');
  const mode    = trimmed.length > MAX_CTX ? 'summary' : 'full';
  const safe    = mode === 'summary' ? '' : trimmed;
  const ctx = {
    sourceKey,
    title:       title || '',
    content:     safe,
    contentMode: mode,
    summary:     summary || '',
    messages:    [],
    createdAt:   Date.now(),
  };
  await chrome.storage.session.set({ [PREFIX + sourceKey]: ctx });
  return ctx;
}

export async function getContext(sourceKey) {
  if (!sourceKey) return null;
  const r = await chrome.storage.session.get(PREFIX + sourceKey);
  const ctx = r[PREFIX + sourceKey];
  if (!ctx) return null;
  if (Date.now() - (ctx.createdAt || 0) > TTL_MS) {
    await chrome.storage.session.remove(PREFIX + sourceKey);
    return null;
  }
  return ctx;
}

export async function appendMessage(sourceKey, message) {
  const ctx = await getContext(sourceKey);
  if (!ctx) return null;
  ctx.messages.push({ ...message, ts: Date.now() });
  // Trim oldest if we exceed the cap, but keep user+assistant pairs intact.
  while (ctx.messages.length > MAX_MESSAGES) ctx.messages.shift();
  await chrome.storage.session.set({ [PREFIX + sourceKey]: ctx });
  return ctx;
}

export async function clearContext(sourceKey) {
  if (!sourceKey) return;
  await chrome.storage.session.remove(PREFIX + sourceKey);
}
