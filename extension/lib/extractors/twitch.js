// Twitch VOD extractor — best effort.
//
// Twitch doesn't expose closed-captions through any public endpoint we can hit
// from a Chrome extension without OAuth, and the GraphQL transcript endpoint
// requires a `Client-ID` + user-session integrity check.
//
// Strategy: pull the VOD page, scrape title/description/chapters from
// embedded JSON, and surface those as the "text". The summary won't be
// content-rich, but it tells the model what the stream is about so the user
// gets something useful (overview, topic, etc.).

const VOD_RE = /twitch\.tv\/(?:videos|[^/]+\/video|[^/]+\/clip)\/(\d+|[A-Za-z0-9_-]+)/;

export async function extract(url, options) {
  let vodId = null;
  const m = String(url).match(VOD_RE);
  if (m) vodId = m[1];

  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error('Twitch HTTP ' + r.status);
  const html = await r.text();

  const title  = pickMeta(html, 'og:title')       || pickTag(html, 'title') || '';
  const desc   = pickMeta(html, 'og:description') || '';
  const author = pickMeta(html, 'twitter:creator') || pickMeta(html, 'og:site_name') || '';
  const durStr = pickMeta(html, 'video:duration') || '';

  if (!title && !desc) {
    const err = new Error('no-content');
    err.code = 'NO_CONTENT';
    throw err;
  }

  const text = [title, desc].filter(Boolean).join('\n\n');

  return {
    kind:      'twitch',
    url,
    videoId:   vodId,
    title,
    author,
    durationS: parseInt(durStr, 10) || 0,
    text,
    timecoded: false,
  };
}

function pickMeta(html, prop) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${escapeRe(prop)}["'][^>]+content=["']([^"']+)["']`, 'i');
  const m = html.match(re);
  if (m) return decode(m[1]);
  // also try inverse attribute order
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapeRe(prop)}["']`, 'i');
  const m2 = html.match(re2);
  return m2 ? decode(m2[1]) : null;
}
function pickTag(html, tag) {
  const m = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? decode(m[1].replace(/<[^>]+>/g, '').trim()) : null;
}
function decode(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}
function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
