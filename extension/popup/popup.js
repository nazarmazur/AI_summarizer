import { getSettings, setSettings, getApiKeys } from '../lib/ai-api.js';
import { LANGUAGES, DEFAULT_SETTINGS, MODELS, modelsByProvider, RELEASE_MODE, HAS_SUPABASE, HAS_PRO, DONATE } from '../lib/config.js';
import { getTierStatus } from '../lib/tier.js';
import { FEATURES, canUse, isProModel } from '../lib/features.js';
import { getAllTemplates } from '../lib/templates.js';

const t = (k, subs) => (window.AIS_I18N ? window.AIS_I18N.t(k, subs) : ((typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage(k, subs)) || k));

function escHTML(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// UI locale follows the chosen summary language when a matching interface locale
// exists (uk/ru/en); otherwise it falls back to the browser default. AI model
// names are intentionally left in English everywhere.
const UI_LOCALES = ['uk', 'ru', 'en'];
function pickUiLocale() {
  if (UI_LOCALES.includes(settings.uiLang)) return settings.uiLang;
  if (UI_LOCALES.includes(settings.language)) return settings.language;
  return null;   // null → chrome.i18n (browser) default
}
async function applyUiLocale() {
  if (!window.AIS_I18N || !window.AIS_I18N.loadLocale) return;
  await window.AIS_I18N.loadLocale(pickUiLocale());
  window.AIS_I18N.applyI18n(document);
}

// Built-in template names are translatable; user templates keep their own name.
const TPL_NAME_KEY = {
  standard: 'tplNameStandard', executive: 'tplNameExecutive', eli5: 'tplNameEli5',
  actions: 'tplNameActions', 'study-notes': 'tplNameStudyNotes', quotes: 'tplNameQuotes',
};
function tplName(tpl) {
  if (!tpl) return '';
  const key = TPL_NAME_KEY[tpl.id];
  if (!key) return tpl.name;
  const v = t(key);
  return (v && v !== key) ? v : tpl.name;
}

// --------------------------------------------------------------------- DOM
const $ = (id) => document.getElementById(id);

const langChip      = $('langChip');
const langChipLabel = $('langChipLabel');
const lengthChip      = $('lengthChip');
const lengthChipLabel = $('lengthChipLabel');
const modelChip      = $('modelChip');
const modelChipLabel = $('modelChipLabel');
const templateChip      = $('templateChip');
const templateChipLabel = $('templateChipLabel');
const templateMenu      = $('templateMenu');

const urlInput     = $('urlInput');
const runBtn       = $('runBtn');
const tiles        = document.querySelectorAll('.tile');
const pdfPickBtn   = $('pdfPickBtn');
const pdfFileInput = $('pdfFileInput');
const srcRow       = $('srcRow');
const srcIcon      = $('srcIcon');
const srcLabel     = $('srcLabel');

const settingsBtn  = $('settingsBtn');
const historyBtn   = $('historyBtn');

const langMenu   = $('langMenu');
const lengthMenu = $('lengthMenu');
const modelMenu  = $('modelMenu');

const stateEmpty   = $('empty');
const stateLoading = $('loading');
const stateError   = $('error');
const errorText    = $('errorText');
const errorBtn     = $('errorActionBtn');
const loadingLabel = $('loadingLabel');

const result        = $('result');
const resultHeader  = $('resultHeader');
const resultMeta    = $('resultMeta');
const resultBody    = $('resultBody');
const regenBtn      = $('regenBtn');
const copyBtn       = $('copyBtn');
const stopBtn       = $('stopBtn');
const fallbackBanner    = $('fallbackBanner');
const loadingProgress   = $('loadingProgress');
const loadingProgressBar = $('loadingProgressBar');
const downloadBtn       = $('downloadBtn');
const shareBtn          = $('shareBtn');
const bookmarkBtn       = $('bookmarkBtn');
const chatBox       = $('chat');
const chatHistory   = $('chatHistory');
const chatForm      = $('chatForm');
const chatInput     = $('chatInput');
const chatSendBtn   = $('chatSendBtn');
const chatSuggest   = $('chatSuggestions');

// --------------------------------------------------------------------- state
let settings = { ...DEFAULT_SETTINGS };
let lastJob  = null;
let lastRunCall = null;   // { kind, opts } of the most recent run() — for retry buttons
let postHeight  = null;   // set in embed mode → re-measures + reports iframe height
let currentTier = 'free';
let upsellContext = null;   // { feature, pendingKind } — only used in Pro builds

// --------------------------------------------------------------------- upsell
// The upsell modal only exists in 'full' release builds. In the free build the
// modal HTML is absent, so every reference here is null-guarded and openUpsell
// is a no-op. This block must never throw at load time regardless of build.

const upsellModal = $('upsellModal');   // null in free build
const upsellGoBtn = $('upsellGoBtn');   // null in free build

function openUpsell(feature, pendingKind) {
  if (!upsellModal) return;             // no Pro UI in free build
  upsellContext = { feature, pendingKind };
  upsellModal.hidden = false;
}
function closeUpsell() {
  if (!upsellModal) return;
  upsellModal.hidden = true;
  upsellContext = null;
}

if (upsellModal) {
  // Close via any [data-modal-close] element (capture phase).
  document.addEventListener('click', (e) => {
    const tt = e.target;
    if (tt && (tt.matches('[data-modal-close]') || (typeof tt.closest === 'function' && tt.closest('[data-modal-close]')))) {
      e.preventDefault();
      e.stopPropagation();
      closeUpsell();
    }
  }, true);

  upsellModal.addEventListener('click', (e) => {
    if (e.target === upsellModal || e.target.closest('[data-modal-close]')) closeUpsell();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !upsellModal.hidden) { e.preventDefault(); closeUpsell(); }
  });

  document.querySelectorAll('.price-card').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.price-card').forEach((c) => c.classList.remove('is-selected'));
      card.classList.add('is-selected');
      const radio = card.querySelector('input[type=radio]');
      if (radio) radio.checked = true;
    });
  });

  if (upsellGoBtn) upsellGoBtn.addEventListener('click', () => {
    const plan = document.querySelector('input[name=ais-plan]:checked')?.value || 'yearly';
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html?upgrade=' + encodeURIComponent(plan)) });
    closeUpsell();
  });
}

// --------------------------------------------------------------------- menus

function buildLangMenu() {
  langMenu.innerHTML = '';
  // Search box at the top — instant filter as user types
  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'menu-search';
  search.placeholder = t('langSearch');
  langMenu.appendChild(search);

  const listEl = document.createElement('div');
  listEl.className = 'menu-list';
  langMenu.appendChild(listEl);

  function render(filter) {
    listEl.innerHTML = '';
    const q = (filter || '').toLowerCase().trim();
    const items = q
      ? LANGUAGES.filter((l) => l.label.toLowerCase().includes(q) || l.code.includes(q))
      : LANGUAGES;
    for (const l of items) {
      const b = document.createElement('button');
      b.className = 'menu-item';
      b.textContent = l.label;
      b.dataset.value = l.code;
      if (settings.language === l.code) b.classList.add('is-selected');
      b.addEventListener('click', () => {
        setSettings({ language: l.code }).then(async () => {
          settings.language = l.code;
          await applyUiLocale();   // re-localize the whole UI to the new language
          buildModelMenu();
          buildTemplateMenu();
          updateChips();
          hideMenus();
        });
      });
      listEl.appendChild(b);
    }
  }
  render();
  search.addEventListener('input', () => render(search.value));
  // Auto-focus search when menu opens
  langMenu.addEventListener('aismenu:open', () => { search.value = ''; render(); search.focus(); });
}

