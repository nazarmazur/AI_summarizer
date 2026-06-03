import {
  signInEmail, signUpEmail, signInWithGoogle, getSession,
} from '../lib/supabase.js';

const t = (k) => chrome.i18n.getMessage(k) || k;

const form        = document.getElementById('emailForm');
const submitBtn   = document.getElementById('submitBtn');
const toggleBtn   = document.getElementById('toggleMode');
const googleBtn   = document.getElementById('googleBtn');
const messageBox  = document.getElementById('message');

let mode = 'signin'; // 'signin' | 'signup'

function setMode(next) {
  mode = next;
  if (mode === 'signin') {
    submitBtn.textContent = t('authSignIn');
    toggleBtn.textContent = t('authToggleToSignUp');
    form.querySelector('input[name=password]').setAttribute('autocomplete', 'current-password');
  } else {
    submitBtn.textContent = t('authSignUp');
    toggleBtn.textContent = t('authToggleToSignIn');
    form.querySelector('input[name=password]').setAttribute('autocomplete', 'new-password');
  }
}

function showMessage(text, kind) {
  messageBox.textContent = text;
  messageBox.className = 'message ' + (kind || '');
  messageBox.hidden = false;
}
function clearMessage() {
  messageBox.hidden = true;
  messageBox.textContent = '';
}

async function closeOrRedirect() {
  // If opened as a popup window from the action, close it.
  // If opened as a tab from the YouTube content script, redirect back.
  const params = new URLSearchParams(location.search);
  const returnTo = params.get('returnTo');
  if (returnTo) {
    location.href = returnTo;
  } else {
    window.close();
  }
}

toggleBtn.addEventListener('click', (e) => {
  e.preventDefault();
  clearMessage();
  setMode(mode === 'signin' ? 'signup' : 'signin');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMessage();
  const email    = form.email.value.trim();
  const password = form.password.value;
  submitBtn.disabled = true;
  try {
    if (mode === 'signin') {
      await signInEmail(email, password);
      await closeOrRedirect();
    } else {
      const res = await signUpEmail(email, password);
      if (res && res.access_token) {
        await closeOrRedirect();
      } else {
        showMessage(t('authCheckEmail'), 'success');
      }
    }
  } catch (err) {
    showMessage(err.message || t('errorGeneric'), 'error');
  } finally {
    submitBtn.disabled = false;
  }
});

googleBtn.addEventListener('click', async () => {
  clearMessage();
  googleBtn.disabled = true;
  try {
    await signInWithGoogle();
    await closeOrRedirect();
  } catch (err) {
    showMessage(err.message || t('errorGeneric'), 'error');
  } finally {
    googleBtn.disabled = false;
  }
});

(async function init() {
  setMode('signin');
  const s = await getSession();
  if (s && s.user) {
    // already signed in — close immediately
    closeOrRedirect();
  }
})();
