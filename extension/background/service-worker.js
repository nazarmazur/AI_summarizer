// Central coordinator. Receives streaming requests from popup, fetches the
// YouTube transcript / page content, builds the prompt, and sends it directly
// to the chosen provider's REST API (Gemini / OpenAI / Anthropic) with the
// user's own key. For long transcripts (≥ CHUNK_THRESHOLD chars) we run a
// map-reduce pass: each chunk gets a quick summary, then a final synthesis
// produces the user-facing output.

import { extract as runExtract, detectKind } from '../lib/extractors/index.js';
import {
  buildSummaryPrompt, buildTimestampsPrompt,
  buildSourceSummaryPrompt, buildAttachmentSummaryPrompt,
  buildChunkSummaryPrompt, buildChunkTimestampsPrompt,
  buildFinalSummaryPrompt, buildFinalTimestampsPrompt,
  buildChatSystemPrompt, buildChatTurnPrompt,
  buildSuggestQuestionsPrompt,
} from '../lib/prompts.js';
import { saveContext, getContext, appendMessage, sourceKeyFromResult } from '../lib/chat-store.js';
import { getTemplate, applyTemplate, BUILTIN_TEMPLATES } from '../lib/templates.js';

// Length descriptors used when expanding {{length}} in templates. Keep in
// sync with prompts.js LENGTH_DESCR.
const LENGTH_DESCR = {
  short:  '4-6 concise bullet points (no preamble). Target ~120 words total.',
  medium: 'A structured summary: 1 short intro paragraph + 6-10 bullet points covering main ideas. ~300 words.',
  long:   'A detailed structured summary: brief intro, sectioned with bold-headed subtopics, then key takeaways. ~600 words.',
};
const LANG_NAME = {
  en: 'English',     zh: 'Simplified Chinese', es: 'Spanish',     ar: 'Arabic',
  pt: 'Portuguese',  id: 'Indonesian',         fr: 'French',      ja: 'Japanese',
  ru: 'Russian',     de: 'German',             ko: 'Korean',      tr: 'Turkish',
  it: 'Italian',     pl: 'Polish',             uk: 'Ukrainian',   nl: 'Dutch',
  ro: 'Romanian',    sv: 'Swedish',            cs: 'Czech',       el: 'Greek',
  hu: 'Hungarian',   da: 'Danish',             fi: 'Finnish',     no: 'Norwegian',
  bg: 'Bulgarian',   sk: 'Slovak',             sr: 'Serbian',     hr: 'Croatian',
  vi: 'Vietnamese',  fa: 'Persian',            he: 'Hebrew',      hi: 'Hindi',
  th: 'Thai',        bn: 'Bengali',            ms: 'Malay',
};
const KIND_LABEL_FOR_TPL = {
  youtube: 'YouTube video transcript', vimeo: 'Vimeo video transcript',
  twitch: 'Twitch VOD page', social: 'short-form social-media video',
  webpage: 'web article', pdf: 'PDF document',
};
import { generateStream, getApiKeys, pickProviderFromKey } from '../lib/ai-api.js';
import { getSession } from '../lib/supabase.js';
import { SUPABASE_URL, SUPABASE_ANON, RELEASE_MODE, HAS_SUPABASE, HAS_PRO } from '../lib/config.js';
import { saveResult as saveLocalHistory } from '../lib/history-store.js';
import { chunkText, mapWithConcurrency } from '../lib/chunker.js';
import { getTierStatus, bumpDayUsage, getDayUsage } from '../lib/tier.js';
import { FEATURES, canUse, isProModel, FREE_DAILY_POOL_LIMIT, FREE_MAX_VIDEO_SECONDS, PRO_MONTHLY_POOL_LIMIT } from '../lib/features.js';

const CHUNK_THRESHOLD = 45_000;   // chars; below this we go single-shot
const CHUNK_TARGET    = 25_000;   // chars per chunk for map-reduce
const CHUNK_CONCURRENCY = 3;      // parallel chunk requests

// ---------------------------------------------------------------------------
// Single completion (used for chunk-summaries and for the final reduce step)
// `streaming` controls whether we surface deltas to the caller.
// ---------------------------------------------------------------------------

