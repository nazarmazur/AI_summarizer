// Splits a long transcript into chunks at natural boundaries so we can do
// map-reduce summarisation for 2+ hour videos.
//
// Strategy:
//   • Prefer paragraph breaks ("\n\n") — rare in transcripts.
//   • Then sentence endings (. ! ? followed by space/newline).
//   • Then any whitespace.
//   • Last resort: hard slice at the target size.
//
// We aim for `targetSize` chars per chunk, with a tolerance window: a chunk
// can be up to `targetSize * 1.3` if that lets us stop at a clean boundary,
// or down to `targetSize * 0.7` if a perfect boundary lands a bit early.

const DEFAULT_TARGET = 25_000;       // ~6-8k tokens depending on language
const DEFAULT_OVERLAP = 250;         // copy last N chars into next chunk for context

export function chunkText(text, options) {
  const opts = options || {};
  const targetSize = opts.targetSize || DEFAULT_TARGET;
  const overlap    = opts.overlap    || DEFAULT_OVERLAP;
  const minSize    = Math.floor(targetSize * 0.7);
  const maxSize    = Math.floor(targetSize * 1.3);

  const s = String(text || '');
  if (s.length <= maxSize) return [s];

  const chunks = [];
  let i = 0;
  while (i < s.length) {
    const remaining = s.length - i;
    if (remaining <= maxSize) {
      chunks.push(s.slice(i));
      break;
    }

    // Search window: [i + minSize, i + maxSize]
    const winStart = i + minSize;
    const winEnd   = Math.min(i + maxSize, s.length);
    const win      = s.slice(winStart, winEnd);

    let cut = -1;
    // 1) paragraph break
    cut = lastIndexOfAny(win, ['\n\n']);
    // 2) sentence end
    if (cut < 0) cut = lastIndexOfRegex(win, /[.!?]["')\]]?\s/);
    // 3) any whitespace
    if (cut < 0) cut = lastIndexOfRegex(win, /\s/);

    let end;
    if (cut < 0) {
      end = i + targetSize; // hard slice
    } else {
      end = winStart + cut + 1; // include the boundary character
    }

    chunks.push(s.slice(i, end));

    // Overlap: rewind a bit so context carries to next chunk.
    i = Math.max(end - overlap, end);
  }
  return chunks;
}

function lastIndexOfAny(haystack, needles) {
  let best = -1;
  for (const n of needles) {
    const idx = haystack.lastIndexOf(n);
    if (idx > best) best = idx;
  }
  return best;
}

function lastIndexOfRegex(haystack, re) {
  // Find the last match of `re` in haystack. We scan from the end.
  let last = -1;
  let m;
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  while ((m = g.exec(haystack)) !== null) {
    last = m.index;
    if (m.index === g.lastIndex) g.lastIndex++; // avoid zero-width loop
  }
  return last;
}

// Pool of N concurrent workers running `fn(item, index)`. Returns results in
// the original order. Used to summarise chunks in parallel without spawning
// too many requests at once (rate limits, fairness).
export async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const workers = [];
  for (let k = 0; k < Math.max(1, Math.min(concurrency, items.length)); k++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}
