// Thin Supabase Auth client. Talks directly to /auth/v1/* REST endpoints
// so we don't have to bundle @supabase/supabase-js into the extension.
import { SUPABASE_URL, SUPABASE_ANON, getOAuthRedirect } from './config.js';

const SESSION_KEY = 'ais_session';

function authUrl(path, params) {
  const u = new URL(SUPABASE_URL + '/auth/v1' + path);
  if (params) Object.entries(params).forEach(([k, v]) => v != null && u.searchParams.set(k, v));
  return u.toString();
}

function headers(token) {
  const h = {
    'apikey':        SUPABASE_ANON,
    'Content-Type':  'application/json',
  };
  if (token) h['Authorization'] = 'Bearer ' + token;
  return h;
}

async function jsonOrThrow(resp) {
  const text = await resp.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { /* not json */ }
  if (!resp.ok) {
    const msg = (data && (data.msg || data.error_description || data.error)) || ('HTTP ' + resp.status);
    const err = new Error(msg);
    err.status = resp.status;
    err.body = data;
    throw err;
  }
  return data;
}

async function storeSession(s) {
  if (!s) {
    await chrome.storage.local.remove(SESSION_KEY);
    return null;
  }
  const session = {
    access_token:  s.access_token,
    refresh_token: s.refresh_token,
    expires_at:    s.expires_at || (Date.now() / 1000 + (s.expires_in || 3600)),
    user:          s.user || null,
  };
  await chrome.storage.local.set({ [SESSION_KEY]: session });
  return session;
}

export async function getSession() {
  const { [SESSION_KEY]: s } = await chrome.storage.local.get(SESSION_KEY);
  if (!s) return null;
  // refresh if within 60s of expiry
  if (s.expires_at && s.expires_at * 1000 < Date.now() + 60_000) {
    try {
      return await refreshSession(s.refresh_token);
    } catch (e) {
      await storeSession(null);
      return null;
    }
  }
  return s;
}

export async function refreshSession(refresh_token) {
  const resp = await fetch(authUrl('/token', { grant_type: 'refresh_token' }), {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ refresh_token }),
  });
  const data = await jsonOrThrow(resp);
  return storeSession(data);
}

export async function signUpEmail(email, password) {
  const resp = await fetch(authUrl('/signup'), {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, password }),
  });
  const data = await jsonOrThrow(resp);
  // If email confirmation is required, there's no access_token yet.
  if (data && data.access_token) await storeSession(data);
  return data;
}

export async function signInEmail(email, password) {
  const resp = await fetch(authUrl('/token', { grant_type: 'password' }), {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, password }),
  });
  const data = await jsonOrThrow(resp);
  return storeSession(data);
}

export async function signInWithGoogle() {
  const redirect = getOAuthRedirect();
  const url = authUrl('/authorize', {
    provider:    'google',
    redirect_to: redirect,
  });

  const responseUrl = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive: true }, (r) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!r) return reject(new Error('No response from OAuth flow'));
      resolve(r);
    });
  });

  // Supabase returns tokens in the URL fragment: #access_token=...&refresh_token=...
  const hash = new URL(responseUrl).hash.slice(1);
  const params = new URLSearchParams(hash);
  const access_token  = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  const expires_in    = parseInt(params.get('expires_in') || '3600', 10);

  if (!access_token || !refresh_token) {
    const err = params.get('error_description') || params.get('error') || 'OAuth flow returned no tokens';
    throw new Error(err);
  }

  // Fetch user info
  const userResp = await fetch(authUrl('/user'), { headers: headers(access_token) });
  const user = await jsonOrThrow(userResp);

  return storeSession({ access_token, refresh_token, expires_in, user });
}

export async function signOut() {
  const s = await getSession();
  if (s && s.access_token) {
    try {
      await fetch(authUrl('/logout'), { method: 'POST', headers: headers(s.access_token) });
    } catch (_) { /* best effort */ }
  }
  await storeSession(null);
}

export async function getUser() {
  const s = await getSession();
  return s ? s.user : null;
}