function buildModelMenu() {
  modelMenu.innerHTML = '';
  const groups = modelsByProvider();
  const providerLabels = { gemini: 'Google Gemini', openai: 'OpenAI', anthropic: 'Anthropic Claude' };

  // Auto entry first
  const autoBtn = document.createElement('button');
  autoBtn.className = 'menu-item menu-item-rich' + (settings.model === 'auto' ? ' is-selected' : '');
  autoBtn.dataset.value = 'auto';
  autoBtn.innerHTML = `
    <span class="mi-title">${escHTML(t('modelAuto'))}</span>
    <span class="mi-sub">${escHTML(t('modelAutoDesc'))}</span>`;
  modelMenu.appendChild(autoBtn);

  for (const prov of ['gemini', 'openai', 'anthropic']) {
    const hdr = document.createElement('div');
    hdr.className = 'menu-section';
    hdr.textContent = providerLabels[prov];
    modelMenu.appendChild(hdr);
    for (const m of groups[prov]) {
      const b = document.createElement('button');
      b.className = 'menu-item menu-item-rich' + (settings.model === m.key ? ' is-selected' : '');
      b.dataset.value = m.key;
      // PRO badge/gating only when a real Pro tier exists. In the free (BYOK)
      // build every model is usable with the user's own key, so no badge.
      const showPro = HAS_PRO && m.group === 'pro';
      if (showPro) b.dataset.pro = '1';
      b.innerHTML = `
        <span class="mi-title">${escHTML(m.label)}${showPro ? '<span class="mi-pro">PRO</span>' : ''}</span>
        <span class="mi-sub">${escHTML(m.description || '')}</span>`;
      modelMenu.appendChild(b);
    }
  }
}

let cachedTemplates = [];
async function buildTemplateMenu() {
  cachedTemplates = await getAllTemplates();
  templateMenu.innerHTML = '';
  cachedTemplates.forEach((tpl) => {
    const b = document.createElement('button');
    b.className = 'menu-item' + (tpl.id === (settings.templateId || 'standard') ? ' is-selected' : '');
    b.dataset.value = tpl.id;
    b.title = tpl.description || '';
    b.innerHTML = `<span>${escHTML(tplName(tpl))}</span>${!tpl.builtin ? '<span class="pill">custom</span>' : ''}`;
    if (!tpl.builtin) b.dataset.pro = '1';
    b.addEventListener('click', async () => {
      if (!tpl.builtin && currentTier !== 'pro') {
        hideMenus();
        openUpsell(FEATURES.CUSTOM_PROMPTS);
        return;
      }
      await setSettings({ templateId: tpl.id });
      settings.templateId = tpl.id;
      templateChipLabel.textContent = tplName(tpl);
      hideMenus();
    });
    templateMenu.appendChild(b);
  });
}

function positionMenu(menu, anchor) {
  const r = anchor.getBoundingClientRect();
  menu.style.top  = (r.bottom + 4) + 'px';
  menu.style.left = r.left + 'px';
  menu.hidden = false;
  // Embedded card: the dropdown is absolutely positioned and would be clipped by
  // the (short) iframe — grow the card to fit it so all models are visible.
  if (postHeight) setTimeout(postHeight, 0);
}

function hideMenus() {
  langMenu.hidden = true;
  lengthMenu.hidden = true;
  modelMenu.hidden = true;
  templateMenu.hidden = true;
  if (postHeight) setTimeout(postHeight, 0);   // shrink the card back down
}

function wireMenu(chip, menu, key) {
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasHidden = menu.hidden;
    hideMenus();
    if (wasHidden) {
      positionMenu(menu, chip);
      menu.dispatchEvent(new CustomEvent('aismenu:open'));
    }
  });
  // Event delegation so dynamically-added .menu-item entries still work.
  menu.addEventListener('click', async (e) => {
    const item = e.target.closest('.menu-item');
    if (!item || !menu.contains(item)) return;
    const value = item.dataset.value;
    if (HAS_PRO && key === 'model' && item.dataset.pro === '1' && currentTier !== 'pro') {
      hideMenus();
      openUpsell(FEATURES.PREMIUM_MODELS);
      return;
    }
    await setSettings({ [key]: value });
    settings[key] = value;
    updateChips();
    hideMenus();
  });
}

function applyTierToUI() {
  // In free release mode, treat everyone as Pro for gating purposes — there
  // is no Pro tier yet, so don't show any locks or upsell triggers.
  if (!HAS_PRO) {
    document.querySelectorAll('.tile[data-pro-feature] .lock-badge').forEach((b) => { b.hidden = true; });
    document.querySelectorAll('.menu-item[data-pro]').forEach((b) => { b.removeAttribute('data-pro'); });
    return;
  }
  const isFree = currentTier !== 'pro';
  document.querySelectorAll('.tile[data-pro-feature] .lock-badge').forEach((b) => {
    b.hidden = !isFree;
  });
}

document.addEventListener('click', () => {
  hideMenus();
  if (shareMenu && !shareMenu.hidden) shareMenu.hidden = true;
});
// When embedded in an iframe (the YouTube card / side panel), a click on the
// host page never reaches our document — but it does blur our window. Close any
// open dropdown when focus leaves the frame so menus don't stay stuck open.
window.addEventListener('blur', () => {
  hideMenus();
  if (shareMenu && !shareMenu.hidden) shareMenu.hidden = true;
});

// --------------------------------------------------------------------- chips

function langLabel(code) {
  const l = LANGUAGES.find((x) => x.code === code);
  return l ? l.label : code;
}
function modelLabel(key) {
  if (key === 'auto') return t('modelAuto');
  return (MODELS[key] && MODELS[key].label) || key;
}
function lengthLabel(key) {
  if (key === 'short')  return t('lengthShort');
  if (key === 'medium') return t('lengthMedium');
  if (key === 'long')   return t('lengthLong');
  return key;
}

function updateChips() {
  langChipLabel.textContent   = langLabel(settings.language);
  lengthChipLabel.textContent = lengthLabel(settings.length);
  modelChipLabel.textContent  = modelLabel(settings.model);
  if (cachedTemplates.length) {
    const cur = cachedTemplates.find((x) => x.id === (settings.templateId || 'standard')) || cachedTemplates[0];
    templateChipLabel.textContent = cur ? tplName(cur) : 'Standard';
  }

  document.querySelectorAll('#langMenu .menu-item').forEach((el) =>
    el.classList.toggle('is-selected', el.dataset.value === settings.language));
  document.querySelectorAll('#lengthMenu .menu-item').forEach((el) =>
    el.classList.toggle('is-selected', el.dataset.value === settings.length));
  document.querySelectorAll('#modelMenu .menu-item').forEach((el) =>
    el.classList.toggle('is-selected', el.dataset.value === settings.model));
}

// --------------------------------------------------------------------- url

