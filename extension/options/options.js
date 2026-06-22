import { getSettings, setSettings, getApiKeys, setApiKeys } from '../lib/ai-api.js';
import { getSession, signOut } from '../lib/supabase.js';
import { LANGUAGES, DEFAULT_SETTINGS, SUPABASE_URL, SUPABASE_ANON, BILLING_PROVIDER, RELEASE_MODE, HAS_SUPABASE, HAS_PRO, DONATE } from '../lib/config.js';
import { getHealth, resetHealth } from '../lib/bridge-health.js';
import { getTierStatus, invalidateTierCache } from '../lib/tier.js';
import { PRO_MONTHLY_POOL_LIMIT, FREE_DAILY_POOL_LIMIT } from '../lib/features.js';
import { BUILTIN_TEMPLATES, getUserTemplates, saveUserTemplate, deleteUserTemplate } from '../lib/templates.js';

const t = (k) => chrome.i18n.getMessage(k) || k;
const $ = (id) => document.getElementById(id);

const langSel    = $('defaultLanguage');
const lenSel     = $('defaultLength');
const modelSel   = $('defaultModel');
const sourceRadios = document.querySelectorAll('input[name=source]');
const geminiKey    = $('geminiKey');
const openaiKey    = $('openaiKey');
const anthropicKey = $('anthropicKey');
const saveBtn      = $('saveBtn');
const savedMsg     = $('savedMsg');
const signInBtn    = $('signInBtn');
const signOutBtn   = $('signOutBtn');
const accountInfo  = $('accountInfo');

function fillLanguageOptions() {
  langSel.innerHTML = '';
  LANGUAGES.forEach((l) => {
    const o = document.createElement('option');
    o.value = l.code;
    o.textContent = l.label;
    langSel.appendChild(o);
  });
}

async function loadAll() {
  // Account
  const s = await getSession();
  if (s && s.user) {
    accountInfo.textContent = s.user.email || s.user.id;
    signInBtn.hidden = true;
    signOutBtn.hidden = false;
  } else {
    accountInfo.textContent = t('errorAuth');
    signInBtn.hidden = false;
    signOutBtn.hidden = true;
  }

  // Settings
  const settings = { ...DEFAULT_SETTINGS, ...(await getSettings()) };
  langSel.value    = settings.language;
  lenSel.value     = settings.length;
  modelSel.value   = settings.model;
  sourceRadios.forEach((r) => { r.checked = (r.value === (settings.source || 'api')); });

  // Keys
  const keys = await getApiKeys();
  geminiKey.value    = keys.gemini    || '';
  openaiKey.value    = keys.openai    || '';
  anthropicKey.value = keys.anthropic || '';
}

async function saveAll() {
  const chosenSource = Array.from(sourceRadios).find((r) => r.checked)?.value || 'api';
  await setSettings({
    language: langSel.value,
    length:   lenSel.value,
    model:    modelSel.value,
    source:   chosenSource,
  });
  await setApiKeys({
    gemini:    geminiKey.value.trim()    || null,
    openai:    openaiKey.value.trim()    || null,
    anthropic: anthropicKey.value.trim() || null,
  });
  savedMsg.hidden = false;
  setTimeout(() => savedMsg.hidden = true, 1500);
}

saveBtn.addEventListener('click', saveAll);

// Sign-in entry was removed in v1.0.x free build — no auth flow exists.
signInBtn?.addEventListener('click', () => { /* no-op */ });
signOutBtn?.addEventListener('click', async () => { await signOut(); loadAll(); });

// --------------------------------------------------------------------- bridges

async function paintBridgeStatuses() {
  const health = await getHealth();
  document.querySelectorAll('.bridge-row').forEach((row) => {
    const provider = row.dataset.provider;
    const statusEl = row.querySelector('[data-status]');
    const h = health[provider];
    statusEl.classList.remove('ok', 'fail', 'muted', 'testing');
    if (!h || (!h.lastOkAt && !h.lastFailAt)) {
      statusEl.textContent = '—';
      return;
    }
    if (h.mutedUntil && h.mutedUntil > Date.now()) {
      statusEl.textContent = t('bridgeMuted');
      statusEl.classList.add('muted');
      statusEl.title = h.lastErr || '';
      return;
    }
    if (h.lastOkAt && h.lastOkAt >= (h.lastFailAt || 0)) {
      statusEl.textContent = t('bridgeOk');
      statusEl.classList.add('ok');
      statusEl.title = '';
    } else {
      statusEl.textContent = t('bridgeFail');
      statusEl.classList.add('fail');
      statusEl.title = h.lastErr || '';
    }
  });
}

