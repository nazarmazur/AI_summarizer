// YouTube extractor. Re-exports the legacy transcript helpers and wraps the
// returned object into the common extractor shape used across all sources.
import {
  fetchTranscript,
  extractVideoId,
  transcriptToPlainText,
  transcriptWithTimestamps,
  formatTimestamp,
} from '../transcript.js';

export { extractVideoId, transcriptToPlainText, transcriptWithTimestamps, formatTimestamp };

// Ask the content script on the open YouTube tab to fetch the transcript with
// the page's own session (avoids the HTTP 429 a background fetch hits). Returns
// transcript data on success, { noCaptions, meta } if the page authoritatively
// found none, or null if no reachable tab (caller falls back to the SW fetch).
async function getTranscriptFromTab(videoId, preferLang) {
  try {
    if (!chrome.tabs || !chrome.tabs.sendMessage) return null;
    const tabs = await chrome.tabs.query({ url: ['*://*.youtube.com/watch*', '*://*.youtube.com/shorts/*'] });
    let tab = tabs.find((t) => t.url && t.url.includes(videoId));
    if (!tab) tab = tabs.find((t) => t.active) || tabs[0];
    if (!tab) return null;
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'AIS_GET_TRANSCRIPT', videoId, preferLang });
    if (!res) return null;
    if (res.ok && res.data && res.data.segments && res.data.segments.length) return res.data;
    if (res.code === 'NO_CAPTIONS')      return { noCaptions: true, meta: res.meta || {} };
    if (res.code === 'CAPTIONS_BLOCKED') return { blocked: true, meta: res.meta || {} };
    return null; // other failure → let caller try the legacy path
  } catch (_) {
    return null; // no content script / unreachable tab
  }
}

export async function extract(url, options) {
  options = options || {};
  const videoId = extractVideoId(url) || url;
  if (!videoId || videoId.length !== 11) throw new Error('Invalid YouTube URL');

  const preferLang = options.preferLang || null;
  let tr = await getTranscriptFromTab(videoId, preferLang);
  if (tr && tr.noCaptions) {
    const err = new Error('no-captions'); err.code = 'NO_CAPTIONS'; err.meta = tr.meta; throw err;
  }
  if (tr && tr.blocked) {
    // Captions exist but YouTube's anti-bot (POT) served an empty body.
    const err = new Error('captions-blocked'); err.code = 'CAPTIONS_BLOCKED'; err.meta = tr.meta; throw err;
  }
  if (!tr || !tr.segments || !tr.segments.length) {
    // Fallback: background fetch (works for pasted URLs not open in a tab;
    // may hit 429 if YouTube rate-limits server-side requests).
    tr = await fetchTranscript(videoId, preferLang);
  }
  const plain   = transcriptToPlainText(tr.segments);
  const stamped = transcriptWithTimestamps(tr.segments, 30);
  return {
    kind:       'youtube',
    url:        `https://www.youtube.com/watch?v=${videoId}`,
    videoId,
    title:      tr.meta.title,
    author:     tr.meta.author,
    durationS:  tr.meta.lengthS,
    language:   tr.language,
    isAuto:     tr.isAuto,
    segments:   tr.segments,
    text:       plain,
    stamped,   // separate field with timecodes baked in, used by timestamps mode
    timecoded: true,
  };
}
