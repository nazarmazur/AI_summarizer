// Vimeo extractor. Vimeo exposes a per-video `config` JSON at
// https://player.vimeo.com/video/<id>/config which lists `text_tracks`.
// Each text track has a `url` returning WebVTT.
//
// Falls back to the public player page meta if `text_tracks` is missing.

const ID_RE = /vimeo\.com\/(?:video\/)?(\d+)/;

export function extractVideoId(url) {
  const m = String(url || '').match(ID_RE);
  return m ? m[1] : null;
}

async function fetchConfig(videoId) {
  const url = `https://player.vimeo.com/video/${videoId}/config`;
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error('Vimeo config HTTP ' + r.status);
  return await r.json();
}

function pickTrack(tracks, preferLang) {
  if (!tracks || !tracks.length) return null;
  if (preferLang && preferLang !== 'auto') {
    const exact = tracks.find((t) => (t.lang || '').toLowerCase().startsWith(preferLang.toLowerCase()));
    if (exact) return exact;
  }
  // Prefer non-auto first
  const manual = tracks.find((t) => t.kind !== 'auto-generated');
  return manual || tracks[0];
}

// VTT → segments
function parseVtt(vtt) {
  const lines = String(vtt || '').replace(/\r\n/g, '\n').split('\n');
  const segments = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(/^(\d{1,2}:)?(\d{1,2}):(\d{2})\.(\d{3})\s+-->\s+(\d{1,2}:)?(\d{1,2}):(\d{2})\.(\d{3})/);
    if (m) {
      const startH = m[1] ? parseInt(m[1], 10) : 0;
      const startM = parseInt(m[2], 10);
      const startS = parseInt(m[3], 10);
      const startMs = parseInt(m[4], 10);
      const endH = m[5] ? parseInt(m[5], 10) : 0;
      const endM = parseInt(m[6], 10);
      const endS = parseInt(m[7], 10);
      const endMs = parseInt(m[8], 10);
      const start = startH * 3600 + startM * 60 + startS + startMs / 1000;
      const end   = endH * 3600 + endM * 60 + endS + endMs / 1000;
      cur = { start, dur: Math.max(0, end - start), text: '' };
      segments.push(cur);
    } else if (cur && line && !/^WEBVTT/i.test(line) && !/^NOTE/i.test(line)) {
      cur.text += (cur.text ? ' ' : '') + line.replace(/<[^>]+>/g, '');
    } else if (!line) {
      cur = null;
    }
  }
  return segments.filter((s) => s.text);
}

export async function extract(url, options) {
  options = options || {};
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error('Invalid Vimeo URL');

  const config = await fetchConfig(videoId);
  const tracks = (config && config.request && config.request.text_tracks) || [];
  const title  = (config && config.video && config.video.title)  || '';
  const author = (config && config.video && config.video.owner && config.video.owner.name) || '';
  const duration = (config && config.video && config.video.duration) || 0;

  if (!tracks.length) {
    const err = new Error('no-captions');
    err.code  = 'NO_CAPTIONS';
    throw err;
  }

  const track = pickTrack(tracks, options.preferLang);
  // track.url is relative (e.g. /texttrack/123.vtt) — resolve against Vimeo
  const trackUrl = new URL(track.url, 'https://player.vimeo.com/').toString();
  const r = await fetch(trackUrl);
  if (!r.ok) throw new Error('Vimeo VTT HTTP ' + r.status);
  const vtt = await r.text();
  const segments = parseVtt(vtt);
  if (!segments.length) {
    const err = new Error('empty-transcript');
    err.code  = 'EMPTY';
    throw err;
  }

  const text    = segments.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();
  const stamped = segments.map((s) => `[${fmtTime(s.start)}] ${s.text}`).join('\n');

  return {
    kind:      'vimeo',
    url,
    videoId,
    title,
    author,
    durationS: duration,
    language:  track.lang || null,
    isAuto:    track.kind === 'auto-generated',
    segments,
    text,
    stamped,
    timecoded: true,
  };
}

function fmtTime(s) {
  const sec = Math.floor(s);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  const mm = String(m).padStart(2, '0');
  const xs = String(ss).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${xs}` : `${mm}:${xs}`;
}
