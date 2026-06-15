import { setSettings, setApiKeys } from '../lib/ai-api.js';
import { getSession, signInWithGoogle } from '../lib/supabase.js';
import { RELEASE_MODE, HAS_SUPABASE, HAS_PRO } from '../lib/config.js';

// In free release mode the Pool option is hidden — we haven't deployed the
// ai-proxy Edge Function. Users pick API key or browser session only.
if (!HAS_PRO || !HAS_SUPABASE) {
  document.querySelectorAll('.choice[data-source="pool"]').forEach((el) => { el.hidden = true; });
  // Defensively hide the pool sign-in box too — no sign-up exists in v1 free build.
  const poolBox = document.getElementById('poolSignInBox');
  if (poolBox) poolBox.hidden = true;
  const onbGoogle = document.getElementById('onbGoogleBtn');
  if (onbGoogle) onbGoogle.disabled = true;
  const onbEmail = document.getElementById('onbEmailBtn');
  if (onbEmail) onbEmail.hidden = true;
}

const t = (k) => chrome.i18n.getMessage(k) || k;
const $ = (id) => document.getElementById(id);

let step = 1;
let chosenSource = null;

// --- step navigation ----------------------------------------------

function setStep(n) {
  step = Math.max(1, Math.min(4, n));
  document.querySelectorAll('.step').forEach((el) => {
    const s = parseInt(el.dataset.step, 10);
    el.classList.toggle('is-active', s === step);
    el.classList.toggle('is-done',   s <  step);
  });
  document.querySelectorAll('.step-pane').forEach((el) => {
    el.classList.toggle('is-active', parseInt(el.dataset.step, 10) === step);
  });
}

document.querySelectorAll('[data-next]').forEach((btn) => btn.addEventListener('click', async () => {
  if (step === 2) {
    const ok = await persistStep2();
    if (!ok) return;
  }
  setStep(step + 1);
}));
document.querySelectorAll('[data-prev]').forEach((btn) => btn.addEventListener('click', () => setStep(step - 1)));

// --- step 2: choice + sub-form ------------------------------------

const apiBox  = $('apiKeysBox');
const poolBox = $('poolSignInBox');

document.querySelectorAll('.choice').forEach((label) => {
  label.addEventListener('click', () => {
    document.querySelectorAll('.choice').forEach((l) => l.classList.remove('is-selected'));
    label.classList.add('is-selected');
    const src = label.dataset.source;
    chosenSource = src;
    label.querySelector('input').checked = true;
    apiBox.hidden  = src !== 'api';
    poolBox.hidden = src !== 'pool';
    refreshPoolBox();
  });
});

async function refreshPoolBox() {
  if (poolBox.hidden) return;
  const session = await getSession();
  if (session) {
    poolBox.innerHTML = `<p style="color:#15803d;margin:0;font-weight:500;">✓ ${session.user?.email || 'Signed in'}</p>`;
  }
}

$('onbGoogleBtn')?.addEventListener('click', async () => {
  try {
    await signInWithGoogle();
    refreshPoolBox();
  } catch (e) {
    alert(e.message || 'OAuth failed');
  }
});
// Email/SSO entry was removed in v1.0.x free build — no sign-in flow exists.

async function persistStep2() {
  if (!chosenSource) {
    alert(t('onbPickOne') || 'Please pick how you want to use AI.');
    return false;
  }
  await setSettings({ source: chosenSource });

  if (chosenSource === 'api') {
    const keys = {
      gemini:    ($('onbGeminiKey').value    || '').trim() || null,
      openai:    ($('onbOpenaiKey').value    || '').trim() || null,
      anthropic: ($('onbAnthropicKey').value || '').trim() || null,
    };
    if (!keys.gemini && !keys.openai && !keys.anthropic) {
      const ok = confirm(t('onbNoKeysConfirm') || 'You picked API mode but didn\'t enter a key. Continue anyway?');
      if (!ok) return false;
    }
    await setApiKeys(keys);
  }

  if (chosenSource === 'pool') {
    const session = await getSession();
    if (!session) {
      alert(t('onbPoolNeedsSignIn') || 'Pool requires sign-in.');
      return false;
    }
  }
  return true;
}

// --- step 3: demo run --------------------------------------------

const demoRunBtn = $('demoRunBtn');
const demoSkipBtn = $('demoSkipBtn');
const demoOutput = $('demoOutput');
const demoStatus = $('demoStatus');
const demoBody   = $('demoBody');

// Step 3 is intentionally instructional only — it does NOT fire a live network
// summary. A demo call would depend on a specific video's captions, a valid key,
// and network access; any of those failing would make onboarding look broken.
// Instead we show clear, reliable guidance and let the user proceed.
demoRunBtn?.addEventListener('click', () => {
  demoRunBtn.hidden = true;
  if (demoSkipBtn) demoSkipBtn.textContent = t('onbNext') || 'Next';
  if (demoOutput) demoOutput.hidden = false;
  if (demoStatus) demoStatus.textContent = '✓';
  if (demoBody) {
    demoBody.innerHTML =
      '<p><strong>' + t('onbDoneTitle') + '</strong></p>' +
      '<ul>' +
        '<li>' + (t('onbTipYT') || 'On a video page — open the popup and click Summarize.') + '</li>' +
        '<li>' + (t('onbTipAnySite') || 'On an article or PDF — click the toolbar icon, then Summarize.') + '</li>' +
        '<li>' + (t('onbTipChat') || 'After the summary — ask follow-up questions in the chat.') + '</li>' +
      '</ul>';
  }
  return;
});

// --- step 4: finish ----------------------------------------------

$('finishBtn').addEventListener('click', async () => {
  await chrome.storage.local.set({ ais_onboarded: true });
  window.close();
  // Fallback if window.close() is blocked
  location.href = chrome.runtime.getURL('options/options.html');
});

// --- tiny markdown renderer (matches popup.js style) -------------

function escHTML(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function mdRender(md) {
  const lines = String(md).split('\n');
  const out = []; let inUl = false;
  function close() { if (inUl) { out.push('</ul>'); inUl = false; } }
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { close(); continue; }
    let m = line.match(/^(#{1,3})\s+(.+)$/);
    if (m) { close(); out.push(`<h${m[1].length}>${esc(m[2])}</h${m[1].length}>`); continue; }
    if (line.match(/^[-*]\s+/)) { if (!inUl) { close(); out.push('<ul>'); inUl = true; } out.push('<li>' + esc(line.replace(/^[-*]\s+/, '')) + '</li>'); continue; }
    close(); out.push('<p>' + esc(line) + '</p>');
  }
  close();
  return out.join('\n');
  function esc(s) {
    s = escHTML(s);
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    return s;
  }
}

// --- init --------------------------------------------------------

setStep(1);
