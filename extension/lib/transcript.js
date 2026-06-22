// Extract YouTube transcripts.
//
// Strategy:
//   1. Pull the watch page HTML (or use the open YouTube tab's DOM).
//   2. Find the ytInitialPlayerResponse JSON inside the page.
//   3. Read captionTracks[] and request the timedtext XML.
//   4. Parse XML → array of { start, dur, text }.
//   5. Prefer manual captions over auto-generated, and prefer the user's
//      requested language if available; otherwise fall back to any track
//      and translate via &tlang=.

const VIDEO_ID_RE = /(?:v=|\/shorts\/|\/embed\/|youtu\.be\/)([0-9A-Za-z_-]{11})/;

export function extractVideoId(url) {
  if (!url) return null;
  const m = String(url).match(VIDEO_ID_RE);
  return m ? m[1] : null;
}

async function fetchWatchPage(videoId) {
  // Use the embedded watch URL — fewer experiments, simpler HTML.
  const url = `https://www.youtube.com/watch?v=${videoId}&hl=en&persist_hl=1`;
  const r = await fetch(url, {
    credentials: 'include',
    headers: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  if (!r.ok) throw new Error('Failed to load YouTube page: HTTP ' + r.status);
  return await r.text();
}

// Walk a balanced { ... } object starting at the opening brace. Far more
// reliable than a non-greedy regex, which truncates large/nested JSON.
function sliceBalancedObject(str, startIdx) {
  let depth = 0, inStr = false, esc = false;
  for (let i = startIdx; i < str.length; i++) {
    const c = str[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { if (--depth === 0) return str.slice(startIdx, i + 1); }
  }
  return null;
}

function extractPlayerResponse(html) {
  let idx = html.indexOf('ytInitialPlayerResponse');
  while (idx !== -1) {
    const brace = html.indexOf('{', idx);
    if (brace !== -1) {
      const json = sliceBalancedObject(html, brace);
      if (json) { try { return JSON.parse(json); } catch (_) { /* try next */ } }
    }
    idx = html.indexOf('ytInitialPlayerResponse', idx + 23);
  }
  throw new Error('ytInitialPlayerResponse not found in page');
}

function getCaptionTracks(pr) {
  return pr
    && pr.captions
    && pr.captions.playerCaptionsTracklistRenderer
    && pr.captions.playerCaptionsTracklistRenderer.captionTracks;
}

function extractInnertubeKey(html) {
  const m = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  // Public web key embedded in every youtube.com page; stable fallback.
  return m ? m[1] : 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
}

function extractClientVersion(html) {
  const m = html.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/)
        || html.match(/"clientVersion":"([\d.]+)"/);
  return m ? m[1] : '2.20240101';
}

// Captions are frequently absent from the server-rendered HTML (especially
// auto-generated/ASR tracks). The InnerTube `player` endpoint — the same one the
// real YouTube player calls — returns the caption track list reliably.
async function fetchPlayerViaInnertube(videoId, html) {
  const key = extractInnertubeKey(html);
  const clientVersion = extractClientVersion(html);
  const r = await fetch('https://www.youtube.com/youtubei/v1/player?key=' + encodeURIComponent(key), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      videoId,
      context: { client: { clientName: 'WEB', clientVersion, hl: 'en' } },
    }),
  });
  if (!r.ok) throw new Error('InnerTube player HTTP ' + r.status);
  return await r.json();
}