document.querySelectorAll('.bridge-row [data-test]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const row = btn.closest('.bridge-row');
    const provider = row.dataset.provider;
    const statusEl = row.querySelector('[data-status]');
    statusEl.classList.remove('ok', 'fail', 'muted');
    statusEl.classList.add('testing');
    statusEl.textContent = t('testing');
    btn.disabled = true;
    // Reset mute so this run isn't auto-skipped by the orchestrator.
    await resetHealth(provider);
    try {
      const resp = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'AIS_TEST_BRIDGE', provider }, (r) => {
          if (chrome.runtime.lastError) return resolve({ ok: false, error: chrome.runtime.lastError.message });
          resolve(r || { ok: false, error: 'no response' });
        });
      });
      statusEl.classList.remove('testing');
      if (resp.ok) {
        statusEl.textContent = t('bridgeOk');
        statusEl.classList.add('ok');
        statusEl.title = (resp.sample || '');
      } else {
        statusEl.textContent = t('bridgeFail');
        statusEl.classList.add('fail');
        statusEl.title = resp.error || '';
      }
    } finally {
      btn.disabled = false;
    }
  });
});

// --------------------------------------------------------------------- billing

const planBadge       = document.getElementById('planBadge');
const renewalRow      = document.getElementById('renewalRow');
const renewalLabel    = document.getElementById('renewalLabel');
const renewalValue    = document.getElementById('renewalValue');
const usageValue      = document.getElementById('usageValue');
const usageQuota      = document.getElementById('usageQuota');
const upgradeBtn      = document.getElementById('upgradeBtn');
const manageBillingBtn = document.getElementById('manageBillingBtn');

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(); } catch (_) { return iso; }
}

async function paintBilling() {
  const session = await getSession();
  if (!session) {
    planBadge.textContent = '—';
    planBadge.className = 'plan-badge';
    upgradeBtn.hidden = true;
    manageBillingBtn.hidden = true;
    renewalRow.hidden = true;
    return;
  }

  const tier = await getTierStatus(true);
  const isPro      = tier.tier === 'pro';
  const isTrial    = tier.status === 'trialing';
  const isCanceled = tier.status === 'canceled' || tier.cancel_at_period_end;

  if (isPro) {
    if (isTrial) {
      const trialEnd = tier.trial_ends_at ? new Date(tier.trial_ends_at) : null;
      const daysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd - Date.now()) / 86400000)) : null;
      const label = daysLeft != null
        ? (daysLeft === 0 ? t('trialEndsToday') : (chrome.i18n.getMessage('trialDaysLeft', [String(daysLeft)]) || `Trial: ${daysLeft}d left`))
        : t('planTrialing');
      planBadge.textContent = label;
      planBadge.className = 'plan-badge trial';
    } else if (isCanceled) {
      planBadge.textContent = t('planCanceled');
      planBadge.className = 'plan-badge canceled';
    } else {
      planBadge.textContent = t('planPro') + (tier.plan === 'yearly' ? ' (Yearly)' : ' (Monthly)');
      planBadge.className = 'plan-badge pro';
    }
    upgradeBtn.hidden = true;
    manageBillingBtn.hidden = false;
    usageQuota.textContent = PRO_MONTHLY_POOL_LIMIT;
  } else {
    planBadge.textContent = t('planFree');
    planBadge.className = 'plan-badge free';
    upgradeBtn.hidden = false;
    manageBillingBtn.hidden = true;
    usageQuota.textContent = FREE_DAILY_POOL_LIMIT + '/day';
  }

  usageValue.textContent = tier.month_usage || 0;

  const renewDate = tier.current_period_end || tier.trial_ends_at;
  if (renewDate) {
    renewalRow.hidden = false;
    renewalLabel.textContent = isCanceled ? t('endsOn') : t('renewsOn');
    renewalValue.textContent = fmtDate(renewDate);
  } else {
    renewalRow.hidden = true;
  }
}