async function complete({ prompt, source, modelKey, provider, keys, onDelta, allowFallback, attachments }) {
  // Pool route: go through our Edge Function. Attachments work there too.
  if (source === 'pool') {
    try {
      const text = await generateStream(prompt, modelKey, onDelta, { usePool: true, attachments });
      return { text, via: 'pool' };
    } catch (e) {
      // If pool is unavailable AND user has own key, fall back to direct API.
      if (allowFallback && pickKeyForProvider(provider, keys)) {
        const text = await generateStream(prompt, modelKey, onDelta, { attachments });
        return { text, via: 'api-fallback' };
      }
      throw e;
    }
  }

  // Attachments (PDF inline) need direct API access.
  if (attachments && attachments.length) {
    if (!pickKeyForProvider(provider, keys)) {
      const err = new Error('NO_API_KEY:' + provider);
      err.code = 'NO_API_KEY'; err.provider = provider; throw err;
    }
    const text = await generateStream(prompt, modelKey, onDelta, { attachments });
    return { text, via: 'api' };
  }

  if (!pickKeyForProvider(provider, keys)) {
    const err = new Error('NO_API_KEY:' + provider);
    err.code = 'NO_API_KEY'; err.provider = provider; throw err;
  }
  const text = await generateStream(prompt, modelKey, onDelta);
  return { text, via: 'api' };
}

function pickKeyForProvider(provider, keys) {
  if (provider === 'openai')    return keys.openai;
  if (provider === 'anthropic') return keys.anthropic;
  return keys.gemini;
}

// ---------------------------------------------------------------------------
// Map-reduce summary
// ---------------------------------------------------------------------------

async function summarizeLong({ plain, language, length, title, channel, modelKey, provider, source, keys, hooks }) {
  const chunks = chunkText(plain, { targetSize: CHUNK_TARGET });
  hooks.onChunks({ total: chunks.length, done: 0 });

  const notes = await mapWithConcurrency(chunks, CHUNK_CONCURRENCY, async (chunk, i) => {
    const prompt = buildChunkSummaryPrompt({ chunk, index: i + 1, total: chunks.length, title });
    // No streaming for chunk-level summaries — just full text.
    const { text } = await complete({
      prompt, source, modelKey, provider, keys,
      onDelta: null,
      allowFallback: true,
    });
    hooks.onChunkDone(i + 1, chunks.length);
    return text;
  });

  const sectionNotes = notes.map((n, i) => `# Section ${i + 1}\n${n}`).join('\n\n');
  hooks.onPhase('synthesis');

  const finalPrompt = buildFinalSummaryPrompt({ sectionNotes, language, length, title, channel });
  const { text, via } = await complete({
    prompt: finalPrompt, source, modelKey, provider, keys,
    onDelta: hooks.onDelta,   // stream the final synthesis
    allowFallback: true,
  });
  return { text, via, chunks: chunks.length };
}

async function timestampsLong({ stamped, language, title, modelKey, provider, source, keys, hooks }) {
  const chunks = chunkText(stamped, { targetSize: CHUNK_TARGET });
  hooks.onChunks({ total: chunks.length, done: 0 });

  const picks = await mapWithConcurrency(chunks, CHUNK_CONCURRENCY, async (chunk, i) => {
    const prompt = buildChunkTimestampsPrompt({ chunk, index: i + 1, total: chunks.length, title });
    const { text } = await complete({
      prompt, source, modelKey, provider, keys,
      onDelta: null,
      allowFallback: true,
    });
    hooks.onChunkDone(i + 1, chunks.length);
    return text;
  });

  const candidates = picks.filter(Boolean).join('\n');
  hooks.onPhase('synthesis');

  const finalPrompt = buildFinalTimestampsPrompt({ candidates, language, title });
  const { text, via } = await complete({
    prompt: finalPrompt, source, modelKey, provider, keys,
    onDelta: hooks.onDelta,
    allowFallback: true,
  });
  return { text, via, chunks: chunks.length };
}

// ---------------------------------------------------------------------------
// Top-level pipeline
// ---------------------------------------------------------------------------

