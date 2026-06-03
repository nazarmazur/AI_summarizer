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

function extractPlayerResponse(html) {
  // Try the modern location first.
  let m = html.match(/var ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var|<\/script>)/s);
  if (!m) m = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;/s);
  if (!m) throw new Error('ytInitialPlayerResponse not found in page');
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    throw new Error('Failed to parse player response JSON: ' + e.message);
  }
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
  const pr   = extractPlayerResponse(html);

  const tracks = pr.captions
    && pr.captions.playerCaptionsTracklistRenderer
    && pr.captions.playerCaptionsTracklistRenderer.captionTracks;

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