// Route through whichever billing provider is configured. The Edge Function
// names follow the pattern `${BILLING_PROVIDER}-checkout` / `${...}-portal`.
function billingFn(name) {
  return `${SUPABASE_URL}/functions/v1/${BILLING_PROVIDER}-${name}`;
}

async function openCheckout(plan) {
  // Checkout is disabled in v1.0.x free build — no Pro tier exists.
  return;
  // eslint-disable-next-line no-unreachable
  const session = await getSession();
  const r = await fetch(billingFn('checkout'), {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + session.access_token,
      'apikey':         SUPABASE_ANON,
    },
    body: JSON.stringify({
      plan,                       // 'monthly' | 'yearly'
      returnUrl: location.href,
    }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    alert(`Checkout error: HTTP ${r.status}. Make sure ${BILLING_PROVIDER}-checkout is deployed.\n${txt.slice(0, 200)}`);
    return;
  }
  const data = await r.json();
  if (!data.url) {
    alert('Checkout error: ' + (data.error || 'response had no url'));
    return;
  }
  location.href = data.url;
}

async function openBillingPortal() {
  const session = await getSession();
  if (!session) return;
  const r = await fetch(billingFn('portal'), {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': 'Bearer ' + session.access_token,
      'apikey':         SUPABASE_ANON,
    },
    body: JSON.stringify({ returnUrl: location.href }),
  });
  if (!r.ok) {
    alert(`Portal error: HTTP ${r.status}`);
    return;
  }
  const data = await r.json();
  if (data.url) location.href = data.url;
}

upgradeBtn.addEventListener('click', () => {
  const url = new URL(location.href);
  const preselect = url.searchParams.get('upgrade') || 'yearly';
  openCheckout(preselect);
});
manageBillingBtn.addEventListener('click', openBillingPortal);

// --------------------------------------------------------------------- templates

const tplProBadge = document.getElementById('tplProBadge');
const tplList     = document.getElementById('tplList');
const tplAddBtn   = document.getElementById('tplAddBtn');
const tplEditor   = document.getElementById('tplEditor');
const tplName     = document.getElementById('tplName');
const tplBody     = document.getElementById('tplBody');
const tplSaveBtn  = document.getElementById('tplSaveBtn');
const tplCancelBtn= document.getElementById('tplCancelBtn');

let editingId = null;

async function paintTemplates() {
  const tier = await getTierStatus();
  const isPro = tier.tier === 'pro';
  tplProBadge.hidden = isPro;
  tplAddBtn.disabled = !isPro;
  tplAddBtn.title = isPro ? '' : t('errorProRequired');

  const user = await getUserTemplates();
  tplList.innerHTML = '';
  const all = [...BUILTIN_TEMPLATES.map((t) => ({ ...t, builtin: true })), ...user];
  for (const tpl of all) {
    const li = document.createElement('li');
    li.className = 'tpl-row' + (tpl.builtin ? ' builtin' : '');
    li.innerHTML = `
      <div>
        <div class="tpl-name">${escHTML(tpl.name)}</div>
        <div class="tpl-desc">${escHTML(tpl.description || '')}</div>
      </div>
      ${tpl.builtin ? `<span class="badge-builtin">built-in</span>` : `
        <button data-edit>${escHTML(t('btnEdit') || 'Edit')}</button>
        <button data-del class="danger">${escHTML(t('historyDelete') || 'Delete')}</button>`}`;
    if (!tpl.builtin) {
      li.querySelector('[data-edit]').addEventListener('click', () => openEditor(tpl));
      li.querySelector('[data-del]').addEventListener('click', async () => {
        if (!confirm(t('historyConfirmDelete'))) return;
        await deleteUserTemplate(tpl.id);
        paintTemplates();
      });
    }
    tplList.appendChild(li);
  }
}