async function runJobStream(payload, hooks) {
  const { kind, url, pdfName, pdfMode, language, length, modelKey, source, templateId } = payload;
  // The popup sends Uint8Array as Array.from(...) for postMessage compat — restore it here.
  const pdfBytes = payload.pdfBytes
    ? (payload.pdfBytes instanceof Uint8Array ? payload.pdfBytes : new Uint8Array(payload.pdfBytes))
    : null;
  const onPhase = hooks.onPhase || (() => {});
  const onDelta = hooks.onDelta || (() => {});
  const onMeta  = hooks.onMeta  || (() => {});

  // ── Tier pre-flight checks ──────────────────────────────────────────────
  // In free release mode there is no Pro — treat everyone as Pro so no gates fire.
  const tierStatus = HAS_PRO ? await getTierStatus() : { tier: 'pro', month_usage: 0 };
  const tier = HAS_PRO ? (tierStatus.tier || 'free') : 'pro';

  if (HAS_PRO && kind === 'timestamps' && !canUse(FEATURES.TIMESTAMPS, tier)) {
    const e = new Error('PRO_REQUIRED'); e.code = 'PRO_REQUIRED'; e.feature = FEATURES.TIMESTAMPS; throw e;
  }
  if (HAS_PRO && isProModel(modelKey) && tier !== 'pro') {
    const e = new Error('PRO_REQUIRED'); e.code = 'PRO_REQUIRED'; e.feature = FEATURES.PREMIUM_MODELS; throw e;
  }

  const keysEarly = await getApiKeys();
  const hasOwnKey = !!(keysEarly.gemini || keysEarly.openai || keysEarly.anthropic);
  if (tier === 'free' && !hasOwnKey && source !== 'browser') {
    const used = await getDayUsage();
    if (used >= FREE_DAILY_POOL_LIMIT) {
      const e = new Error('QUOTA_EXCEEDED'); e.code = 'QUOTA_EXCEEDED'; throw e;
    }
  }
  if (HAS_PRO && tier === 'pro' && (tierStatus.month_usage || 0) >= PRO_MONTHLY_POOL_LIMIT && !hasOwnKey && source !== 'browser') {
    const e = new Error('QUOTA_EXCEEDED'); e.code = 'QUOTA_EXCEEDED'; throw e;
  }

  // ── 1. Extract source content ──────────────────────────────────────────
  onPhase('extract');
  const sourceObj = await runExtract(
    { url, pdfBytes, pdfName },
    { pdfMode: pdfMode || 'gemini', preferLang: language === 'auto' ? null : language, pdfBytes },
  );

  // Long-video / long-document gate for Free (only enforced in full release mode)
  if (HAS_PRO && tier === 'free' && sourceObj.durationS && sourceObj.durationS > FREE_MAX_VIDEO_SECONDS) {
    const e = new Error('VIDEO_TOO_LONG'); e.code = 'VIDEO_TOO_LONG'; e.feature = FEATURES.LONG_VIDEOS; throw e;
  }

  // Timestamps only make sense for video sources that exposed real segments.
  if (kind === 'timestamps' && !sourceObj.timecoded) {
    const e = new Error('TIMESTAMPS_NOT_AVAILABLE'); e.code = 'TIMESTAMPS_NOT_AVAILABLE'; throw e;
  }

  // ── 2. Resolve provider / model ────────────────────────────────────────
  let resolvedModelKey = modelKey;
  if (sourceObj.requiresProvider === 'gemini') {
    // PDF-via-Gemini path: force a Gemini model so the attachment flows.
    if (modelKey === 'auto' || !MODELS_PROVIDER_MATCH(modelKey, 'gemini')) {
      resolvedModelKey = 'gemini';
    }
  }
  const keys = keysEarly;
  const chosen = pickProviderFromKey(resolvedModelKey, keys);
  onMeta({
    videoId:  sourceObj.videoId || null,
    sourceKind: sourceObj.kind,
    url:      sourceObj.url || url || null,
    model:    chosen.model,
    provider: chosen.provider,
    title:    sourceObj.title,
    channel:  sourceObj.author || sourceObj.site || '',
  });

  // ── 3. Build prompt ────────────────────────────────────────────────────
  const isVideoTranscript = !!sourceObj.timecoded;
  const transcriptBody = sourceObj.text || '';
  const isLong = transcriptBody.length > CHUNK_THRESHOLD;
  const title   = sourceObj.title || '';
  const channel = sourceObj.author || sourceObj.site || '';

  onPhase(isLong ? 'map' : 'generate');

  let via = 'api';
  let chunksUsed = 0;
  let text = '';

  // Attachment path: only PDFs sent natively to Gemini.
  if (sourceObj.attachments && sourceObj.attachments.length) {
    const prompt = buildAttachmentSummaryPrompt({
      source: sourceObj,
      language, length, title,
    });
    const r = await complete({
      prompt, source, modelKey: resolvedModelKey, provider: chosen.provider, keys,
      onDelta, allowFallback: false,             // attachments require direct API
      attachments: sourceObj.attachments,
    });
    text = r.text; via = r.via;
  }
  // Timestamps mode — only for video transcripts with segments.
  else if (kind === 'timestamps' && isVideoTranscript) {
    if (isLong) {
      const r = await timestampsLong({
        stamped: sourceObj.stamped || transcriptBody,
        language, title,
        modelKey: resolvedModelKey, provider: chosen.provider, source, keys,
        hooks: {
          onChunks:    (s) => hooks.onChunks && hooks.onChunks(s),
          onChunkDone: (done, total) => hooks.onChunks && hooks.onChunks({ done, total }),
          onPhase,
          onDelta,
        },
      });
      text = r.text; via = r.via; chunksUsed = r.chunks;
    } else {
      const prompt = buildTimestampsPrompt({
        transcript: sourceObj.stamped || transcriptBody, language, title,
      });
      const r = await complete({
        prompt, source, modelKey: resolvedModelKey, provider: chosen.provider, keys,
        onDelta, allowFallback: true,
      });
      text = r.text; via = r.via;
    }
  }
  // Summary mode (or any non-timestamp content).
  else {
    if (isLong) {
      const r = await summarizeLong({
        plain: transcriptBody, language, length, title, channel,
        modelKey: resolvedModelKey, provider: chosen.provider, source, keys,
        hooks: {
          onChunks:    (s) => hooks.onChunks && hooks.onChunks(s),
          onChunkDone: (done, total) => hooks.onChunks && hooks.onChunks({ done, total }),
          onPhase,
          onDelta,
        },
      });
      text = r.text; via = r.via; chunksUsed = r.chunks;
    } else {
      // Custom template path: if user picked a non-default template, apply it.
      let prompt;
      if (templateId && templateId !== 'standard') {
        const tpl = await getTemplate(templateId);
        // Custom templates (non-built-in) are Pro-only. Built-ins are free.
        const isCustom = tpl && !tpl.builtin;
        if (isCustom && tier !== 'pro') {
          const e = new Error('PRO_REQUIRED'); e.code = 'PRO_REQUIRED'; e.feature = 'customPrompts'; throw e;
        }
        prompt = applyTemplate(tpl, {
          lang:      language === 'auto' ? 'the original language of the source' : (LANG_NAME[language] || language),
          length:    LENGTH_DESCR[length] || LENGTH_DESCR.medium,
          title:     title || '(unknown)',
          channel:   channel || '(unknown)',
          kindLabel: KIND_LABEL_FOR_TPL[sourceObj.kind] || 'document',
          content:   transcriptBody,
        });
      } else {
        prompt = buildSourceSummaryPrompt({
          source: sourceObj, text: transcriptBody,
          language, length, title, channel,
          site: sourceObj.site || '',
        });
      }
      const r = await complete({
        prompt, source, modelKey: resolvedModelKey, provider: chosen.provider, keys,
        onDelta, allowFallback: true,
      });
      text = r.text; via = r.via;
    }
  }

  if (tier === 'free' && !hasOwnKey && source !== 'browser') {
    try { await bumpDayUsage(); } catch (_) {}
  }

  return {
    videoId:     sourceObj.videoId || null,
    url:         sourceObj.url || url || null,
    kind,
    sourceKind:  sourceObj.kind,
    language,
    length,
    model:       chosen.model,
    provider:    chosen.provider,
    via,
    chunksUsed,
    text,
    tier,
    // Internal: stashed for the chat-context store. Not sent to popup.
    _sourceText: transcriptBody,
    meta: {
      title, channel,
      lengthS:     sourceObj.durationS || 0,
      captionLang: sourceObj.language || null,
      autoCaption: !!sourceObj.isAuto,
    },
  };
}

