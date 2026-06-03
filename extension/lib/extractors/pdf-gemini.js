// PDF extractor that hands raw bytes to Gemini.
//
// Gemini's generative API accepts a part of shape:
//   { inlineData: { mimeType: 'application/pdf', data: <base64> } }
// The model reads the PDF natively (text + layout + scanned pages).
//
// This extractor returns an `attachments` array instead of `text`. The caller
// is expected to send the attachment to Gemini specifically — the response
// from this extractor sets `requiresProvider: 'gemini'`.

import { detectKind } from './index.js';

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB hard cap (Gemini will reject larger)

export async function extract(detected, options) {
  const bytes = await loadBytes(detected, options);
  if (bytes.byteLength > MAX_BYTES) {
    const err = new Error(`PDF is too large for Gemini inline (${(bytes.byteLength/1024/1024).toFixed(1)} MB). Switch to pdfjs mode.`);
    err.code = 'PDF_TOO_LARGE';
    throw err;
  }

  return {
    kind: 'pdf',
    pdfMode: 'gemini',
    url:   detected.url || null,
    title: detected.name || guessTitleFromUrl(detected.url),
    attachments: [{
      type:     'pdf',
      bytes:    new Uint8Array(bytes),
      mimeType: 'application/pdf',
    }],
    requiresProvider: 'gemini',
    // No `text` — Gemini will read the bytes.
  };
}

async function loadBytes(detected, options) {
  if (options && options.pdfBytes) return options.pdfBytes instanceof Uint8Array
      ? options.pdfBytes.buffer
      : options.pdfBytes;
  if (detected.pdfBytes) return detected.pdfBytes.buffer || detected.pdfBytes;
  if (!detected.url) throw new Error('PDF source is missing (no URL or bytes)');
  const r = await fetch(detected.url, { credentials: 'omit' });
  if (!r.ok) throw new Error('PDF HTTP ' + r.status);
  return await r.arrayBuffer();
}

function guessTitleFromUrl(url) {
  if (!url) return 'document.pdf';
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || 'document.pdf';
    return decodeURIComponent(last);
  } catch (_) {
    return 'document.pdf';
  }
}
