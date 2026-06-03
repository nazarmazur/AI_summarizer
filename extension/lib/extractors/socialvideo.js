// TikTok / Instagram / X(Twitter) extractor.
//
// None of these surface usable captions to a third-party fetch. What we can
// reliably get is the Open Graph metadata + any embedded JSON-LD description
// the platform exposes for SEO. That gives us:
//   • video title / poster
//   • author / handle
//   • description (often the full caption text)
//   • a few "schema.org/VideoObject" fields
// We summarise that text instead of "speech-to-text" content. The model is
// told explicitly that this is a short-form video and to summarise what it
// can.

const HEADERS = {
  'Accept-Language': 'en-US,en;q=0.9',
  // A real-ish UA helps with TikTok/Instagram which serve stripped HTML to
  // headless clients.
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

export async function extract(url, subKind, options) {
  const r = await fetch(url, { credentials: 'include', headers: HEADERS });
  if (!r.ok) throw new Error(`${subKind} HTTP ${r.status}`);
  const html = await r.text();

  const og = {
    title:       pickMeta(html, 'og:title')       || pickTag(html, 'title') || '',
    description: pickMeta(html, 'og:description') || pickMeta(html, 'description') || '',
    siteName:    pickMeta(html, 'og:site_name')   || '',
    image:       pickMeta(html, 'og:image')       || '',
    author:      pickMeta(html, 'author')         || pickMeta(html, 'twitter:creator') || '',
    duration:    pickMeta(html, 'video:duration') || pickMeta(html, 'og:video:duration') || '',
  };

  // JSON-LD often holds a richer `description` than og:description
  const ld = pickJsonLd(html);
  if (ld) {
    if (ld.description && (!og.description || ld.description.length > og.description.length)) {
      og.description = ld.description;
    }
    if (!og.author && ld.author) og.author = typeof ld.author === 'string' ? ld.author : (ld.author.name || '');
    if (!og.duration && ld.duration) og.duration = ld.duration;
  }

  // Some platforms hide the caption in embedded JSON. Try a few patterns.
  let extraCaption = '';
  if (subKind === 'tiktok') {
    const m = html.match(/"desc":"([^"]+)"/);
    if (m) extraCaption = unescapeJsonString(m[1]);
  } else if (subKind === 'twitter') {
    const m = html.match(/"full_text":"([^"]+)"/);
    if (m) extraCaption = unescapeJsonString(m[1]);
  }

  const text = [og.title, og.description, extraCaption]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)   // dedupe identical bits
    .join('\n\n')
    .trim();

  if (!text) {
    const err = new Error('no-content');
    err.code  = 'NO_CONTENT';
    throw err;
  }

  return {
    kind:    'social',
    subKind,
    url,
    title:   og.title,
    author:  og.author,
    site:    og.siteName,
    durationS: parseDuration(og.duration),
    text,
    timecoded: false,
  };
}

function parseDuration(d) {
  if (!d) return 0;
  // ISO 8601 PT#M#S
  const m = String(d).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (m) return (parseInt(m[1] || 0, 10) * 3600) + (parseInt(m[2] || 0, 10) * 60) + parseInt(m[3] || 0, 10);
  return parseInt(d, 10) || 0;
}

function pickMeta(html, prop) {
  const re  = new RegExp(`<meta[^>]+(?:property|name)=["']${escapeRe(prop)}["'][^>]+content=["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapeRe(prop)}["']`, 'i');
  const m = html.match(re) || html.match(re2);
  return m ? decode(m[1]) : null;
}
function pickTag(html, tag) {
  const m = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? decode(m[1].replace(/<[^>]+>/g, '').trim()) : null;
}
function pickJsonLd(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      const candidate = Array.isArray(data) ? data.find((d) => d && d['@type'] && /Video/i.test(d['@type'])) : data;
      if (candidate && candidate['@type'] && /Video/i.test(candidate['@type'])) return candidate;
    } catch (_) {}
  }
  return null;
}
function unescapeJsonString(s) {
  try { return JSON.parse('"' + s + '"'); } catch (_) { return s; }
}
function decode(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}
function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
