// Content-type dispatcher. Given { url } or { pdfBytes }, route to the right
// extractor module. Each extractor returns the same shape:
//
//   {
//     kind:           'youtube'|'vimeo'|'twitch'|'social'|'webpage'|'pdf'
//     subKind?:       'tiktok'|'instagram'|'twitter' (for social)
//     url?:           original URL
//     title:          string
//     author?:        string
//     language?:      string (ISO code, auto-detected)
//     durationS?:     number (videos)
//     segments?:      [{ start, dur, text }] (videos with captions, for timestamps)
//     text:           main extracted text — ALWAYS PRESENT unless `attachments`
//     attachments?:   [{ type:'pdf', bytes:Uint8Array, mimeType }] (Gemini-native PDFs)
//     requiresProvider?: 'gemini' (force routing when attachments are PDF)
//   }
//
// All imports are static — Manifest V3 service workers do NOT support
// dynamic `import()`. Modules are tiny (1-10 KB each) so eager-loading
// every extractor up front is fine.

import * as youtube     from './youtube.js';
import * as vimeo       from './vimeo.js';
import * as twitch      from './twitch.js';
import * as socialvideo from './socialvideo.js';
import * as webpage     from './webpage.js';
import * as pdfGemini   from './pdf-gemini.js';
import * as pdfText     from './pdf-text.js';

export function detectKind(input) {
  if (input && input.pdfBytes) {
    return { kind: 'pdf', subKind: 'upload', name: input.pdfName || 'document.pdf' };
  }
  const raw = String(input && input.url || '').trim();
  if (!raw) return { kind: 'unknown' };

  let u;
  try { u = new URL(raw); } catch (_) { return { kind: 'unknown' }; }
  const host = u.hostname.toLowerCase();
  const path = u.pathname.toLowerCase();

  // PDFs by extension or content-type hint
  if (path.endsWith('.pdf') || u.searchParams.get('content-type') === 'application/pdf') {
    return { kind: 'pdf', subKind: 'url', url: raw };
  }

  if (host === 'youtu.be' || host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
    return { kind: 'youtube', url: raw };
  }
  if (host.endsWith('vimeo.com')) {
    return { kind: 'vimeo', url: raw };
  }
  if (host.endsWith('twitch.tv')) {
    return { kind: 'twitch', url: raw };
  }
  if (host.endsWith('tiktok.com')) {
    return { kind: 'social', subKind: 'tiktok', url: raw };
  }
  if (host.endsWith('instagram.com')) {
    return { kind: 'social', subKind: 'instagram', url: raw };
  }
  if (host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com')) {
    return { kind: 'social', subKind: 'twitter', url: raw };
  }
  return { kind: 'webpage', url: raw };
}

export async function extract(input, options) {
  options = options || {};
  const detected = detectKind(input);

  switch (detected.kind) {
    case 'youtube':
      return await youtube.extract(detected.url, options);

    case 'vimeo':
      return await vimeo.extract(detected.url, options);

    case 'twitch':
      return await twitch.extract(detected.url, options);

    case 'social':
      return await socialvideo.extract(detected.url, detected.subKind, options);

    case 'pdf': {
      const useGemini = (options.pdfMode || 'gemini') === 'gemini';
      const mod = useGemini ? pdfGemini : pdfText;
      return await mod.extract({ ...detected, pdfBytes: input.pdfBytes }, options);
    }

    case 'webpage':
      return await webpage.extract(detected.url, options);

    default:
      throw new Error('Unsupported content type: ' + (detected.kind || 'unknown'));
  }
}