// Helper: check if `modelKey` belongs to a given provider family.
function MODELS_PROVIDER_MATCH(modelKey, provider) {
  if (modelKey === provider) return true;
  if (provider === 'gemini' && (modelKey === 'gemini' || modelKey === 'geminiPro')) return true;
  if (provider === 'openai' && (modelKey === 'gpt'    || modelKey === 'gptPro'))    return true;
  if (provider === 'anthropic' && (modelKey === 'claude' || modelKey === 'claudePro')) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Save to Supabase history (best-effort)
// ---------------------------------------------------------------------------

async function saveToHistory(result) {
  // Always save locally — works offline, no auth, no Supabase needed.
  try { await saveLocalHistory(result); } catch (_) { /* ignore */ }

  // Then also push to Supabase if everything is configured + user is signed in.
  if (RELEASE_MODE !== 'full' || !HAS_SUPABASE) return;
  try {
    const s = await getSession();
    if (!s || !s.access_token) return;
    await fetch(SUPABASE_URL + '/rest/v1/summaries', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':         SUPABASE_ANON,
        'Authorization':  'Bearer ' + s.access_token,
        'Prefer':         'return=minimal',
      },
      body: JSON.stringify({
        user_id:       s.user && s.user.id,
        video_id:      result.videoId,
        video_title:   result.meta && result.meta.title,
        video_channel: result.meta && result.meta.channel,
        language:      result.language,
        length:        result.length,
        model:         result.model,
        summary_md:    result.kind === 'summary'    ? result.text : null,
        timestamps_md: result.kind === 'timestamps' ? result.text : null,
      }),
    });
  } catch (e) {
    console.warn('[AIS] history save failed:', e);
  }
}