function pickCaptionTrack(tracks, preferLang) {
  if (!tracks || !tracks.length) return null;

  const manual = tracks.filter((t) => t.kind !== 'asr');
  const asr    = tracks.filter((t) => t.kind === 'asr');

  // 1. manual in preferred lang
  if (preferLang && preferLang !== 'auto') {
    const m1 = manual.find((t) => t.languageCode && t.languageCode.toLowerCase().startsWith(preferLang.toLowerCase()));
    if (m1) return { track: m1, needsTranslation: false };
    const m2 = asr.find((t) => t.languageCode && t.languageCode.toLowerCase().startsWith(preferLang.toLowerCase()));
    if (m2) return { track: m2, needsTranslation: false };
  }
  // 2. any manual track (will translate to preferLang later via &tlang=)
  if (manual.length) return { track: manual[0], needsTranslation: !!preferLang && preferLang !== 'auto' };
  // 3. any ASR
  if (asr.length)    return { track: asr[0],    needsTranslation: !!preferLang && preferLang !== 'auto' };
  return null;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function parseTimedTextXml(xml) {
  // Regex parse — DOMParser isn't available in service workers.
  const re = /<text[^>]*start="([\d.]+)"[^>]*(?:dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g;
  const out = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    const start = parseFloat(m[1]);
    const dur   = parseFloat(m[2] || '0');
    let text    = m[3] || '';
    text = text.replace(/<[^>]+>/g, '').replace(/\n+/g, ' ').trim();
    text = decodeEntities(text);
    if (text) out.push({ start, dur, text });
  }
  return out;
}

export function formatTimestamp(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function transcriptToPlainText(segments) {
  return segments.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();
}

export function transcriptWithTimestamps(segments, stepSec) {
  stepSec = stepSec || 30;
  const out = [];
  let bucketStart = null;
  let bucketText  = [];
  for (const seg of segments) {
    if (bucketStart === null) bucketStart = seg.start;
    bucketText.push(seg.text);
    if (seg.start - bucketStart >= stepSec) {
      out.push(`[${formatTimestamp(bucketStart)}] ${bucketText.join(' ')}`);
      bucketStart = null;
      bucketText  = [];
    }
  }
  if (bucketText.length) out.push(`[${formatTimestamp(bucketStart || 0)}] ${bucketText.join(' ')}`);
  return out.join('\n');
}

export async function fetchTranscript(videoId, preferLang) {
  if (!videoId) throw new Error('No videoId');
  const html = await fetchWatchPage(videoId);
  let pr     = extractPlayerResponse(html);
  let tracks = getCaptionTracks(pr);

  // Captions are often missing from the server HTML (auto-generated ones in
  // particular). Fall back to the InnerTube player API, which lists them.
  if (!tracks || !tracks.length) {
    try {
      const pr2 = await fetchPlayerViaInnertube(videoId, html);
      const t2  = getCaptionTracks(pr2);
      if (t2 && t2.length) { pr = pr2; tracks = t2; }
    } catch (_) { /* fall through to NO_CAPTIONS below */ }
  }

  const meta = {
    title:   (pr.videoDetails && pr.videoDetails.title)   || '',
    author:  (pr.videoDetails && pr.videoDetails.author)  || '',
    lengthS: parseInt((pr.videoDetails && pr.videoDetails.lengthSeconds) || '0', 10),
  };

  if (!tracks || !tracks.length) {
    const err = new Error('no-captions');
    err.code  = 'NO_CAPTIONS';
    err.meta  = meta;
    throw err;
  }

  const picked = pickCaptionTrack(tracks, preferLang);
  if (!picked) {
    const err = new Error('no-captions');
    err.code  = 'NO_CAPTIONS';
    err.meta  = meta;
    throw err;
  }

  let url = picked.track.baseUrl;
  if (picked.needsTranslation) {
    url += (url.includes('?') ? '&' : '?') + 'tlang=' + encodeURIComponent(preferLang);
  }
  // Force the simple XML format (default is XML; some experiments return JSON3).
  url = url.replace(/(&|\?)fmt=[^&]*/g, '');

  const tr = await fetch(url, { credentials: 'include' });
  if (!tr.ok) throw new Error('Failed to fetch captions: HTTP ' + tr.status);
  const xml = await tr.text();

  const segments = parseTimedTextXml(xml);
  if (!segments.length) {
    const err = new Error('empty-transcript');
    err.code  = 'EMPTY';
    err.meta  = meta;
    throw err;
  }

  return {
    videoId,
    language: picked.track.languageCode,
    isAuto:   picked.track.kind === 'asr',
    segments,
    meta,
  };
}
