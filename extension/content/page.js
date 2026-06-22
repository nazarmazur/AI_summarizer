// Universal content script. Decides where to put the AI Summarizer UI based
// on the host:
//   • YouTube watch page → card in #secondary above suggested videos.
//   • Anywhere else      → floating circle button bottom-right that toggles
//                          a draggable panel.
//
// We only inject when the page actually looks worth summarising (article,
// video page, PDF viewer, etc.). For a blank "new tab" or auth pages we stay
// quiet to keep the extension unobtrusive.

(function () {
  'use strict';

  const CARD_ID    = 'ais-sidebar-card';
  const FAB_ID     = 'ais-fab';
  const PANEL_ID   = 'ais-floating-panel';

  const host = location.hostname.toLowerCase();
  const isYouTube  = host.endsWith('youtube.com') || host === 'youtu.be';
  const isVimeo    = host.endsWith('vimeo.com');
  const isTwitch   = host.endsWith('twitch.tv');
  const isTikTok   = host.endsWith('tiktok.com');
  const isInsta    = host.endsWith('instagram.com');
  const isX        = host === 'x.com' || host === 'twitter.com';
  const isPdfTab   = (location.protocol === 'chrome-extension:' && /\/pdf_viewer\//i.test(location.pathname))
                  || /\.pdf(\?|$)/i.test(location.pathname);

  // ---------- shared: iframe panel ----------

  function makeIframe(srcUrl) {
    const iframe = document.createElement('iframe');
    // Pass the exact page URL so the panel auto-targets THIS page reliably
    // (no active-tab race) and can hide its now-redundant URL bar.
    let src = chrome.runtime.getURL('popup/popup.html');
    if (srcUrl) src += '?url=' + encodeURIComponent(srcUrl);
    iframe.src = src;
    iframe.title = 'AI Summarizer';
    iframe.allow = 'clipboard-write';
    iframe.addEventListener('load', () => postTheme(iframe));
    new MutationObserver(() => postTheme(iframe))
      .observe(document.documentElement, { attributes: true, attributeFilter: ['dark', 'class', 'data-theme'] });
    return iframe;
  }

  function isDarkMode() {
    if (document.documentElement.hasAttribute('dark')) return true;
    const cs = window.getComputedStyle(document.documentElement);
    const bg = (cs.backgroundColor || '').toString();
    if (/rgb\(\s*([0-3]?\d|4[0-2])\s*,\s*([0-3]?\d|4[0-2])\s*,\s*([0-3]?\d|4[0-2])\s*\)/.test(bg)) return true;
    if (/dark/i.test(document.documentElement.className) || /dark/i.test(document.documentElement.getAttribute('data-theme') || '')) return true;
    return false;
  }
  function postTheme(iframe) {
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'AIS_THEME', dark: isDarkMode() }, '*');
    }
  }

  // ---------- YouTube sidebar card (existing behaviour) ----------

  function findYTSidebar() {
    return document.querySelector('#secondary-inner')
        || document.querySelector('#secondary');
  }
  function findYTActionRow() {
    return document.querySelector('ytd-watch-metadata #top-level-buttons-computed')
        || document.querySelector('#actions-inner #menu');
  }
  function getYTVideoId() {
    const u = new URL(location.href);
    if (u.pathname === '/watch') return u.searchParams.get('v');
    if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
    return null;
  }

  function mountYTCard() {
    if (document.getElementById(CARD_ID)) return true;
    const sidebar = findYTSidebar();
    if (!sidebar) return false;

    const card = document.createElement('div');
    card.id = CARD_ID;
    card.innerHTML = `
      <div class="ais-card-head">
        <span class="ais-card-title">${LOGO_SVG('#a855f7')} AI Summarizer</span>
        <div class="ais-card-actions">
          <button class="ais-mini" id="ais-card-collapse" title="Collapse">${CARET_UP()}</button>
        </div>
      </div>
      <div class="ais-card-body"></div>`;
    card.querySelector('.ais-card-body').appendChild(makeIframe(location.href));
    sidebar.prepend(card);

    // The whole header is the collapse/expand toggle (clicking the caret bubbles
    // up to it, so a single handler covers both).
    const head = card.querySelector('.ais-card-head');
    const collapseBtn = card.querySelector('#ais-card-collapse');
    head.addEventListener('click', () => {
      card.classList.toggle('is-collapsed');
      const collapsed = card.classList.contains('is-collapsed');
      collapseBtn.innerHTML = collapsed ? CARET_DOWN() : CARET_UP();
      collapseBtn.title = collapsed ? 'Expand' : 'Collapse';
      chrome.storage.local.set({ ais_card_collapsed: collapsed }).catch(() => {});
    });
    chrome.storage.local.get('ais_card_collapsed').then((r) => {
      if (r.ais_card_collapsed) {
        card.classList.add('is-collapsed');
        collapseBtn.innerHTML = CARET_DOWN();
      }
    }).catch(() => {});
    return true;
  }

  function mountYTButton() {
    if (document.getElementById('ais-yt-btn')) return true;
    const target = findYTActionRow();
    if (!target) return false;
    const btn = document.createElement('button');
    btn.id = 'ais-yt-btn';
    btn.className = 'ais-yt-btn';
    btn.type = 'button';
    btn.innerHTML = `${LOGO_SVG('#fff')}<span>AI Summarize</span>`;
    btn.addEventListener('click', () => {
      const card = document.getElementById(CARD_ID);
      if (!card) { mountYTCard(); return; }
      if (card.classList.contains('is-collapsed')) {
        card.classList.remove('is-collapsed');
        card.querySelector('#ais-card-collapse').innerHTML = CARET_UP();
      }
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    target.prepend(btn);
    return true;
  }

  // ---------- Generic floating button + panel ----------

  function mountFloatingUI() {
    if (document.getElementById(FAB_ID)) return;
    const fab = document.createElement('button');
    fab.id = FAB_ID;
    fab.className = 'ais-fab';
    fab.type = 'button';
    fab.title = 'AI Summarizer';
    fab.innerHTML = LOGO_SVG('#fff');
    fab.addEventListener('click', toggleFloatingPanel);
    document.body.appendChild(fab);
  }

  function toggleFloatingPanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) { panel.remove(); return; }
    panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="ais-card-head">
        <span class="ais-card-title">${LOGO_SVG()} AI Summarizer</span>
        <div class="ais-card-actions">
          <button class="ais-mini" id="ais-panel-close" title="Close">${CLOSE_SVG()}</button>
        </div>
      </div>
      <div class="ais-card-body"></div>`;
    panel.querySelector('.ais-card-body').appendChild(makeIframe(location.href));
    document.body.appendChild(panel);

    panel.querySelector('#ais-panel-close').addEventListener('click', () => panel.remove());
    enableDrag(panel, panel.querySelector('.ais-card-head'));
  }

  function enableDrag(panel, handle) {
    let dx = 0, dy = 0;
    handle.style.cursor = 'grab';
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      const r = panel.getBoundingClientRect();
      dx = e.clientX - r.left;
      dy = e.clientY - r.top;
      handle.style.cursor = 'grabbing';
      panel.style.right = 'auto';
      const onMove = (ev) => {
        panel.style.left = (ev.clientX - dx) + 'px';
        panel.style.top  = (ev.clientY - dy) + 'px';
      };
      const onUp = () => {
        handle.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ---------- Lifecycle ----------

  let lastYTVideoId = null;
  function tick() {
    if (isYouTube) {
      const vid = getYTVideoId();
      if (!vid) { removeAll(); return; }
      if (vid !== lastYTVideoId) {
        lastYTVideoId = vid;
        const old = document.getElementById(CARD_ID);
        if (old) old.remove();
      }
      mountYTCard();
      mountYTButton();
    } else if (shouldShowFloatingFAB()) {
      mountFloatingUI();
    } else {
      removeAll();
    }
  }
  function removeAll() {
    [CARD_ID, FAB_ID, PANEL_ID, 'ais-yt-btn'].forEach((id) => {
      const n = document.getElementById(id);
      if (n) n.remove();
    });
    lastYTVideoId = null;
  }

  function shouldShowFloatingFAB() {
    // Always show on supported video platforms
    if (isVimeo || isTwitch || isTikTok || isInsta || isX) return true;
    // PDF tabs always show
    if (isPdfTab) return true;
    // Otherwise only show on "content" pages — not on blank tabs / auth / search.
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return false;
    // Heuristic: if the page has at least an <article>, <main>, or >500 chars
    // of body text, show the FAB. Skip on tiny utility pages.
    if (document.querySelector('article, main, [role="main"]')) return true;
    const bodyTextLen = (document.body && document.body.innerText || '').length;
    return bodyTextLen > 500;
  }

  const mo = new MutationObserver(() => {
    if (mo._scheduled) return;
    mo._scheduled = true;
    setTimeout(() => { mo._scheduled = false; tick(); }, 250);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('yt-navigate-finish', () => setTimeout(tick, 400));
  tick();

  // ---------- YouTube transcript bridge (isolated <-> MAIN world) ----------
  // The service worker asks us for the transcript; we relay to the MAIN-world
  // helper (content/yt-main.js), which fetches captions with the page's own
  // session — dodging the HTTP 429 a background fetch hits.
  if (isYouTube) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || msg.type !== 'AIS_GET_TRANSCRIPT') return;
      requestTranscriptFromPage(msg.preferLang).then(sendResponse);
      return true; // keep the channel open for the async response
    });
  }

  function requestTranscriptFromPage(preferLang) {
    return new Promise((resolve) => {
      const reqId = 'ais' + Date.now() + Math.random().toString(36).slice(2);
      const timer = setTimeout(() => { window.removeEventListener('message', onMsg); resolve(null); }, 8000);
      function onMsg(e) {
        const d = e.data;
        if (!d || d.source !== 'ais-main' || d.reqId !== reqId) return;
        clearTimeout(timer);
        window.removeEventListener('message', onMsg);
        resolve(d);
      }
      window.addEventListener('message', onMsg);
      window.postMessage({ source: 'ais-iso', type: 'YT_REQ', reqId, preferLang: preferLang || null }, '*');
    });
  }

  // ---------- SVG ----------
  function LOGO_SVG(fill) {
    fill = fill || '#fff';
    return `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2l1.7 4.6L18 8l-4.3 1.4L12 14l-1.7-4.6L6 8l4.3-1.4z" fill="${fill}"/>
      <path d="M5 14l1 2.7 2.7 1L6 18.7 5 21l-1-2.3L1 18l2.7-1z" fill="${fill}" opacity=".85"/>
    </svg>`;
  }
  function CARET_UP()   { return `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 14l5-5 5 5z"/></svg>`; }
  function CARET_DOWN() { return `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>`; }
  function CLOSE_SVG()  { return `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.4L17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/></svg>`; }
})();