// Local copy of the dispatcher's detector so we can run it in the popup
// without async-importing the extractor module.
function detectKindLocal(url) {
  if (!url) return { kind: 'unknown' };
  let u;
  try { u = new URL(url); } catch (_) { return { kind: 'unknown' }; }
  const host = u.hostname.toLowerCase();
  const path = u.pathname.toLowerCase();
  if (path.endsWith('.pdf')) return { kind: 'pdf' };
  if (host === 'youtu.be' || host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) return { kind: 'youtube' };
  if (host.endsWith('vimeo.com'))    return { kind: 'vimeo' };
  if (host.endsWith('twitch.tv'))    return { kind: 'twitch' };
  if (host.endsWith('tiktok.com'))   return { kind: 'social', subKind: 'tiktok' };
  if (host.endsWith('instagram.com')) return { kind: 'social', subKind: 'instagram' };
  if (host === 'x.com' || host === 'twitter.com') return { kind: 'social', subKind: 'twitter' };
  return { kind: 'webpage' };
}

function sourceLabelKey(kind, subKind) {
  switch (kind) {
    case 'youtube':  return 'srcYoutube';
    case 'vimeo':    return 'srcVimeo';
    case 'twitch':   return 'srcTwitch';
    case 'pdf':      return 'srcPdf';
    case 'social':
      if (subKind === 'instagram') return 'srcInstagram';
      if (subKind === 'twitter')   return 'srcTwitter';
      return 'srcTiktok';
    case 'webpage':
    default:         return 'srcWebpage';
  }
}

function sourceIconPath(kind) {
  // Simple mono icons via SVG path data.
  switch (kind) {
    case 'youtube':
    case 'vimeo':
    case 'twitch':
      return 'M8 5v14l11-7z'; // play triangle
    case 'social':
      return 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z';
    case 'pdf':
      return 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6';
    case 'webpage':
    default:
      return 'M19 5v14H5V5h14m0-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM7 7h10v2H7zm0 4h10v2H7zm0 4h7v2H7z';
  }
}

function isVideoKind(kind) {
  return kind === 'youtube' || kind === 'vimeo' || kind === 'twitch' || kind === 'social';
}

// Timestamps only make sense for videos — hide the tile for articles/PDFs.
function setTimestampsVisible(show) {
  const tile = document.querySelector('.tile-timestamps');
  if (tile) tile.hidden = !show;
}

function updateSourceChip(url) {
  if (!url) {
    srcRow.hidden = true;
    setTimestampsVisible(true);
    return;
  }
  const det = detectKindLocal(url);
  if (det.kind === 'unknown') {
    srcRow.hidden = true;
    setTimestampsVisible(true);
    return;
  }
  const labelKey = sourceLabelKey(det.kind, det.subKind);
  srcLabel.textContent = t(labelKey);
  const path = srcIcon.querySelector('path');
  if (path) path.setAttribute('d', sourceIconPath(det.kind));
  srcRow.hidden = false;
  setTimestampsVisible(isVideoKind(det.kind));
}

async function prefillFromActiveTab() {
  // Embedded contexts (YouTube card / floating panel) pass the exact page URL as
  // ?url= — use it directly. It's reliable (no active-tab race) and, because the
  // target is unambiguous, we hide the now-redundant URL bar for a cleaner look.
  const paramUrl = new URLSearchParams(location.search).get('url');
  if (paramUrl && /^https?:/i.test(paramUrl)) {
    const det = detectKindLocal(paramUrl);
    if (det.kind !== 'unknown') {
      urlInput.value = paramUrl;
      const row = document.querySelector('.url-row');
      if (row) row.hidden = true;
      return;
    }
  }
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tabs && tabs[0] && tabs[0].url;
    // Prefill anything we can summarise — http(s) pages/videos AND the local
    // file:// PDF the user is currently viewing.
    if (url && /^(https?|file):/i.test(url)) {
      const det = detectKindLocal(url);
      if (det.kind !== 'unknown') {
        urlInput.value = url;
        updateSourceChip(url);
      }
    }
  } catch (_) { /* ignore */ }
}

// --------------------------------------------------------------------- markdown

// (escHTML is also declared at the top of the file)

