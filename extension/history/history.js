import { getSession } from '../lib/supabase.js';
import { SUPABASE_URL, SUPABASE_ANON, RELEASE_MODE, HAS_SUPABASE } from '../lib/config.js';
import { getTierStatus } from '../lib/tier.js';
import { getAll as getLocalHistory, deleteById as deleteLocalById, toggleBookmark } from '../lib/history-store.js';

const t = (k) => chrome.i18n.getMessage(k) || k;
const $ = (id) => document.getElementById(id);

const FREE_HISTORY_CAP = 10;

// ─── DOM ───
const searchBox       = $('searchBox');
const settingsBtn     = $('settingsBtn');
const entryList       = $('entryList');
const resultCount     = $('resultCount');
const emptyMsg        = $('emptyMsg');
const signinMsg       = $('signinMsg');
const freeUpsell      = $('freeUpsell');
const freeUpsellLink  = $('freeUpsellLink');
const loader          = $('loader');
const detailPlaceholder = $('detailPlaceholder');
const detailContent   = $('detailContent');
const detailKind      = $('detailKind');
const detailTitle     = $('detailTitle');
const detailMeta      = $('detailMeta');
const detailBody      = $('detailBody');
const openSourceBtn   = $('openSourceBtn');
const copyMdBtn       = $('copyMdBtn');
const dlMdBtn         = $('dlMdBtn');
const delBtn          = $('delBtn');

// ─── state ───
let allEntries = [];
let visible    = [];
let selectedId = null;
let kindFilter = '';
let bookmarkedFilter = '';
let q          = '';
let tier       = 'free';
let session    = null;

// ─── fetch (local-first, optional Supabase merge) ───
async function fetchHistory() {
  const local = await getLocalHistory();
  if (RELEASE_MODE !== 'full' || !HAS_SUPABASE || !session) return local;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/summaries?select=*&order=created_at.desc&limit=500`, {
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + session.access_token },
    });
    if (!r.ok) return local;
    const remote = await r.json();
    // Merge by (video_id|url) — newer wins
    const seen = new Set(local.map((e) => e.video_id || e.url));
    for (const r of remote) {
      const key = r.video_id || r.url;
      if (!seen.has(key)) { local.push(r); seen.add(key); }
    }
    local.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return local;
  } catch (_) { return local; }
}

async function deleteEntry(id) {
  // Always remove from local store
  await deleteLocalById(id);
  if (RELEASE_MODE !== 'full' || !HAS_SUPABASE || !session) return;
  // Remote rows have UUIDs — only attempt Supabase delete for those
  if (!String(id).startsWith('h-')) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/summaries?id=eq.${id}`, {
        method: 'DELETE',
        headers: { 'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + session.access_token },
      });
    } catch (_) {}
  }
}

// ─── render ───
function escHTML(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function renderMarkdown(md, videoId) {
  const lines = String(md || '').split('\n');
  const out = [];
  let inUl = false, inOl = false;
  const closeLists = () => { if (inUl) { out.push('</ul>'); inUl = false; } if (inOl) { out.push('</ol>'); inOl = false; } };
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
        return `${pre}<a class="ts" href="${u}" target="_blank" rel="noopener">${ts}</a>`;
      });
    }
    return s;
  }
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { closeLists(); continue; }
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.+)$/))) { closeLists(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    if (line.match(/^[-*]\s+/)) { if (!inUl) { closeLists(); out.push('<ul>'); inUl = true; } out.push('<li>' + inline(line.replace(/^[-*]\s+/, '')) + '</li>'); continue; }
    if (line.match(/^\d+\.\s+/)) { if (!inOl) { closeLists(); out.push('<ol>'); inOl = true; } out.push('<li>' + inline(line.replace(/^\d+\.\s+/, '')) + '</li>'); continue; }
    closeLists();
    out.push('<p>' + inline(line) + '</p>');
  }
  closeLists();
  return out.join('\n');
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const now = new Date();
  const diff = (now - d) / 86400000;
  if (diff < 1) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff < 7) return d.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString();
}

function kindOf(row) {
  if (row.timestamps_md) return 'timestamps';
  return 'summary';
}
function textOf(row) {
  return row.summary_md || row.timestamps_md || '';
}

function applyFilters() {
  const ql = q.trim().toLowerCase();
  visible = allEntries.filter((row) => {
    if (kindFilter && kindOf(row) !== kindFilter) return false;
    if (bookmarkedFilter === 'true' && !row.bookmarked) return false;
    if (!ql) return true;
    const hay = (row.video_title + ' ' + (row.video_channel || '') + ' ' + textOf(row)).toLowerCase();
    return hay.includes(ql);
  });

  resultCount.textContent = visible.length
    ? (chrome.i18n.getMessage('historyCount', [String(visible.length)]) || `${visible.length} entries`)
    : '';

  renderList();
}