// ---------------------------------------------------------------------------
// Streaming port
// ---------------------------------------------------------------------------

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'ais-stream') return;

  let aborted = false;
  port.onDisconnect.addListener(() => { aborted = true; });

  port.onMessage.addListener(async (msg) => {
    if (!msg) return;

    // ── Summary / timestamps job ──────────────────────────────────────────
    if (msg.type === 'AIS_RUN') {
      try {
        const result = await runJobStream(msg.payload || {}, {
          onPhase:  (phase)  => { if (!aborted) safePost(port, { type: 'AIS_PHASE', phase }); },
          onMeta:   (meta)   => { if (!aborted) safePost(port, { type: 'AIS_META',  meta  }); },
          onDelta:  (chunk)  => { if (!aborted) safePost(port, { type: 'AIS_DELTA', text: chunk }); },
          onChunks: (status) => { if (!aborted) safePost(port, { type: 'AIS_CHUNKS', ...status }); },
        });
        if (aborted) return;
        // Cache for Q&A first (uses the private _sourceText), then strip it
        // before sending the result back to the popup.
        await persistChatContext(msg.payload, result);
        const clean = { ...result };
        delete clean._sourceText;
        safePost(port, { type: 'AIS_DONE', result: clean });
        saveToHistory(clean);
      } catch (e) {
        console.error('[AIS] run failed:', e);
        if (!aborted) safePost(port, {
          type: 'AIS_ERR',
          error: e.message,
          code: e.code,
          provider: e.provider,
        });
      } finally {
        try { port.disconnect(); } catch (_) {}
      }
      return;
    }

    // ── Q&A follow-up chat ────────────────────────────────────────────────
    if (msg.type === 'AIS_CHAT') {
      try {
        const ctx = await getContext(msg.sourceKey);
        if (!ctx) {
          safePost(port, { type: 'AIS_ERR', error: 'NO_CONTEXT', code: 'NO_CONTEXT' });
          try { port.disconnect(); } catch (_) {}
          return;
        }

        // In free release mode there is no Pro tier — treat everyone as Pro and
        // skip the Supabase tier lookup entirely (placeholder creds would fail).
        const tier = HAS_PRO ? ((await getTierStatus()).tier || 'free') : 'pro';
        if (HAS_PRO && isProModel(msg.modelKey) && tier !== 'pro') {
          safePost(port, { type: 'AIS_ERR', error: 'PRO_REQUIRED', code: 'PRO_REQUIRED', feature: FEATURES.PREMIUM_MODELS });
          try { port.disconnect(); } catch (_) {}
          return;
        }

        const systemPrompt = buildChatSystemPrompt({
          source:      { kind: msg.sourceKind || 'webpage' },
          title:       ctx.title,
          content:     ctx.content,
          contentMode: ctx.contentMode,
          summary:     ctx.summary,
          language:    msg.language || 'auto',
        });
        const prompt = buildChatTurnPrompt({
          systemPrompt,
          history:  ctx.messages || [],
          question: msg.question,
        });

        const keys = await getApiKeys();
        const chosen = pickProviderFromKey(msg.modelKey, keys);

        safePost(port, { type: 'AIS_CHAT_START' });
        let acc = '';
        const text = await (async () => {
          const r = await complete({
            prompt,
            source:    msg.source || 'api',
            modelKey:  msg.modelKey,
            provider:  chosen.provider,
            keys,
            onDelta: (chunk) => {
              if (aborted) return;
              acc += chunk;
              safePost(port, { type: 'AIS_CHAT_DELTA', text: chunk });
            },
            allowFallback: true,
          });
          return r.text;
        })();

        // Persist both user question and assistant reply in the conversation.
        await appendMessage(msg.sourceKey, { role: 'user', text: msg.question });
        await appendMessage(msg.sourceKey, { role: 'assistant', text });

        safePost(port, { type: 'AIS_CHAT_DONE', text });
      } catch (e) {
        console.error('[AIS] chat failed:', e);
        if (!aborted) safePost(port, {
          type: 'AIS_ERR',
          error: e.message,
          code: e.code,
          provider: e.provider,
        });
      } finally {
        try { port.disconnect(); } catch (_) {}
      }
      return;
    }
  });
});