function escHTML(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function openEditor(tpl) {
  editingId = tpl ? tpl.id : null;
  tplName.value = tpl ? tpl.name : '';
  tplBody.value = tpl ? tpl.body : BUILTIN_TEMPLATES[0].body;
  tplEditor.hidden = false;
  tplAddBtn.hidden = true;
  tplName.focus();
}

tplAddBtn.addEventListener('click', async () => {
  const tier = await getTierStatus();
  if (tier.tier !== 'pro') {
    alert(t('errorProRequired'));
    return;
  }
  openEditor(null);
});

tplCancelBtn.addEventListener('click', () => {
  tplEditor.hidden = true;
  tplAddBtn.hidden = false;
  editingId = null;
});

tplSaveBtn.addEventListener('click', async () => {
  const name = tplName.value.trim();
  const body = tplBody.value.trim();
  if (!name || !body) { alert('Name and body are required'); return; }
  const id = editingId || ('user-' + Date.now().toString(36));
  await saveUserTemplate({
    id, name,
    description: '',
    body,
  });
  tplEditor.hidden = true;
  tplAddBtn.hidden = false;
  editingId = null;
  paintTemplates();
});

// Hide Pro-only sections in free release mode
function applyReleaseGates() {
  const accountCard  = document.querySelector('section.card:nth-of-type(1)');
  const billingCard  = document.getElementById('billingCard');
  const templatesCard = document.getElementById('templatesCard');
  const sourceCard    = document.querySelector('section.card:nth-of-type(3)'); // "How to call AI"
  if (!HAS_PRO) {
    if (billingCard)  billingCard.hidden  = true;
    if (templatesCard) {
      // Templates UI is fine to keep visible but disable "+ Create" button
      const proBadge = document.getElementById('tplProBadge');
      if (proBadge) proBadge.hidden = true;
    }
    // Hide Pool source option (requires backend we haven't deployed)
    const poolRadio = document.querySelector('label.radio input[value="pool"]');
    if (poolRadio) poolRadio.closest('.radio').hidden = true;
  }
  if (!HAS_SUPABASE && accountCard) {
    accountCard.hidden = true;
  }
}

// --------------------------------------------------------------------- donate

function setupDonate() {
  const card = document.getElementById('donateCard');
  if (!card) return;
  if (!DONATE || !DONATE.enabled) { card.hidden = true; return; }
  card.hidden = false;

  const patreon = document.getElementById('donatePatreon');
  const paypal  = document.getElementById('donatePaypal');
  if (patreon) {
    if (DONATE.patreon && !DONATE.patreon.includes('YOUR_HANDLE')) patreon.href = DONATE.patreon;
    else patreon.style.display = 'none';
  }
  if (paypal) {
    if (DONATE.paypal) paypal.href = DONATE.paypal;
    else paypal.style.display = 'none';
  }

  const cryptoBox = document.getElementById('donateCrypto');
  if (cryptoBox) {
    cryptoBox.innerHTML = '';
    const coins = (DONATE.crypto && typeof DONATE.crypto === 'object') ? DONATE.crypto : {};
    for (const [coin, addr] of Object.entries(coins)) {
      if (!addr) continue;
      const row = document.createElement('div');
      row.className = 'crypto-row';
      row.innerHTML =
        '<span class="crypto-coin">' + escHTML(coin) + '</span>' +
        '<code class="crypto-addr">' + escHTML(addr) + '</code>' +
        '<button class="btn btn-ghost btn-sm crypto-copy" type="button">' + (t('btnCopy') || 'Copy') + '</button>';
      const btn = row.querySelector('.crypto-copy');
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(addr);
          const old = btn.textContent;
          btn.textContent = t('btnCopied') || 'Copied!';
          setTimeout(() => { btn.textContent = old; }, 1500);
        } catch (_) {}
      });
      cryptoBox.appendChild(row);
    }
  }
}

fillLanguageOptions();
loadAll();
paintBridgeStatuses();
applyReleaseGates();
if (HAS_PRO) paintBilling();
paintTemplates();
setupDonate();

// If user arrived via ?upgrade=monthly|yearly from the popup, auto-trigger checkout.
{
  const p = new URLSearchParams(location.search).get('upgrade');
  if (p === 'monthly' || p === 'yearly') {
    setTimeout(() => openCheckout(p), 400);
  }
}

// If user just returned from Stripe with ?status=success, refresh tier state.
if (new URLSearchParams(location.search).has('billing')) {
  invalidateTierCache().then(paintBilling);
}

// Welcome flow: if opened with ?welcome=1 just after install, scroll the API
// keys section (4th card) into view.
if (new URLSearchParams(location.search).has('welcome')) {
  setTimeout(() => {
    document.querySelector('.card:nth-of-type(4)')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 300);
}
