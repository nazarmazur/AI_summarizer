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

export async function extract(url, options) {
  options = options || {};
  const videoId = extractVideoId(url) || url;
  if (!videoId || videoId.length !== 11) throw new Error('Invalid YouTube URL');

  const tr = await fetchTranscript(videoId, options.preferLang || null);
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
