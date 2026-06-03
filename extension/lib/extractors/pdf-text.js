// PDF text extractor using Mozilla's pdf.js.
//
// pdf.js is too big to ship inline in this repo. Install it once:
//
//   1. Download https://mozilla.github.io/pdf.js/legacy/ → "stable / prebuilt"
//   2. Copy the legacy ESM build to:
//        extension/lib/pdfjs/pdf.min.mjs
//        extension/lib/pdfjs/pdf.worker.min.mjs
//
// (Alternatively, `npm i pdfjs-dist@4` and copy
//  `node_modules/pdfjs-dist/legacy/build/pdf.min.mjs` + the worker.)

const PDFJS_MODULE = chrome.runtime.getURL('lib/pdfjs/pdf.min.mjs');
const PDFJS_WORKER = chrome.runtime.getURL('lib/pdfjs/pdf.worker.min.mjs');

let pdfjsLib = null;
async function loadPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  try {
    pdfjsLib = await import(/* @vite-ignore */ PDFJS_MODULE);
    if (pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    }
    return pdfjsLib;
  } catch (e) {
    const err = new Error('pdf.js is not installed. See lib/extractors/pdf-text.js header for setup instructions.');
    err.code  = 'PDFJS_MISSING';
    err.cause = e;
    throw err;
  }
}

export async function extract(detected, options) {
  const lib = await loadPdfjs();
  const bytes = await loadBytes(detected, options);

  const task = lib.getDocument({ data: bytes });
  const doc  = await task.promise;
  const pages = doc.numPages;

  const chunks = [];
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const pageText = tc.items.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim();
    if (pageText) chunks.push(`\n\n# Page ${i}\n\n${pageText}`);
  }
  const text = chunks.join('\n').trim();

  if (!text) {
    const err = new Error('PDF appears to be image-only — try Gemini mode for OCR.');
    err.code = 'PDF_NO_TEXT';
    throw err;
  }

  return {
    kind: 'pdf',
    pdfMode: 'pdfjs',
    url:   detected.url || null,
    title: detected.name || guessTitleFromUrl(detected.url),
    pages,
    text,
    timecoded: false,
  };
}

async function loadBytes(detected, options) {
  if (options && options.pdfBytes) return options.pdfBytes instanceof Uint8Array
    ? options.pdfBytes.buffer
    : options.pdfBytes;
  if (detected.pdfBytes) return detected.pdfBytes.buffer || detected.pdfBytes;
  if (!detected.url) throw new Error('PDF source is missing');
  const r = await fetch(detected.url, { credentials: 'omit' });
  if (!r.ok) throw new Error('PDF HTTP ' + r.status);
  return await r.arrayBuffer();
}

function guessTitleFromUrl(url) {
  if (!url) return 'document.pdf';
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || 'document.pdf');
  } catch (_) {
    return 'document.pdf';
  }
}