// Tiny Markdown renderer — handles headings, bold, italic, lists, links, code,
// and timestamp links of the form "MM:SS" or "H:MM:SS" at line start.
function renderMarkdown(md, videoId) {
  const lines = md.split('\n');
  const out = [];
  let inUl = false, inOl = false;
  const closeLists = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
  };

  function inline(s) {
    s = escHTML(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|\s)\*([^*]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    if (videoId) {
      s = s.replace(/(^|\s|[\[(])(\d{1,2}:\d{2}(?::\d{2})?)/g, (_m, pre, ts) => {
        const sec = ts.split(':').reduce((a, b) => a * 60 + parseInt(b, 10), 0);
        const u = `https://www.youtube.com/watch?v=${videoId}&t=${sec}s`;
        return `${pre}<a class="ts" href="${u}" data-seconds="${sec}" target="_blank" rel="noopener">${ts}</a>`;
      });
    }
    return s;
  }

  for (let raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { closeLists(); continue; }

    let m;
    if ((m = line.match(/^(#{1,3})\s+(.+)$/))) {
      closeLists();
      const lvl = m[1].length;
      out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
      continue;
    }
    if (line.match(/^[-*]\s+/)) {
      if (!inUl) { closeLists(); out.push('<ul>'); inUl = true; }
      out.push('<li>' + inline(line.replace(/^[-*]\s+/, '')) + '</li>');
      continue;
    }
    if (line.match(/^\d+\.\s+/)) {
      if (!inOl) { closeLists(); out.push('<ol>'); inOl = true; }
      out.push('<li>' + inline(line.replace(/^\d+\.\s+/, '')) + '</li>');
      continue;
    }
    closeLists();
    out.push('<p>' + inline(line) + '</p>');
  }
  closeLists();
  return out.join('\n');
}

// --------------------------------------------------------------------- run

function showState(which) {
  stateEmpty.hidden    = which !== 'empty';
  stateLoading.hidden  = which !== 'loading';
  stateError.hidden    = which !== 'error';
  result.hidden        = which !== 'result';
}

function showError(msg, action) {
  errorText.textContent = msg;
  if (action) {
    errorBtn.hidden = false;
    errorBtn.textContent = action.label;
    errorBtn.onclick = action.handler;
  } else {
    errorBtn.hidden = true;
    errorBtn.onclick = null;
  }
  showState('error');
}

// --------------------------------------------------------------------- streaming

let activePort = null;          // current chrome.runtime.Port, or null
let streamedText = '';          // accumulated text so far
let streamedMeta = null;        // { videoId, model, provider, title, channel }
let rerenderScheduled = false;  // microtask batching for renderProgress
let lastResult = null;          // full result object — used for export
// Per (source + kind + settings) result cache so toggling Summary ⇄ Timestamps
// (or back) re-shows the computed result instantly instead of re-running.
const resultCache = new Map();

function cancelActiveStream() {
  if (activePort) {
    try { activePort.disconnect(); } catch (_) {}
    activePort = null;
  }
  setStreamingUI(false);
}

function setStreamingUI(streaming) {
  if (!stopBtn || !regenBtn) return;
  stopBtn.hidden  = !streaming;
  regenBtn.hidden =  streaming;
}

function scheduleRerender(kind) {
  if (rerenderScheduled) return;
  rerenderScheduled = true;
  requestAnimationFrame(() => {
    rerenderScheduled = false;
    renderProgress(kind);
  });
}

function renderProgress(kind) {
  const videoId = streamedMeta && streamedMeta.videoId;
  // Show a soft "▍" cursor while streaming.
  const html = renderMarkdown(streamedText, videoId) + '<span class="ais-cursor">▍</span>';
  resultBody.innerHTML = html;
}

// Renders timestamp lines like "MM:SS — description" as cards with a time pill
// and the description text, mimicking the cleaner UX pattern competitors use.
function renderTimestampCards(text, videoId) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const cards = [];
  for (const line of lines) {
    // Strip leading "- ", "• ", "* ", or digit-dot bullets
    const cleaned = line.replace(/^[-•*]\s+|^\d+\.\s+/, '');
    const m = cleaned.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*[—\-:]\s*(.+)$/);
    if (m) {
      const ts = m[1];
      const desc = m[2].trim();
      const sec = ts.split(':').reduce((a, b) => a * 60 + parseInt(b, 10), 0);
      const href = videoId ? `https://www.youtube.com/watch?v=${videoId}&t=${sec}s` : null;
      cards.push({ ts, desc, href, sec });
    }
  }
  if (!cards.length) return null;   // fall back to markdown rendering

  return cards.map((c) => `
    <div class="ts-card">
      ${c.href
        ? `<a class="ts-pill" href="${c.href}" data-seconds="${c.sec}" target="_blank" rel="noopener">${escHTML(c.ts)}</a>`
        : `<span class="ts-pill">${escHTML(c.ts)}</span>`}
      <div class="ts-text">${escHTML(c.desc)}</div>
    </div>
  `).join('');
}

// Timestamp clicks: when the panel is embedded on the video page, seek the player
// in place (relayed via the parent content script) instead of opening a new tab.
function onTimestampClick(e) {
  const a = e.target && e.target.closest && e.target.closest('a.ts, a.ts-pill');
  if (!a) return;
  const sec = parseInt(a.dataset.seconds || '', 10);
  if (Number.isNaN(sec)) return;
  if (window !== window.top) {
    e.preventDefault();
    try { window.parent.postMessage({ type: 'AIS_SEEK', seconds: sec }, '*'); } catch (_) {}
  }
  // Standalone popup: fall through — the href opens the video at that time.
}
if (resultBody) resultBody.addEventListener('click', onTimestampClick);
if (chatHistory) chatHistory.addEventListener('click', onTimestampClick);

function renderFinal(result, kind) {
  lastResult = result;
  resultHeader.textContent = t(kind === 'timestamps' ? 'timestampsHeader' : 'summaryHeader');
  const m = result.meta || {};
  const provider = result.provider ? result.provider.toUpperCase() : '';
  resultMeta.textContent = [m.title, provider && '· ' + provider, result.model && '· ' + result.model].filter(Boolean).join(' ');
  // For timestamps mode, render as cards. For summary, use Markdown.
  if (kind === 'timestamps') {
    const cards = renderTimestampCards(result.text, result.videoId);
    resultBody.innerHTML = cards || renderMarkdown(result.text, result.videoId);
  } else {
    resultBody.innerHTML = renderMarkdown(result.text, result.videoId);
  }

  // Reflect bookmark state on the icon
  isBookmarked(result).then((on) => bookmarkBtn.classList.toggle('is-on', on));

  // Activate Q&A chat
  currentSourceKey = result.videoId ? ('vid:' + result.videoId)
                  : result.url      ? ('url:' + result.url)
                  : null;
  currentSourceKind = result.sourceKind || 'webpage';
  if (currentSourceKey) {
    chatBox.hidden = false;
    chatHistory.innerHTML = '';
    chatInput.value = '';
    chatInput.disabled = false;
    chatSendBtn.disabled = false;
    loadSuggestions();
  } else {
    chatBox.hidden = true;
  }
}

// ---------------------------------------------------------------------- chat

let currentSourceKey  = null;
let currentSourceKind = 'webpage';
let suggestionsLoadedFor = null;   // source key we've already fetched starter questions for
let chatStreamingBubble = null;
let chatActivePort = null;

function addBubble(role, html) {
  const b = document.createElement('div');
  b.className = 'bubble ' + role + (role === 'assistant' ? ' markdown' : '');
  b.innerHTML = html;
  chatHistory.appendChild(b);
  chatHistory.scrollTop = chatHistory.scrollHeight;
  return b;
}

function sendChatQuestion(question) {
  if (!currentSourceKey) return;
  if (chatActivePort) { try { chatActivePort.disconnect(); } catch (_) {} chatActivePort = null; }

  // User bubble (plain text — no markdown)
  addBubble('user', escHTML(question));
  chatInput.value = '';
  chatInput.disabled  = true;
  chatSendBtn.disabled = true;

  // Assistant bubble (streaming target)
  chatStreamingBubble = addBubble('assistant', '');
  chatStreamingBubble.classList.add('is-streaming');
  let acc = '';

  const port = chrome.runtime.connect({ name: 'ais-stream' });
  chatActivePort = port;
  port.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === 'AIS_CHAT_START') { /* nothing — already showed empty bubble */ return; }
    if (msg.type === 'AIS_CHAT_DELTA') {
      acc += (msg.text || '');
      chatStreamingBubble.innerHTML = renderMarkdown(acc, videoIdForLinks());
      chatHistory.scrollTop = chatHistory.scrollHeight;
      return;
    }
    if (msg.type === 'AIS_CHAT_DONE') {
      chatStreamingBubble.innerHTML = renderMarkdown(msg.text || acc, videoIdForLinks());
      chatStreamingBubble.classList.remove('is-streaming');
      chatStreamingBubble = null;
      chatActivePort = null;
      chatInput.disabled  = false;
      chatSendBtn.disabled = false;
      chatInput.focus();
      refreshSuggestions();   // evolve the starter questions after each answer
      return;
    }
    if (msg.type === 'AIS_ERR') {
      if (msg.code === 'NO_CONTEXT') {
        chatStreamingBubble.textContent = t('chatNoContext');
      } else if (msg.code === 'PRO_REQUIRED') {
        chatStreamingBubble.textContent = t('errorProRequired');
      } else {
        chatStreamingBubble.textContent = msg.error || t('errorGeneric');
      }
      chatStreamingBubble.classList.remove('is-streaming');
      chatStreamingBubble.classList.add('user');         // visually flag as error
      chatStreamingBubble.classList.remove('assistant');
      chatStreamingBubble = null;
      chatActivePort = null;
      chatInput.disabled  = false;
      chatSendBtn.disabled = false;
    }
  });
  port.onDisconnect.addListener(() => {
    if (chatActivePort === port) chatActivePort = null;
  });

  port.postMessage({
    type:        'AIS_CHAT',
    sourceKey:   currentSourceKey,
    sourceKind:  currentSourceKind,
    question,
    language:    settings.language,
    modelKey:    settings.model,
    source:      settings.source || 'api',
  });
}

// Ask the model for a few content-specific starter questions and show them as
// clickable chips above the chat (mirrors — and beats — YouTube's native
// suggestions, since ours work on videos, articles and PDFs alike).
// Reset the once-per-source cache so a fresh set of starter questions loads —
// used after each Q&A answer so the chips keep evolving with the conversation.
function refreshSuggestions() {
  suggestionsLoadedFor = null;
  loadSuggestions();
}