function renderList() {
  entryList.innerHTML = '';
  if (!visible.length) {
    if (!allEntries.length) {
      emptyMsg.hidden = false;
      freeUpsell.hidden = true;
    }
    return;
  }
  emptyMsg.hidden = true;
  for (const row of visible) {
    const li = document.createElement('li');
    li.className = 'entry' + (row.id === selectedId ? ' is-active' : '');
    li.innerHTML = `
      <p class="entry-title">${escHTML(row.video_title || '(untitled)')}</p>
      <div class="entry-meta">
        <span class="badge">${escHTML(kindOf(row))}</span>
        <span>${escHTML(row.video_channel || '')}</span>
        <span style="margin-left:auto">${fmtDate(row.created_at)}</span>
      </div>
      <button class="bookmark-icon ${row.bookmarked ? 'is-on' : ''}" data-id="${escHTML(row.id)}" title="Toggle bookmark" aria-label="Toggle bookmark">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      </button>`;
    li.addEventListener('click', (e) => {
      if (e.target.closest('.bookmark-icon')) return;
      selectEntry(row.id);
    });
    const bookmarkBtn = li.querySelector('.bookmark-icon');
    bookmarkBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        row.bookmarked = await toggleBookmark(row.id);
        bookmarkBtn.classList.toggle('is-on', row.bookmarked);
      } catch (err) {
        console.error('Failed to toggle bookmark:', err);
      }
    });
    entryList.appendChild(li);
  }
  if (tier !== 'pro' && allEntries.length >= FREE_HISTORY_CAP) {
    freeUpsell.hidden = false;
  }
}

function selectEntry(id) {
  selectedId = id;
  const row = allEntries.find((r) => r.id === id);
  if (!row) return;
  detailPlaceholder.hidden = true;
  detailContent.hidden     = false;

  detailKind.textContent  = t(kindOf(row) === 'timestamps' ? 'tabTimestamps' : 'tabSummary');
  detailTitle.textContent = row.video_title || '(untitled)';
  detailMeta.textContent  = [row.video_channel, row.model, fmtDate(row.created_at)].filter(Boolean).join(' · ');
  detailBody.innerHTML    = renderMarkdown(textOf(row), row.video_id);

  if (row.video_id) {
    openSourceBtn.hidden = false;
    openSourceBtn.onclick = () => chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${row.video_id}` });
  } else {
    openSourceBtn.hidden = true;
  }

  copyMdBtn.onclick = async () => {
    await navigator.clipboard.writeText(buildExport(row));
    const old = copyMdBtn.textContent; copyMdBtn.textContent = t('btnCopied');
    setTimeout(() => copyMdBtn.textContent = old, 1500);
  };
  dlMdBtn.onclick = () => downloadMd(row);
  delBtn.onclick  = async () => {
    if (!confirm(t('historyConfirmDelete'))) return;
    try {
      await deleteEntry(row.id);
      allEntries = allEntries.filter((r) => r.id !== row.id);
      selectedId = null;
      detailContent.hidden = true;
      detailPlaceholder.hidden = false;
      applyFilters();
    } catch (e) {
      alert(e.message);
    }
  };

  renderList();
}

function buildExport(row) {
  const kindLabel = kindOf(row);
  return [
    '# ' + (row.video_title || ''),
    [row.video_channel && `**${row.video_channel}**`, row.video_id && `https://www.youtube.com/watch?v=${row.video_id}`, row.model && `_${row.model}_`, `_${kindLabel}_`].filter(Boolean).join(' · '),
    '',
    textOf(row),
    '',
    '---',
    `_${row.created_at} · AI Summarizer_`,
  ].join('\n');
}

function downloadMd(row) {
  const md = buildExport(row);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (row.video_title || 'summary').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80) + '.md';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── filter handlers ───
document.querySelectorAll('.chip[data-filter-kind]').forEach((c) => {
  c.addEventListener('click', () => {
    document.querySelectorAll('.chip[data-filter-kind]').forEach((x) => x.classList.remove('is-active'));
    c.classList.add('is-active');
    kindFilter = c.dataset.filterKind;
    bookmarkedFilter = c.dataset.filterBookmarked || '';
    applyFilters();
  });
});
let searchDebounce;
searchBox.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => { q = searchBox.value; applyFilters(); }, 150);
});

settingsBtn.addEventListener('click', () => location.href = chrome.runtime.getURL('options/options.html'));
freeUpsellLink.addEventListener('click', (e) => {
  e.preventDefault();
  location.href = chrome.runtime.getURL('options/options.html?upgrade=yearly');
});

// ─── init ───
async function init() {
  session = (RELEASE_MODE === 'full' && HAS_SUPABASE) ? await getSession() : null;

  // Free mode: history works without sign-in (everything is local).
  if (RELEASE_MODE === 'full' && HAS_SUPABASE) {
    const status = await getTierStatus();
    tier = status.tier || 'free';
  } else {
    tier = 'pro'; // free build doesn't enforce caps
  }

  loader.hidden = false;
  try {
    let entries = await fetchHistory();
    if (RELEASE_MODE === 'full' && tier !== 'pro' && entries.length > FREE_HISTORY_CAP) {
      entries = entries.slice(0, FREE_HISTORY_CAP);
    }
    allEntries = entries;
    if (!entries.length) emptyMsg.hidden = false;
    applyFilters();
  } catch (e) {
    emptyMsg.textContent = e.message;
    emptyMsg.hidden = false;
  } finally {
    loader.hidden = true;
  }
}
init();