// Helper used by AIS_RUN to cache source content for the chat that follows.
async function persistChatContext(payload, result) {
  try {
    const sourceKey = sourceKeyFromResult(result);
    if (!sourceKey) return;
    // Re-extract just enough content to keep around. Cheaper path: stash the
    // summary always, and the original content if it's small enough.
    // We don't re-fetch here — the popup's run() already had the content; we
    // store what we got. For PDFs sent as attachments, we only keep the title.
    let content = '';
    if (payload && payload.pdfBytes) content = ''; // no text path
    // The run pipeline already produced `result.text` as the summary.
    await saveContext({
      sourceKey,
      title:   (result.meta && result.meta.title) || '',
      content: result._sourceText || '',  // see below
      summary: result.text,
    });
  } catch (_) { /* best effort */ }
}

function safePost(port, msg) {
  try { port.postMessage(msg); } catch (_) {}
}

// ---------------------------------------------------------------------------
// One-off messages
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'AIS_OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  // Suggest a few content-specific starter questions for the Q&A chat.
  if (msg.type === 'AIS_SUGGEST') {
    (async () => {
      try {
        const ctx = await getContext(msg.sourceKey);
        if (!ctx) { sendResponse({ ok: false }); return; }
        const keys = await getApiKeys();
        const chosen = pickProviderFromKey(msg.modelKey, keys);
        const prompt = buildSuggestQuestionsPrompt({
          title:    ctx.title,
          content:  ctx.content,
          summary:  ctx.summary,
          language: msg.language || 'auto',
        });
        // Background suggestion uses the API/pool path (no key → no suggestions).
        const suggestSource = msg.source || 'api';
        const { text } = await complete({
          prompt, source: suggestSource, modelKey: msg.modelKey,
          provider: chosen.provider, keys, onDelta: null, allowFallback: true,
        });
        const questions = String(text || '')
          .split('\n')
          .map((l) => l.replace(/^\s*[\d.)\-*•]+\s*/, '').replace(/^["'“]+|["'”]+$/g, '').trim())
          .filter((l) => l.length > 3 && l.length < 140)
          .slice(0, 5);
        sendResponse({ ok: true, questions });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

});

// Clicking the toolbar icon opens the summarizer in Chrome's docked side panel
// (instead of a small popup). The side panel works everywhere — web pages,
// PDFs, and video sites — and stays open beside the content.
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  // ?panel=1 lets popup.js stretch the UI to fill the docked panel.
  if (chrome.sidePanel.setOptions) {
    chrome.sidePanel.setOptions({ path: 'popup/popup.html?panel=1', enabled: true }).catch(() => {});
  }
}

// When the extension is reloaded/updated, content scripts already running in
// open tabs become orphaned ("Extension context invalidated"). Re-inject fresh
// copies into open YouTube tabs so the transcript bridge works without the user
// having to manually refresh the page.
async function reinjectYouTubeTabs() {
  if (!chrome.scripting || !chrome.scripting.executeScript) return;
  try {
    const tabs = await chrome.tabs.query({ url: ['*://*.youtube.com/*'] });
    for (const tab of tabs) {
      chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['content/yt-main.js'] }).catch(() => {});
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/i18n.js', 'content/page.js'] }).catch(() => {});
    }
  } catch (_) { /* ignore */ }
}

chrome.runtime.onInstalled.addListener(async (details) => {
  reinjectYouTubeTabs();
  if (details.reason === 'install') {
    // First-run: open the onboarding wizard.
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
  } else if (details.reason === 'update') {
    // If a previously-installed user has never been onboarded, give them a
    // soft nudge by opening onboarding once.
    const { ais_onboarded } = await chrome.storage.local.get('ais_onboarded');
    if (!ais_onboarded) {
      chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/onboarding.html') });
    }
  }
});
