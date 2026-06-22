import { setSettings, setApiKeys } from '../lib/ai-api.js';
import { getSession, signInWithGoogle } from '../lib/supabase.js';
import { RELEASE_MODE, HAS_SUPABASE, HAS_PRO } from '../lib/config.js';

// In free release mode the Pool option is hidden — we haven't deployed the
// ai-proxy Edge Function. Users provide their own API key.
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

// --- step 3: live example summary (NO key, NO network) -----------

const demoRunBtn = $('demoRunBtn');
const demoSkipBtn = $('demoSkipBtn');
const demoOutput = $('demoOutput');
const demoStatus = $('demoStatus');
const demoBody   = $('demoBody');

// Show a REAL example summary with zero setup — no API key, no network call.
// A brand-new user (and a Web Store reviewer testing in a clean profile) sees
// exactly what "Summarize" produces. The content is a fixed, clearly-labelled
// sample, streamed in line-by-line to mirror the live experience.
const DEMO_FALLBACK_MD =
  '**Key takeaways**\n\n- A short 5–10 minute walk noticeably sharpens attention.\n- Movement boosts blood flow to the brain and cuts mental fatigue.\n- Walking outdoors adds a mood lift from daylight and fresh air.\n\n**Bottom line:** short, frequent walks help you stay focused.';

let demoPlayed = false;
demoRunBtn?.addEventListener('click', () => {
  if (demoPlayed) return;
  demoPlayed = true;
  demoRunBtn.disabled = true;
  if (demoOutput) demoOutput.hidden = false;
  if (demoStatus) demoStatus.textContent = t('onbSummarizing') || 'Summarizing…';

  let md = t('onbExampleSummaryMd');
  if (!md || md === 'onbExampleSummaryMd') md = DEMO_FALLBACK_MD;
  const lines = md.split('\n');
  let i = 0;
  const timer = setInterval(() => {
    i++;
    if (demoBody) {
      const partial = mdRender(lines.slice(0, i).join('\n'));
      demoBody.innerHTML = partial + (i < lines.length ? '<span class="demo-cursor">▋</span>' : '');
    }
    if (demoOutput) demoOutput.scrollTop = demoOutput.scrollHeight;
    if (i >= lines.length) {
      clearInterval(timer);
      if (demoBody) demoBody.innerHTML = mdRender(md);
      if (demoStatus) demoStatus.textContent = t('onbExampleDone') || '✓ Done — your real summaries look just like this';
      if (demoSkipBtn) { demoSkipBtn.classList.remove('btn-ghost'); demoSkipBtn.classList.add('btn-primary'); }
    }
  }, 130);
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
