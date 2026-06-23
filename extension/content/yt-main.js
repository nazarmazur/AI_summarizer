// MAIN-world helper injected on YouTube watch/shorts pages.
//
// Why this exists: fetching YouTube caption ("timedtext") URLs from the
// extension's background service worker gets HTTP 429 (rate-limited) and often
// an empty body, because the SW request lacks the user's logged-in session.
// Running in the page's MAIN world, this script:
//   1. reads the caption track list straight from the live player, and
//   2. fetches the timedtext with the page's own session (credentials:'include')
// — exactly like the real player does, so YouTube serves it normally (no 429).
//
// MAIN world has no chrome.* APIs, so it talks to the isolated content script
// (content/page.js) over window.postMessage. page.js relays to the SW.

(function () {
  'use strict';

  // ── Caption capture ──────────────────────────────────────────────────────
  // YouTube no longer serves caption ("timedtext") URLs to plain scripts — the
  // baseUrl returns an empty 200 without a POT / proof-of-origin token that only
  // the player's BotGuard can mint. So instead of fetching captions ourselves,
  // we intercept the PLAYER's own timedtext request (which carries a valid POT)
  // and keep its response. We install the hooks at document_start so we catch
  // every caption fetch the player makes.
  const __caps = []; // { lang, tlang, body }
  function recordCap(url, body) {
    if (!body || body.length < 20) return;
    let lang = '', tlang = '';
    try { const u = new URL(url, location.origin); lang = u.searchParams.get('lang') || ''; tlang = u.searchParams.get('tlang') || ''; } catch (_) { /* ignore */ }
    __caps.push({ lang, tlang, body });
    if (__caps.length > 8) __caps.shift();
  }
  try {
    const of = window.fetch;
    window.fetch = function (u) {
      const url = (typeof u === 'string') ? u : (u && u.url) || '';
      const p = of.apply(this, arguments);
      if (url.indexOf('/api/timedtext') >= 0) {
        p.then((r) => r.clone().text()).then((t) => recordCap(url, t)).catch(() => {});
      }
      return p;
    };
    const oo = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, url) { this.__aisU = url; return oo.apply(this, arguments); };
    const os = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
      const x = this;
      if (x.__aisU && String(x.__aisU).indexOf('/api/timedtext') >= 0) {
        x.addEventListener('load', () => { try { recordCap(String(x.__aisU), x.responseText || ''); } catch (_) { /* ignore */ } });
      }
      return os.apply(this, arguments);
    };
  } catch (_) { /* ignore */ }

  function findCap(lang, tlang) {
    for (let i = __caps.length - 1; i >= 0; i--) {
      const c = __caps[i];
      if (tlang) { if (c.tlang === tlang) return c.body; }
      else if (!c.tlang && (!lang || c.lang === lang)) return c.body;
    }
    return null;
  }
  function waitForCap(lang, tlang, beforeLen, timeoutMs) {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeoutMs;
      (function poll() {
        const c = findCap(lang, tlang);
        if (c) return resolve(c);
        if (__caps.length > beforeLen) return resolve(__caps[__caps.length - 1].body);
        if (Date.now() > deadline) return resolve(null);
        setTimeout(poll, 200);
      })();
    });
  }

  // Trigger the player to load a caption track, then capture its response.
  async function captureViaPlayer(picked, preferLang) {
    const p = document.getElementById('movie_player');
    if (!p || typeof p.setOption !== 'function') return null;
    const wantLang = picked.track.languageCode || '';
    const wantTlang = picked.needsTranslation ? (preferLang || '') : '';
    const existing = findCap(wantLang, wantTlang);
    if (existing) return existing;
    let prev = null;
    try { prev = p.getOption && p.getOption('captions', 'track'); } catch (_) { /* ignore */ }
    const beforeLen = __caps.length;
    try { if (p.loadModule) p.loadModule('captions'); } catch (_) { /* ignore */ }
    const opt = { languageCode: wantLang };
    if (picked.needsTranslation) opt.translationLanguage = { languageCode: preferLang };
    try { p.setOption('captions', 'track', opt); } catch (_) { return null; }
    const body = await waitForCap(wantLang, wantTlang, beforeLen, 9000);
    // Restore the user's previous caption state (usually off).
    try { p.setOption('captions', 'track', prev || {}); if (p.hideSubtitles) p.hideSubtitles(); } catch (_) { /* ignore */ }
    return body;
  }

  window.addEventListener('message', async (e) => {
    const d = e.data;
    if (!d || d.source !== 'ais-iso') return;
    // Seek the live player in place (timestamp click from the embedded panel).
    if (d.type === 'YT_SEEK') {
      try {
        const p = document.getElementById('movie_player');
        if (p && typeof p.seekTo === 'function') {
          p.seekTo(d.seconds, true);
          if (typeof p.playVideo === 'function') p.playVideo();
        }
      } catch (_) { /* ignore */ }
      return;
    }
    if (d.type !== 'YT_REQ') return;
    const reqId = d.reqId;
    try {
      const data = await getTranscript(d.preferLang);
      window.postMessage({ source: 'ais-main', reqId, ok: true, data }, '*');
    } catch (err) {
      window.postMessage({
        source: 'ais-main', reqId, ok: false,
        code: (err && err.code) || 'ERR',
        meta: (err && err.meta) || {},
        error: String((err && err.message) || err),
      }, '*');
    }
  });

  // Current player response — getPlayerResponse() is updated on SPA navigation,
  // unlike the page-load-time window.ytInitialPlayerResponse.
  function getPR() {
    try {
      const mp = document.getElementById('movie_player');
      if (mp && typeof mp.getPlayerResponse === 'function') {
        const pr = mp.getPlayerResponse();
        if (pr) return pr;
      }
    } catch (_) { /* ignore */ }
    return window.ytInitialPlayerResponse || null;
  }

  function tracksOf(pr) {
    return pr
      && pr.captions
      && pr.captions.playerCaptionsTracklistRenderer
      && pr.captions.playerCaptionsTracklistRenderer.captionTracks;
  }

  function currentVideoId() {
    try {
      const u = new URL(location.href);
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/\/shorts\/([0-9A-Za-z_-]{11})/);
      if (m) return m[1];
    } catch (_) { /* ignore */ }
    return null;
  }

  // Same-origin InnerTube player call from the page session — playable (unlike
  // a background-SW call) because it carries the page's cookies/headers.
  async function tracksViaInnertube() {
    try {
      const vid = currentVideoId();
      const key = window.ytcfg && window.ytcfg.get && window.ytcfg.get('INNERTUBE_API_KEY');
      const ver = window.ytcfg && window.ytcfg.get && window.ytcfg.get('INNERTUBE_CONTEXT_CLIENT_VERSION');
      if (!vid || !key) return { tracks: null, pr: null };
      const r = await fetch('/youtubei/v1/player?key=' + encodeURIComponent(key), {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: vid, context: { client: { clientName: 'WEB', clientVersion: ver || '2.20240101', hl: 'en' } } }),
      });
      const j = await r.json();
      return { tracks: tracksOf(j), pr: j, status: (j.playabilityStatus && j.playabilityStatus.status) || ('http' + r.status) };
    } catch (e) {
      return { tracks: null, pr: null, status: 'err' };
    }
  }

  function pickTrack(tracks, preferLang) {
    const manual = tracks.filter((t) => t.kind !== 'asr');
    const asr    = tracks.filter((t) => t.kind === 'asr');
    if (preferLang && preferLang !== 'auto') {
      const want = preferLang.toLowerCase();
      const m = manual.find((t) => (t.languageCode || '').toLowerCase().startsWith(want))
             || asr.find((t) => (t.languageCode || '').toLowerCase().startsWith(want));
      if (m) return { track: m, needsTranslation: false };
    }
    if (manual.length) return { track: manual[0], needsTranslation: !!preferLang && preferLang !== 'auto' };
    if (asr.length)    return { track: asr[0],    needsTranslation: !!preferLang && preferLang !== 'auto' };
    return null;
  }

  function err(code, meta) { const e = new Error(code); e.code = code; e.meta = meta || {}; return e; }

  async function getTranscript(preferLang) {
    let pr = null, tracks = null;
    // Source 1: the live player (updated on SPA navigation).
    try {
      const mp = document.getElementById('movie_player');
      if (mp && typeof mp.getPlayerResponse === 'function') {
        const p = mp.getPlayerResponse();
        const t = tracksOf(p);
        if (t && t.length) { pr = p; tracks = t; }
      }
    } catch (_) { /* ignore */ }
    // Source 2: page-load player response.
    if (!tracks || !tracks.length) {
      const t = tracksOf(window.ytInitialPlayerResponse);
      if (t && t.length) { pr = window.ytInitialPlayerResponse; tracks = t; }
    }
    // Source 3: page-context InnerTube player call (real session).
    if (!tracks || !tracks.length) {
      const it = await tracksViaInnertube();
      if (it.tracks && it.tracks.length) { pr = it.pr; tracks = it.tracks; }
    }
    if (!pr) pr = getPR();

    const vd = (pr && pr.videoDetails) || {};
    const meta = { title: vd.title || '', author: vd.author || '', lengthS: parseInt(vd.lengthSeconds || '0', 10) };
    if (!tracks || !tracks.length) throw err('NO_CAPTIONS', meta);

    const picked = pickTrack(tracks, preferLang);
    if (!picked || !picked.track.baseUrl) throw err('NO_CAPTIONS', meta);

    // Method A — fetch the baseUrl directly (fast; works where not POT-walled).
    let segments = await fetchSegments(String(picked.track.baseUrl), preferLang, picked.needsTranslation);
    // Method B — POT wall: the direct fetch came back empty. Let the player
    // load the track with its own proof-of-origin token and capture the body.
    if (!segments.length) {
      const body = await captureViaPlayer(picked, preferLang);
      if (body) segments = body.trim().charAt(0) === '{' ? parseJson3(body) : parseXml(body);
    }
    if (!segments.length) throw err('CAPTIONS_BLOCKED', meta);

    return { language: picked.track.languageCode, isAuto: picked.track.kind === 'asr', segments, meta };
  }

  // Fetch the caption track and parse it, trying json3 first then the default
  // XML — whichever returns text. Robust against empty/format-shifted bodies.
  async function fetchSegments(baseUrl, preferLang, needsTranslation) {
    const tlang = needsTranslation ? '&tlang=' + encodeURIComponent(preferLang) : '';
    const clean = baseUrl.replace(/([&?])fmt=[^&]*/g, '$1').replace(/[?&]$/, '');
    const urls = [
      clean + (clean.includes('?') ? '&' : '?') + 'fmt=json3' + tlang,
      clean + tlang,
    ];
    for (const url of urls) {
      try {
        const r = await fetch(url, { credentials: 'include' });
        if (!r.ok) continue;
        const body = await r.text();
        if (!body) continue;
        const segs = body.trim().charAt(0) === '{' ? parseJson3(body) : parseXml(body);
        if (segs.length) return segs;
      } catch (_) { /* try next */ }
    }
    return [];
  }

  function parseJson3(body) {
    const out = [];
    try {
      const j = JSON.parse(body);
      for (const ev of (j.events || [])) {
        if (!ev.segs) continue;
        const text = ev.segs.map((s) => s.utf8 || '').join('').replace(/\s+/g, ' ').trim();
        if (text) out.push({ start: (ev.tStartMs || 0) / 1000, dur: (ev.dDurationMs || 0) / 1000, text });
      }
    } catch (_) { /* ignore */ }
    return out;
  }

  function parseXml(body) {
    const out = [];
    try {
      const doc = new DOMParser().parseFromString(body, 'text/xml');
      doc.querySelectorAll('text, p').forEach((n) => {
        const text = (n.textContent || '').replace(/\s+/g, ' ').trim();
        if (text) out.push({ start: parseFloat(n.getAttribute('start') || n.getAttribute('t') || '0') || 0, dur: parseFloat(n.getAttribute('dur') || n.getAttribute('d') || '0') || 0, text });
      });
    } catch (_) { /* ignore */ }
    return out;
  }
})();