function loadSuggestions() {
  if (!chatSuggest || !currentSourceKey) return;
  // Starter questions are about the source, not the kind — fetch them once per
  // source so toggling Summary ⇄ Timestamps doesn't burn extra API calls.
  if (suggestionsLoadedFor === currentSourceKey) return;
  suggestionsLoadedFor = currentSourceKey;
  const forKey = currentSourceKey;
  chatSuggest.innerHTML = '';
  chatSuggest.hidden = true;
  chrome.runtime.sendMessage({
    type:      'AIS_SUGGEST',
    sourceKey: currentSourceKey,
    modelKey:  settings.model,
    language:  settings.language,
    source:    settings.source || 'api',
  }, (resp) => {
    if (chrome.runtime.lastError) { if (suggestionsLoadedFor === forKey) suggestionsLoadedFor = null; return; }
    if (forKey !== currentSourceKey) return;               // a newer summary started
    if (!resp || !resp.ok || !Array.isArray(resp.questions) || !resp.questions.length) {
      if (suggestionsLoadedFor === forKey) suggestionsLoadedFor = null;   // allow a later retry
      return;
    }
    chatSuggest.innerHTML = '';
    resp.questions.forEach((q) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'suggest-chip';
      chip.textContent = q;
      chip.addEventListener('click', () => {
        if (chatActivePort) return;
        chatSuggest.hidden = true;
        suggestionsLoadedFor = null;   // allow a fresh set after this answer
        sendChatQuestion(q);
      });
      chatSuggest.appendChild(chip);
    });
    chatSuggest.hidden = false;
  });
}

function videoIdForLinks() {
  // Convert sourceKey back into a video id when applicable so timestamps in
  // chat replies get clickable links.
  if (currentSourceKey && currentSourceKey.startsWith('vid:')) {
    return currentSourceKey.slice(4);
  }
  return null;
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = chatInput.value.trim();
  if (!q || chatActivePort) return;
  sendChatQuestion(q);
});

// PDF picker state — when user uploads a PDF from disk we cache the bytes here
let pendingPdf = null;   // { bytes: Uint8Array, name: string }

function cacheSig(kind, keysSig) {
  const srcId = pendingPdf
    ? ('pdf:' + (pendingPdf.name || '') + ':' + (pendingPdf.bytes ? pendingPdf.bytes.length : 0))
    : urlInput.value.trim();
  return [srcId, kind, settings.language, settings.length, settings.model,
          settings.templateId || 'standard', settings.source || 'api',
          // Which API keys are configured. Without this a model='auto' result
          // stays cached after the user adds/switches a key — even though 'auto'
          // now resolves to a different provider — so they'd see the stale
          // summary instead of a fresh run (the bug this fixes).
          keysSig || ''].join('|');
}

// Webpages / PDFs aren't in our static host_permissions. When the user asks to
// summarize one, request access to just that page's origin (optional permission,
// granted via a one-time Chrome prompt). Returns true (granted / already have
// it), false (denied), or 'file' for local file:// URLs (which we can't fetch).
async function ensureHostAccess(url) {
  let u;
  try { u = new URL(url); } catch (_) { return true; }
  if (u.protocol === 'file:') return 'file';
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return true;
  if (!chrome.permissions || !chrome.permissions.request) return true;
  try { return await chrome.permissions.request({ origins: [u.origin + '/*'] }); }
  catch (_) { return false; }
}

