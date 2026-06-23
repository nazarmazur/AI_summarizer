// Local-first history store.
//
// Always saves to chrome.storage.local (works offline, no auth needed).
// Optionally also pushes to Supabase when configured + signed in (full mode).
//
// Storage shape: { ais_history: [ entry, entry, … ] } — newest first.

const KEY = 'ais_history';
const CAP = 50;

function nowIso() { return new Date().toISOString(); }

function entryFromResult(result) {
  return {
    id:            'h-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
    created_at:    nowIso(),
    kind:          result.kind || 'summary',
    source_kind:   result.sourceKind || (result.videoId ? 'youtube' : 'webpage'),
    video_id:      result.videoId  || null,
    url:           result.url      || null,
    video_title:   (result.meta && result.meta.title)   || '',
    video_channel: (result.meta && result.meta.channel) || '',
    language:      result.language || null,
    length:        result.length   || null,
    model:         result.model    || null,
    provider:      result.provider || null,
    summary_md:    result.kind === 'summary'    ? result.text : null,
    timestamps_md: result.kind === 'timestamps' ? result.text : null,
    bookmarked:    false,
  };
}

export async function getAll() {
  const { [KEY]: list } = await chrome.storage.local.get(KEY);
  return Array.isArray(list) ? list : [];
}

export async function saveResult(result) {
  if (!result || !result.text) return null;
  const list  = await getAll();
  const entry = entryFromResult(result);
  list.unshift(entry);
  while (list.length > CAP) list.pop();
  await chrome.storage.local.set({ [KEY]: list });
  return entry;
}

export async function deleteById(id) {
  const list = await getAll();
  const next = list.filter((e) => e.id !== id);
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export async function clearAll() {
  await chrome.storage.local.remove(KEY);
}

export async function toggleBookmark(id) {
  const list = await getAll();
  const entry = list.find((e) => e.id === id);
  if (!entry) return false;
  entry.bookmarked = !entry.bookmarked;
  await chrome.storage.local.set({ [KEY]: list });
  return entry.bookmarked;
}

export async function getBookmarked() {
  const list = await getAll();
  return list.filter((e) => e.bookmarked);
}
