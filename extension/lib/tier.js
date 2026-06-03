// Resolves the current user's tier (free / pro) by polling the me_status view
// in Supabase. Caches the result in chrome.storage for fast popup boot.
import { SUPABASE_URL, SUPABASE_ANON } from './config.js';
import { getSession } from './supabase.js';

const CACHE_KEY    = 'ais_tier_cache';
const CACHE_TTL_MS = 60 * 1000; // re-check tier at most once a minute

const DEFAULT_STATUS = {
  tier:                  'free',
  status:                'free',
  plan:                  null,
  current_period_end:    null,
  cancel_at_period_end:  false,
  trial_ends_at:         null,
  month_usage:           0,
  year_month:            null,
};

export async function getTierStatus(forceFresh) {
  if (!forceFresh) {
    const { [CACHE_KEY]: c } = await chrome.storage.local.get(CACHE_KEY);
    if (c && c.fetchedAt && Date.now() - c.fetchedAt < CACHE_TTL_MS) {
      return c.status;
    }
  }
  const s = await getSession();
  if (!s || !s.access_token) {
    const status = { ...DEFAULT_STATUS, tier: 'free' };
    await chrome.storage.local.set({ [CACHE_KEY]: { status, fetchedAt: Date.now() } });
    return status;
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/me_status?select=*`, {
      headers: {
        'apikey':         SUPABASE_ANON,
        'Authorization':  'Bearer ' + s.access_token,
      },
    });
    if (!r.ok) throw new Error('me_status HTTP ' + r.status);
    const rows = await r.json();
    const row  = (rows && rows[0]) || DEFAULT_STATUS;
    const status = {
      tier:                 row.tier || 'free',
      status:               row.status || 'free',
      plan:                 row.plan || null,
      current_period_end:   row.current_period_end || null,
      cancel_at_period_end: !!row.cancel_at_period_end,
      trial_ends_at:        row.trial_ends_at || null,
      month_usage:          row.month_usage || 0,
      year_month:           row.year_month || null,
    };
    await chrome.storage.local.set({ [CACHE_KEY]: { status, fetchedAt: Date.now() } });
    return status;
  } catch (e) {
    console.warn('[AIS] tier fetch failed, falling back to free:', e);
    return { ...DEFAULT_STATUS, tier: 'free' };
  }
}

export async function invalidateTierCache() {
  await chrome.storage.local.remove(CACHE_KEY);
}

// Daily counter for free pooled-API usage. Reset by date string.
const DAY_KEY = 'ais_day_usage';
export async function getDayUsage() {
  const today = new Date().toISOString().slice(0, 10);
  const { [DAY_KEY]: d } = await chrome.storage.local.get(DAY_KEY);
  if (d && d.day === today) return d.count || 0;
  return 0;
}
export async function bumpDayUsage() {
  const today = new Date().toISOString().slice(0, 10);
  const { [DAY_KEY]: d } = await chrome.storage.local.get(DAY_KEY);
  const next = (d && d.day === today ? (d.count || 0) : 0) + 1;
  await chrome.storage.local.set({ [DAY_KEY]: { day: today, count: next } });
  return next;
}