async function run(kind, opts) {
  const force = !!(opts && opts.force);
  lastRunCall = { kind, opts };
  const url = urlInput.value.trim();
  const det = pendingPdf ? { kind: 'pdf' } : detectKindLocal(url);
  if (det.kind === 'unknown' && !pendingPdf) {
    showError(t('errorGeneric') + ' (URL?)');
    return;
  }
  // v1.0.x free build: no sign-in flow exists. BYOK only.

  // Fingerprint the configured keys so a model='auto' cache entry is invalidated
  // when the user adds/switches a key (the provider 'auto' picks may change).
  let keysSig = '';
  try {
    const kNow = await getApiKeys();
    keysSig = (kNow.gemini ? 'g' : '') + (kNow.openai ? 'o' : '') + (kNow.anthropic ? 'a' : '');
  } catch (_) {}
  const runSig = cacheSig(kind, keysSig);

  // Instant cache hit — toggling Summary ⇄ Timestamps (same source & settings)
  // re-shows the prior result without re-fetching captions or re-calling the model.
  if (!force && resultCache.has(runSig)) {
    const hit = resultCache.get(runSig);
    cancelActiveStream();
    fallbackBanner.hidden = true;
    lastJob = { kind, payload: hit.payload };
    renderFinal(hit.result, kind);
    showState('result');
    return;
  }

  // Webpages and PDFs-by-URL need host access to read the page (we don't ship
  // <all_urls>). Request the page's origin on demand — a one-time prompt.
  if (!pendingPdf && (det.kind === 'webpage' || det.kind === 'pdf')) {
    const gate = await ensureHostAccess(url);
    if (gate === 'file') { showError(t('errorLocalFile')); return; }
    if (gate === false)  { showError(t('errorNoHostPermission')); return; }
  }

  cancelActiveStream();
  streamedText = '';
  streamedMeta = null;

  showState('loading');
  loadingLabel.textContent = t('loadingTranscript');

  const payload = {
    kind,
    url:          pendingPdf ? null : url,
    pdfBytes:     pendingPdf ? Array.from(pendingPdf.bytes) : null,  // serialize for messaging
    pdfName:      pendingPdf ? pendingPdf.name : null,
    pdfMode:      settings.pdfMode || 'gemini',
    language:     settings.language,
    length:       settings.length,
    modelKey:     settings.model,
    source:       (opts && opts.sourceOverride) || settings.source || 'api',
    browserProvider: settings.browserProvider || 'gemini',
    templateId:   settings.templateId || 'standard',
  };

  lastJob = { kind, payload };

  const port = chrome.runtime.connect({ name: 'ais-stream' });
  activePort = port;
  setStreamingUI(true);

  // Reset transient UI for a new run
  fallbackBanner.hidden = true;
  loadingProgress.hidden = true;
  loadingProgressBar.style.width = '0%';

  port.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === 'AIS_PHASE') {
      if (msg.phase === 'transcript') {
        loadingLabel.textContent = t('loadingTranscript');
        loadingProgress.hidden = true;
      }
      if (msg.phase === 'generate') {
        loadingLabel.textContent = t('loadingSummary');
        loadingProgress.hidden = true;
      }
      if (msg.phase === 'map') {
        loadingLabel.textContent = t('loadingChunk', ['0', '?']) || 'Analysing chunks…';
        loadingProgress.hidden = false;
      }
      if (msg.phase === 'synthesis') {
        loadingLabel.textContent = t('loadingSynthesis');
        loadingProgress.hidden = true;
      }
      return;
    }
    if (msg.type === 'AIS_CHUNKS') {
      const total = msg.total || 0;
      const done  = msg.done  || 0;
      loadingProgress.hidden = false;
      loadingProgressBar.style.width = total ? Math.round((done / total) * 100) + '%' : '0%';
      loadingLabel.textContent = t('loadingChunk', [String(done), String(total)])
                              || ('Analysing section ' + done + '/' + total + '…');
      return;
    }
    if (msg.type === 'AIS_META') {
      streamedMeta = msg.meta;
      resultHeader.textContent = t(kind === 'timestamps' ? 'timestampsHeader' : 'summaryHeader');
      const provider = msg.meta.provider ? msg.meta.provider.toUpperCase() : '';
      resultMeta.textContent = [msg.meta.title, provider && '· ' + provider, msg.meta.model && '· ' + msg.meta.model].filter(Boolean).join(' ');
      return;
    }
    if (msg.type === 'AIS_DELTA') {
      if (stateLoading.hidden === false) {
        // First delta — switch to result view.
        resultBody.innerHTML = '';
        showState('result');
      }
      streamedText += msg.text || '';
      scheduleRerender(kind);
      return;
    }
    if (msg.type === 'AIS_DONE') {
      if (msg.result) resultCache.set(runSig, { result: msg.result, payload });
      renderFinal(msg.result, kind);
      // Notify the user when the run fell back so they know which provider/mode
      // actually ran: pool→API, quota→another API key, or quota→browser-session.
      const fbVia = msg.result && msg.result.via;
      if (fbVia === 'api-fallback' || fbVia === 'api-alt' || fbVia === 'browser-fallback') {
        const provName = (msg.result.provider || '').toUpperCase();
        const bKey = fbVia === 'api-alt' ? 'bannerQuotaAltKey'
                   : fbVia === 'browser-fallback' ? 'bannerQuotaBrowser'
                   : 'bannerApiFallback';
        fallbackBanner.textContent = t(bKey, [provName]) || ('Switched to ' + provName);
        fallbackBanner.hidden = false;
      } else {
        fallbackBanner.hidden = true;
      }
      showState('result');
      activePort = null;
      setStreamingUI(false);
      return;
    }
    if (msg.type === 'AIS_ERR') {
      activePort = null;
      setStreamingUI(false);
      if (msg.code === 'NO_API_KEY') {
        showError(t('errorNoApiKey'), {
          label: t('saveSettings'),
          handler: () => chrome.runtime.sendMessage({ type: 'AIS_OPEN_OPTIONS' }),
        });
        return;
      }
      if (msg.code === 'BRIDGE_NOT_READY' || msg.code === 'BRIDGE_DOWN_NO_API_KEY') {
        showError(
          'Login to ' + (msg.provider || '') + ' first, then try again — or add an API key in settings.',
          { label: 'Open ' + (msg.provider || ''),
            handler: () => chrome.tabs.create({ url: msg.bridgeUrl || 'https://gemini.google.com/' }) }
        );
        return;
      }
      // In free release mode we never show the upsell modal — defensively swallow
      // Pro-tier errors and show a generic message instead (shouldn't happen since
      // the service worker also short-circuits these checks in free mode).
      if (msg.code === 'PRO_REQUIRED') {
        if (HAS_PRO) {
          showState('empty');
          openUpsell(msg.feature || FEATURES.PREMIUM_MODELS);
        } else {
          showError(msg.error || t('errorGeneric'));
        }
        return;
      }
      if (msg.code === 'QUOTA_EXCEEDED') {
        showError(t('errorQuotaExceeded'),
          HAS_PRO ? { label: t('btnUpgrade'), handler: () => openUpsell(FEATURES.PREMIUM_MODELS) } : null);
        return;
      }
      // The chosen API key hit its rate limit and there's no other key to fall
      // back to — offer the no-cost browser-session path (drives the user's
      // already-logged-in Gemini/ChatGPT/Claude tab) and re-run.
      if (msg.code === 'QUOTA_NO_ALT') {
        const secs = msg.retryAfter || 0;
        let m = t('errorQuotaNoAlt');
        if (secs) m += ' ' + t('retryInSeconds', [String(secs)]);
        showError(m, {
          label: t('btnSwitchBrowserRetry'),
          handler: () => run(lastRunCall.kind, { ...(lastRunCall.opts || {}), force: true, sourceOverride: 'browser' }),
        });
        return;
      }
      if (msg.code === 'VIDEO_TOO_LONG') {
        showError(t('errorVideoTooLong'),
          HAS_PRO ? { label: t('btnUpgrade'), handler: () => openUpsell(FEATURES.LONG_VIDEOS) } : null);
        return;
      }
      if (msg.code === 'TIMESTAMPS_NOT_AVAILABLE') {
        showError(t('errorTimestampsUnavailable'));
        return;
      }
      if (msg.code === 'PDF_REQUIRES_GEMINI') {
        showError(t('errorPdfNeedsGemini'));
        return;
      }
      if (msg.code === 'PDF_TOO_LARGE') {
        showError(t('errorPdfTooLarge'));
        return;
      }
      if (msg.code === 'PDFJS_MISSING') {
        showError(t('errorPdfjsMissing'));
        return;
      }
      const text = msg.error || t('errorGeneric');
      if (msg.code === 'CAPTIONS_BLOCKED') {
        showError(t('errorCaptionsBlocked'));
      } else if (/no-captions|NO_CAPTIONS|empty-transcript/.test(text)) {
        showError(t('errorNoTranscript'));
      } else {
        showError(text);
      }
    }
  });

  port.onDisconnect.addListener(() => {
    if (activePort === port) {
      activePort = null;
      setStreamingUI(false);
    }
  });

  port.postMessage({ type: 'AIS_RUN', payload });
}

// --------------------------------------------------------------------- buttons

runBtn.addEventListener('click', () => run('summary'));
tiles.forEach((tile) => {
  tile.addEventListener('click', () => {
    const proFeature = tile.dataset.proFeature;
    // Honor Pro gates only in full release mode.
    if (HAS_PRO && proFeature && !canUse(proFeature, currentTier)) {
      openUpsell(proFeature, tile.dataset.kind);
      return;
    }
    run(tile.dataset.kind);
  });
});

regenBtn.addEventListener('click', () => {
  if (lastJob) run(lastJob.kind, { force: true });   // bypass cache, recompute fresh
});

stopBtn.addEventListener('click', () => {
  cancelActiveStream();
  // Keep the partial text on screen so user can still copy what arrived.
  if (streamedText) {
    resultBody.innerHTML = renderMarkdown(streamedText, streamedMeta && streamedMeta.videoId);
    showState('result');
  }
});

function buildMarkdownExport(result, kind) {
  if (!result) return '';
  const m = result.meta || {};
  const headerKind = kind === 'timestamps' ? 'Timestamps'
                   : kind === 'comments'   ? 'Comments'
                   :                          'Summary';
  const parts = [];
  if (m.title) parts.push('# ' + m.title);
  const metaLine = [
    m.channel && `**${m.channel}**`,
    result.url || (result.videoId && `https://www.youtube.com/watch?v=${result.videoId}`),
    result.model && `_${result.model}_`,
    `_${headerKind}_`,
  ].filter(Boolean);
  if (metaLine.length) parts.push(metaLine.join(' · '));
  parts.push('');
  parts.push(result.text || '');
  parts.push('');
  parts.push('---');
  parts.push('_Generated by AI Summarizer_');
  return parts.join('\n');
}

function safeFilename(s) {
  return String(s || 'summary')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'summary';
}

