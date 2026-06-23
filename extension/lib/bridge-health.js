// Tracks per-provider browser-bridge health.
//
// Each provider keeps a small struct:
//   { failStreak: number, lastErr: string|null, lastFailAt: number,
//     lastOkAt: number, mutedUntil: number }
//
// • After 2 consecutive failures, the provider is "muted" for 4h —
//   the orchestrator will skip the bridge and try API instead. (Short window
//   so a transient site/DOM hiccup doesn't lock the bridge out for a whole day.)
// • Any success resets the failStreak and clears the mute.
// • The user can manually re-test via the options page (resetHealth()).

const KEY = 'ais_bridge_health';
const MUTE_AFTER_FAILS = 2;
const MUTE_MS          = 4 * 60 * 60 * 1000;

function blank() {
  return { failStreak: 0, lastErr: null, lastFailAt: 0, lastOkAt: 0, mutedUntil: 0 };
}

export async function getHealth() {
  const { [KEY]: h } = await chrome.storage.local.get(KEY);
  return h || {};
}

export async function getProviderHealth(provider) {
  const h = await getHealth();
  return h[provider] || blank();
}

async function saveProviderHealth(provider, next) {
  const h = await getHealth();
  h[provider] = next;
  await chrome.storage.local.set({ [KEY]: h });
  return next;
}

export async function recordSuccess(provider) {
  return saveProviderHealth(provider, {
    failStreak: 0,
    lastErr:    null,
    lastFailAt: 0,
    lastOkAt:   Date.now(),
    mutedUntil: 0,
  });
}

export async function recordFailure(provider, err) {
  const cur = await getProviderHealth(provider);
  const failStreak = (cur.failStreak || 0) + 1;
  const mutedUntil = failStreak >= MUTE_AFTER_FAILS ? Date.now() + MUTE_MS : cur.mutedUntil || 0;
  return saveProviderHealth(provider, {
    failStreak,
    lastErr:    String(err && err.message || err || 'unknown'),
    lastFailAt: Date.now(),
    lastOkAt:   cur.lastOkAt || 0,
    mutedUntil,
  });
}

export async function isMuted(provider) {
  const h = await getProviderHealth(provider);
  return h.mutedUntil > Date.now();
}

export async function resetHealth(provider) {
  if (provider) {
    return saveProviderHealth(provider, blank());
  }
  await chrome.storage.local.set({ [KEY]: {} });
}
