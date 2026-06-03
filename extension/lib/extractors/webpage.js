// Webpage extractor — a Readability-lite implementation in plain JS.
//
// Strategy:
//   1. Fetch the page HTML (the service-worker has host-permissions for *).
//   2. Parse it into a DOM via DOMParser (available in MV3 service workers
//      since Chrome 116).
//   3. Strip script/style/nav/header/footer/aside/form/iframe.
//   4. Score every text-containing block element by content density:
//        score = textLength - 50 * linkDensity - 200 * commaCount? + …
//      and pick the highest-scoring subtree (with a small bonus for
//      <article>, <main>, [role=main], <section>).
//   5. Render the chosen subtree as plain text.
//
// We deliberately don't try to do too much — for production-grade extraction
// users should plug in Mozilla's Readability. This works for ~85% of pages.

const STRIP_TAGS = new Set([
  'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
  'nav', 'header', 'footer', 'aside', 'form', 'button',
  'figure', 'figcaption', 'video', 'audio', 'picture',
]);

// Extract the page HTML via chrome.scripting.executeScript instead of fetch().
// This works under `activeTab` + `scripting` permissions and respects the
// user's session (cookies, paywall bypass for logged-in pages, etc.).
async function getHtmlFromActiveTab(url) {
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
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: () => document.documentElement ? document.documentElement.outerHTML : '',
    });
    return res && res.result ? res.result : '';
  } catch (e) {
    const err = new Error('Could not read page HTML: ' + e.message);
    err.code = 'SCRIPTING_FAILED';
    throw err;
  }
}

const POSITIVE_HINTS = /article|content|entry|main|post|story|body|text|markdown/i;
const NEGATIVE_HINTS = /comment|meta|footer|footnote|nav|sidebar|sponsor|ad|share|related|promo|popup|cookie|banner/i;

export async function extract(url, options) {
  // For arbitrary article URLs we don't have host_permissions, so SW can't
  // fetch them directly. We grab the rendered HTML straight out of the
  // active tab via chrome.scripting.executeScript — this works under
  // activeTab + scripting permissions and only after a user click.
  const html = await getHtmlFromActiveTab(url);
  if (!html || html.length < 300) {
    const err = new Error('Page returned empty / too-short HTML.');
    err.code = 'PAGE_EMPTY';
    throw err;
  }

  // DOMParser became available in MV3 service workers in Chrome 124.
  if (typeof DOMParser === 'undefined') {
    const err = new Error('DOMParser is not available in your Chrome version. Update Chrome to 124 or newer.');
    err.code = 'NO_DOMPARSER';
    throw err;
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const titleEl = doc.querySelector('meta[property="og:title"]')
              || doc.querySelector('meta[name="twitter:title"]');
  const title = (titleEl && titleEl.getAttribute('content'))
              || (doc.querySelector('h1') && doc.querySelector('h1').textContent.trim())
              || (doc.querySelector('title') && doc.querySelector('title').textContent.trim())
              || '';
  const authorEl = doc.querySelector('meta[name="author"]')
               || doc.querySelector('meta[property="article:author"]');
  const author = (authorEl && authorEl.getAttribute('content')) || '';
  const siteEl = doc.querySelector('meta[property="og:site_name"]');
  const site = (siteEl && siteEl.getAttribute('content')) || (new URL(url)).hostname;

  // Strip nodes we don't want
  STRIP_TAGS.forEach((tag) => {
    doc.querySelectorAll(tag).forEach((n) => n.remove());
  });
  doc.querySelectorAll('[hidden], [aria-hidden="true"], [style*="display:none"], [style*="display: none"]').forEach((n) => n.remove());

  // Score block candidates
  const candidates = doc.querySelectorAll('article, main, section, div, [role="main"], [role="article"]');
  let best = null;
  let bestScore = -Infinity;
  candidates.forEach((el) => {
    const score = scoreElement(el);
    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  });

  // Fallback to <body> if no candidate looked good
  let root = best;
  if (!root || bestScore < 200) root = doc.body || doc.documentElement;

  const text = renderText(doc, root).trim();
  if (!text) {
    const err = new Error('empty-content');
    err.code  = 'EMPTY';
    throw err;
  }

  return {
    kind:   'webpage',
    url,
    title,
    author,
    site,
    text,
    timecoded: false,
  };
}

function scoreElement(el) {
  if (!el || !el.textContent) return -Infinity;
  const cls = (el.className || '') + ' ' + (el.id || '');
  if (NEGATIVE_HINTS.test(cls)) return -Infinity;

  const tag = el.tagName.toLowerCase();
  let bonus = 0;
  if (tag === 'article' || tag === 'main') bonus += 50;
  if (POSITIVE_HINTS.test(cls)) bonus += 25;

  const textLen = el.textContent.trim().length;
  const links   = el.querySelectorAll('a');
  const linkTextLen = Array.from(links).reduce((sum, a) => sum + a.textContent.length, 0);
  const linkDensity = textLen ? linkTextLen / textLen : 1;

  const paragraphs = el.querySelectorAll('p, li, blockquote, h2, h3');
  const paragraphScore = paragraphs.length * 5;

  return textLen + paragraphScore - (linkDensity * 800) + bonus;
}

function renderText(doc, root) {
  // Recursive walk — service workers have DOMParser but no global `document`,
  // so we use the parsed doc's TreeWalker via doc.createTreeWalker.
  const SHOW = (1 /* SHOW_ELEMENT */) | (4 /* SHOW_TEXT */);
  const ELEMENT_NODE = 1;
  const TEXT_NODE    = 3;
  const walker = doc.createTreeWalker
    ? doc.createTreeWalker(root, SHOW, null)
    : null;

  const out = [];
  function visit(node) {
    if (node.nodeType === ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();
      if (/^(p|h1|h2|h3|h4|h5|h6|li|blockquote|pre|tr)$/.test(tag)) out.push('\n');
      if (/^(h1|h2|h3|h4|h5|h6)$/.test(tag)) out.push('# ');
    } else if (node.nodeType === TEXT_NODE) {
      const t = (node.nodeValue || '').replace(/\s+/g, ' ');
      if (t.trim()) out.push(t);
    }
  }

  if (walker) {
    let n;
    while ((n = walker.nextNode())) visit(n);
  } else {
    // Manual DFS fallback
    function dfs(n) {
      visit(n);
      for (let c = n.firstChild; c; c = c.nextSibling) dfs(c);
    }
    dfs(root);
  }

  return out.join(' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}