copyBtn.addEventListener('click', async () => {
  try {
    // Copy as raw Markdown so users can paste into Notion / Obsidian / Bear.
    const md = lastResult ? buildMarkdownExport(lastResult, lastJob && lastJob.kind) : resultBody.innerText;
    await navigator.clipboard.writeText(md);
    const old = copyBtn.getAttribute('title');
    copyBtn.setAttribute('title', t('btnCopied'));
    setTimeout(() => copyBtn.setAttribute('title', old || ''), 1500);
  } catch (_) {}
});

downloadBtn.addEventListener('click', () => {
  if (!lastResult) return;
  const md = buildMarkdownExport(lastResult, lastJob && lastJob.kind);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFilename(lastResult.meta && lastResult.meta.title) + '.md';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

// Share menu — build and position the share menu for explicit share options
const shareMenu = document.createElement('div');
shareMenu.className = 'share-menu';
shareMenu.hidden = true;
document.body.appendChild(shareMenu);

function buildShareMenu() {
  const title = (lastResult.meta && lastResult.meta.title) || 'Summarized content';
  const sourceUrl = lastResult.url || (lastResult.videoId ? 'https://www.youtube.com/watch?v=' + lastResult.videoId : '');
  const text = (lastResult.meta && lastResult.meta.title) ? lastResult.meta.title : 'Check out this summary';

  const options = [
    {
      id: 'telegram',
      label: 'Telegram',
      i18nKey: 'shareMenuTelegram',
      icon: 'M23 1.5a11.88 11.88 0 0 0-7.46 2.32L2.92 9.45a1 1 0 0 0 .12 1.6l6.26 4.63a1 1 0 0 0 1.5-.86V6.33l5.24 3.89a1 1 0 0 0 1.5-.87V2.86a1 1 0 0 0-.54-.98 11.87 11.87 0 0 0-4.07-.38z',
      url: () => `https://t.me/share/url?url=${encodeURIComponent(sourceUrl)}&text=${encodeURIComponent(text)}`
    },
    {
      id: 'whatsapp',
      label: 'WhatsApp',
      i18nKey: 'shareMenuWhatsApp',
      icon: 'M17.47 14.28c-.5-.25-2.88-1.42-3.33-1.58-.45-.15-.78-.25-1.1.25-.33.5-1.27 1.58-1.56 1.9-.28.33-.58.37-1.08.12-1.27-.63-2.63-1.48-3.68-2.53-1-1-1.9-2.23-2.53-3.68-.25-.5-.21-.8.12-1.08.33-.28.79-.88 1.13-1.38.25-.33.33-.58.5-.9.16-.33.08-.62-.04-.87-.12-.25-1.1-2.65-1.5-3.63-.4-.95-.8-.82-1.1-.83h-1a2.06 2.06 0 0 0-1.46.63C2.16 2.63 1.5 3.3 1.5 5s.75 3.5 2.36 5.25 3.75 3.5 5.8 4.5c.7.4 1.2.66 1.6.85 1.3.65 2.5.58 3.4-.36.63-.68 1.3-1.68 1.75-2.28.25-.33.58-.25.9-.16.33.08 2.1 1 2.46 1.17.36.17.75.25.87.75.13.5 0 2-.25 2.5s-1.3 1-1.8 1.08-1.5.12-2.4-.4c-1.36-.77-2.5-1.77-3.5-2.88'
    },
    {
      id: 'twitter',
      label: 'X (Twitter)',
      i18nKey: 'shareMenuTwitter',
      icon: 'M18.5 2h3.5L13 10.5 23 22h-7.5L8.5 13.5 1 22H-2.5L9.5 9 0 2h7.5L13.5 8.5 20.5 2M16.5 20h2L6.5 4h-2',
      url: () => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text + ' ' + sourceUrl)}`
    },
    {
      id: 'facebook',
      label: 'Facebook',
      i18nKey: 'shareMenuFacebook',
      icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2m3.5 10.5h-2.5v8h-3v-8h-2v-3h2v-1.5c0-1.98.42-4.5 4-4.5h3v2.8h-2c-.5 0-.5.2-.5.8v1.4h3l-.5 3z',
      url: () => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(sourceUrl)}`
    },
    {
      id: 'email',
      label: 'Email',
      i18nKey: 'shareMenuEmail',
      icon: 'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
      url: () => `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text + '\n\n' + sourceUrl)}`
    },
    {
      id: 'copy',
      label: 'Copy link',
      i18nKey: 'shareMenuCopyLink',
      icon: 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z',
      action: async () => {
        try {
          await navigator.clipboard.writeText(sourceUrl);
          flashTitle(shareBtn, t('btnCopied'));
        } catch (_) {}
        shareMenu.hidden = true;
      }
    }
  ];

  shareMenu.innerHTML = options.map((opt) => {
    const localizedLabel = opt.i18nKey ? t(opt.i18nKey) : opt.label;
    return `
    <button class="share-menu-item" data-share-id="${opt.id}" type="button" title="${escHTML(localizedLabel)}">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
        <path d="${opt.icon}"/>
      </svg>
      <span>${escHTML(localizedLabel)}</span>
    </button>
  `;
  }).join('');

  // Attach click handlers
  options.forEach((opt) => {
    const btn = shareMenu.querySelector(`[data-share-id="${opt.id}"]`);
    if (btn) {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (opt.action) {
          await opt.action();
        } else if (opt.url) {
          try { window.open(opt.url(), '_blank', 'noopener'); } catch (_) {}
          shareMenu.hidden = true;
        }
      });
    }
  });
}

// Share button handler — try Web Share API first (desktop/native),
// fallback to explicit share menu for iframe context (YouTube card)
shareBtn.addEventListener('click', async (e) => {
  if (!lastResult) return;
  e.stopPropagation();

  const title = (lastResult.meta && lastResult.meta.title) || 'AI Summary';
  const sourceUrl = lastResult.url || (lastResult.videoId ? 'https://www.youtube.com/watch?v=' + lastResult.videoId : '');
  const summaryText = (lastResult.meta && lastResult.meta.title) ? lastResult.meta.title : 'Check out this summary';

  // In iframe context (YouTube card), skip navigator.share — it throws due to
  // cross-origin restrictions. Show the menu directly.
  const isIframe = window !== window.top;

  if (!isIframe && navigator.share) {
    try {
      await navigator.share({
        title,
        text: summaryText + (sourceUrl ? ' — ' + sourceUrl : ''),
        url: sourceUrl
      });
      return;
    } catch (_) { /* user canceled or not supported */ }
  }

  // Fallback: show explicit share menu with social links + copy
  buildShareMenu();
  const rect = shareBtn.getBoundingClientRect();
  shareMenu.style.position = 'fixed';
  shareMenu.style.top = (rect.bottom + 8) + 'px';
  shareMenu.style.right = (window.innerWidth - rect.right) + 'px';
  shareMenu.hidden = false;
});

function flashTitle(btn, text) {
  const old = btn.getAttribute('title');
  btn.setAttribute('title', text);
  setTimeout(() => btn.setAttribute('title', old || ''), 1500);
}

