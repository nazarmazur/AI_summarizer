// Webpage extractor — a Readability-lite implementation.
//
// IMPORTANT: an MV3 service worker has NO DOM — `DOMParser`, `document`, etc. do
// not exist there (and never will, regardless of Chrome version). So we do ALL
// the DOM work INSIDE the page via chrome.scripting.executeScript: the injected
// function reads the live `document`, scores content blocks, and returns clean
// text + metadata. The service worker only receives plain strings.
//
// This runs under activeTab + scripting and respects the user's session
// (cookies, logged-in/paywalled pages), and only after a user click.

async function getActiveTabForUrl(url) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs && tabs[0];
  if (!tab || !tab.id) {
    const err = new Error('No active tab — open the article in your current tab, then click Summarize.');
    err.code = 'NO_ACTIVE_TAB';
    throw err;
  }
  // Be flexible about URL match — query strings and fragments may differ.
  if (url && tab.url) {
    const norm = (u) => { try { const x = new URL(u); return x.origin + x.pathname; } catch (_) { return u; } };
    if (norm(tab.url) !== norm(url)) {
      const err = new Error('To summarize an article, open it in the active tab first, then click the AI Summarizer toolbar icon.');
      err.code = 'URL_NOT_ACTIVE';
      err.url = url;
      err.activeUrl = tab.url;
      throw err;
    }
  }
  return tab;
}

// This whole function is serialized and injected into the page — it cannot
// reference anything from module scope, so every helper is inlined. It must not
// mutate the user's page (we only read the DOM; the strip is done while walking).
function extractInPage() {
  try {
    const STRIP = new Set([
      'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
      'nav', 'header', 'footer', 'aside', 'form', 'button',
      'figure', 'figcaption', 'video', 'audio', 'picture', 'template',
    ]);
    const POSITIVE = /article|content|entry|main|post|story|body|text|markdown/i;
    const NEGATIVE = /comment|meta|footer|footnote|nav|sidebar|sponsor|\bad\b|share|related|promo|popup|cookie|banner/i;

    const attr = (sel, a) => { const e = document.querySelector(sel); return e ? e.getAttribute(a) : null; };
    const title = (attr('meta[property="og:title"]', 'content')
                || attr('meta[name="twitter:title"]', 'content')
                || (document.querySelector('h1') && document.querySelector('h1').textContent.trim())
                || document.title || '').trim();
    const author = (attr('meta[name="author"]', 'content')
                 || attr('meta[property="article:author"]', 'content') || '').trim();
    const site = (attr('meta[property="og:site_name"]', 'content') || location.hostname || '').trim();

    const isHidden = (el) => {
      if (!el || el.nodeType !== 1) return false;
      if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return true;
      const s = el.getAttribute('style') || '';
      return /display\s*:\s*none|visibility\s*:\s*hidden/i.test(s);
    };

    function scoreElement(el) {
      if (!el || !el.textContent) return -Infinity;
      const cls = (el.className && el.className.toString ? el.className.toString() : '') + ' ' + (el.id || '');
      if (NEGATIVE.test(cls)) return -Infinity;
      const tag = el.tagName.toLowerCase();
      let bonus = 0;
      if (tag === 'article' || tag === 'main') bonus += 50;
      if (POSITIVE.test(cls)) bonus += 25;
      const textLen = el.textContent.trim().length;
      const links = el.querySelectorAll('a');
      let linkTextLen = 0;
      for (const a of links) linkTextLen += a.textContent.length;
      const linkDensity = textLen ? linkTextLen / textLen : 1;
      const paragraphs = el.querySelectorAll('p, li, blockquote, h2, h3');
      return textLen + paragraphs.length * 5 - linkDensity * 800 + bonus;
    }

    function renderText(root) {
      const out = [];
      (function dfs(node) {
        if (node.nodeType === 1) {
          const tag = node.tagName.toLowerCase();
          if (STRIP.has(tag) || isHidden(node)) return;
          const block = /^(p|h1|h2|h3|h4|h5|h6|li|blockquote|pre|tr|div|section|article)$/.test(tag);
          if (block) out.push('\n');
          if (/^h[1-6]$/.test(tag)) out.push('# ');
          for (let c = node.firstChild; c; c = c.nextSibling) dfs(c);
          if (block) out.push('\n');
        } else if (node.nodeType === 3) {
          const t = (node.nodeValue || '').replace(/\s+/g, ' ');
          if (t.trim()) out.push(t);
        }
      })(root);
      return out.join(' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/ ?\n ?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    }

    // Pick the highest-scoring content block from the live DOM.
    const candidates = document.querySelectorAll('article, main, section, div, [role="main"], [role="article"]');
    let best = null, bestScore = -Infinity;
    for (const el of candidates) {
      if (isHidden(el)) continue;
      const s = scoreElement(el);
      if (s > bestScore) { bestScore = s; best = el; }
    }
    let root = best;
    if (!root || bestScore < 200) root = document.body || document.documentElement;

    return { title, author, site, text: renderText(root) };
  } catch (e) {
    return { error: e && e.message ? e.message : String(e) };
  }
}

export async function extract(url, options) {
  // We have no host_permissions for arbitrary article URLs, so the SW can't fetch
  // them — and the SW has no DOM to parse them with anyway. Instead we inject a
  // reader into the active tab and let it return clean text from the live DOM.
  const tab = await getActiveTabForUrl(url);

  let res;
  try {
    [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: extractInPage,
    });
  } catch (e) {
    const err = new Error('Could not read page content: ' + e.message);
    err.code = 'SCRIPTING_FAILED';
    throw err;
  }

  const r = res && res.result;
  if (!r || r.error) {
    const err = new Error((r && r.error) || 'Page returned no content.');
    err.code = 'PAGE_EMPTY';
    throw err;
  }
  const text = (r.text || '').trim();
  if (text.length < 50) {
    const err = new Error('empty-content');
    err.code = 'EMPTY';
    throw err;
  }

  return {
    kind:   'webpage',
    url,
    title:  r.title || '',
    author: r.author || '',
    site:   r.site || (() => { try { return new URL(url).hostname; } catch (_) { return ''; } })(),
    text,
    timecoded: false,
  };
}