// Bookmark — toggle flag on the history entry itself. Reflect state from history store.
async function isBookmarked(result) {
  if (!result) return false;
  // Look for a matching history entry by video_id or url
  const { ais_history: list } = await chrome.storage.local.get('ais_history');
  if (!Array.isArray(list)) return false;
  const entry = findHistoryEntry(result, list);
  return entry ? !!entry.bookmarked : false;
}
function findHistoryEntry(result, list) {
  // Find history entry by matching video_id or url
  if (result.videoId) {
    return list.find((e) => e.video_id === result.videoId);
  }
  if (result.url) {
    return list.find((e) => e.url === result.url);
  }
  return null;
}
async function toggleBookmark(result) {
  const { ais_history: list } = await chrome.storage.local.get('ais_history');
  const entries = Array.isArray(list) ? list : [];
  const entry = findHistoryEntry(result, entries);

  if (entry) {
    // History entry exists — toggle its bookmarked flag
    entry.bookmarked = !entry.bookmarked;
    await chrome.storage.local.set({ ais_history: entries });
    return entry.bookmarked;
  }
  // History entry doesn't exist yet (result is fresh, not yet saved to history)
  // In this case we can't persist the bookmark flag to a non-existent entry.
  // The bookmark will be set once the result is saved to history by the service worker.
  return false;
}
bookmarkBtn.addEventListener('click', async () => {
  if (!lastResult) return;
  const added = await toggleBookmark(lastResult);
  bookmarkBtn.classList.toggle('is-on', added);
  flashTitle(bookmarkBtn, added ? t('bookmarkAdded') : t('bookmarkRemoved'));
});

settingsBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'AIS_OPEN_OPTIONS' });
});

historyBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('history/history.html') });
});

// Donate heart — visible only when donations are enabled (off during CWS review).
const donateBtn = $('donateBtn');
if (donateBtn) {
  if (DONATE && DONATE.enabled) {
    donateBtn.hidden = false;
    donateBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html#donate') });
    });
  } else {
    donateBtn.hidden = true;
  }
}

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') run('summary');
});
urlInput.addEventListener('input', () => {
  if (urlInput.value.trim()) {
    pendingPdf = null;
    updateSourceChip(urlInput.value.trim());
  } else {
    srcRow.hidden = true;
    setTimestampsVisible(true);
  }
});

pdfPickBtn.addEventListener('click', () => pdfFileInput.click());
pdfFileInput.addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  if (!f.name.toLowerCase().endsWith('.pdf') && f.type !== 'application/pdf') {
    showError('Not a PDF file');
    return;
  }
  const buf = await f.arrayBuffer();
  pendingPdf = { bytes: new Uint8Array(buf), name: f.name };
  urlInput.value = f.name;
  urlInput.disabled = true;
  srcLabel.textContent = t('srcPdf');
  const path = srcIcon.querySelector('path');
  if (path) path.setAttribute('d', sourceIconPath('pdf'));
  srcRow.hidden = false;
  setTimestampsVisible(false); // PDF is not a video
});
// Reset PDF picker if user clears the input
urlInput.addEventListener('focus', () => {
  if (pendingPdf && urlInput.value === pendingPdf.name) {
    urlInput.disabled = false;
    urlInput.value = '';
    pendingPdf = null;
    srcRow.hidden = true;
  }
});

// --------------------------------------------------------------------- init

// When embedded as an iframe (YouTube card / floating panel), report our content
// height to the parent so it can size the panel to fit — compact when empty,
// taller once a summary renders — instead of a fixed 560px with blank space.
function reportHeightToParent() {
  if (window === window.top) return;     // only inside an embedding iframe
  let last = 0;
  const post = () => {
    // Measure the BODY's content height — document.documentElement.scrollHeight is
    // floored at the iframe viewport height, so it can only grow the card, never
    // shrink it back down to the actual content.
    let h = Math.ceil(document.body.scrollHeight);
    // An open dropdown is position:absolute and overflows the iframe (which is
    // sized to body height), so it'd be clipped — grow to include the lowest one.
    document.querySelectorAll('.menu:not([hidden]), .share-menu:not([hidden])').forEach((m) => {
      const bottom = Math.ceil(m.getBoundingClientRect().bottom);
      if (bottom > h) h = bottom + 10;
    });
    if (h && Math.abs(h - last) > 2) {
      last = h;
      try { window.parent.postMessage({ type: 'AIS_HEIGHT', height: h }, '*'); } catch (_) {}
    }
  };
  postHeight = post;
  try { new ResizeObserver(post).observe(document.body); } catch (_) {}
  window.addEventListener('load', post);
  post();
}

function detectEmbedContext() {
  const isEmbed = window !== window.top;
  // The side panel loads popup.html?panel=1 — stretch to fill the panel width,
  // same as the embedded YouTube iframe.
  const isPanel = new URLSearchParams(location.search).get('panel') === '1';
  if (isEmbed || isPanel) document.body.classList.add('embed');
  if (isPanel) document.body.classList.add('sidepanel');
  if (isEmbed) {
    // The base html,body rule sets min-height:520px — and body.embed only clears
    // it on <body>, leaving <html> at 520. That floor made the reported content
    // height ~520 so the card never shrank. Clear it on <html> too.
    document.documentElement.style.minHeight = '0';
    reportHeightToParent();
  }
}

function listenForThemeMessages() {
  window.addEventListener('message', (e) => {
    if (e && e.data && e.data.type === 'AIS_THEME') {
      document.body.classList.toggle('dark', !!e.data.dark);
      return;
    }
    // Listen for URL updates from the parent page (e.g., YouTube Shorts watcher)
    if (e && e.data && e.data.type === 'AIS_URL' && typeof e.data.url === 'string') {
      // Update the URL input field to the new short's URL
      urlInput.value = e.data.url;
      updateSourceChip(e.data.url);
      // Clear any stale result/error state so user can summarize the new short
      cancelActiveStream();
      showState('empty');
      fallbackBanner.hidden = true;
      chatBox.hidden = true;
      return;
    }
  });
  // Also apply system preference as a default for the standalone popup.
  if (window === window.top && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    document.body.classList.toggle('dark', mq.matches);
    mq.addEventListener && mq.addEventListener('change', (e) => document.body.classList.toggle('dark', e.matches));
  }
}

// Wire the menu chips SYNCHRONOUSLY at module load — never inside the async
// init(). wireMenu only attaches the chip-toggle + delegated menu-item click
// handlers (it does not need settings or menu content), so doing it eagerly
// guarantees the chips respond immediately and survive any failure in init().
// In free release mode everyone is treated as Pro, so unlock up front.
if (!HAS_PRO) currentTier = 'pro';
wireMenu(langChip,     langMenu,     'language');
wireMenu(lengthChip,   lengthMenu,   'length');
wireMenu(modelChip,    modelMenu,    'model');
wireMenu(templateChip, templateMenu, 'templateId');

async function init() {
  try {
    detectEmbedContext();
    listenForThemeMessages();
    settings = { ...DEFAULT_SETTINGS, ...(await getSettings().catch(() => ({}))) };
    await applyUiLocale();   // load the UI locale derived from the chosen language
    buildLangMenu();
    buildModelMenu();
    await buildTemplateMenu().catch(() => {});
    updateChips();
    await prefillFromActiveTab().catch(() => {});

    if (HAS_PRO) {
      // Pro builds: resolve real tier; free builds already set 'pro' above.
      try { const ts = await getTierStatus(); currentTier = ts.tier || 'free'; } catch (_) {}
    }
    applyTierToUI();
    if (urlInput.value) updateSourceChip(urlInput.value);
  } catch (e) {
    // Never let an init failure leave the popup half-dead — log and move on.
    console.error('[AIS] popup init failed:', e);
  }
}

init();
