// Tiny i18n helper. Walks the DOM and replaces [data-i18n] / [data-i18n-attr]
// with localized strings.
//
// By default it uses chrome.i18n (the browser's UI locale). But a specific
// locale can be loaded at runtime with loadLocale('uk'|'ru'|'en'…) so the UI can
// follow the language the user picked for summaries, regardless of the browser
// language. If loading fails it silently falls back to chrome.i18n.
(function () {
  'use strict';

  let MESSAGES = null;   // loaded locale dictionary, or null = use chrome.i18n
  let LOCALE = null;

  // Reproduce chrome.i18n's substitution: messages use named tokens like
  // "$DONE$" whose placeholder entry maps the lowercase name to "$1"/"$2"…
  function substitute(message, placeholders, subs) {
    let out = message;
    if (subs != null) {
      const arr = Array.isArray(subs) ? subs : [subs];
      out = out.replace(/\$(\w+)\$/g, (m, name) => {
        const def = placeholders && placeholders[name.toLowerCase()];
        if (!def || def.content == null) return m;
        const idx = parseInt(String(def.content).replace(/[^0-9]/g, ''), 10);
        return Number.isNaN(idx) ? m : (arr[idx - 1] != null ? arr[idx - 1] : '');
      });
    }
    return out.replace(/\$\$/g, '$');   // "$$" → literal "$"
  }

  function t(key, subs) {
    const entry = MESSAGES && MESSAGES[key];
    if (entry && typeof entry.message === 'string') {
      return substitute(entry.message, entry.placeholders, subs);
    }
    if (typeof chrome !== 'undefined' && chrome.i18n) return chrome.i18n.getMessage(key, subs) || key;
    return key;
  }

  async function loadLocale(locale) {
    if (!locale) { MESSAGES = null; LOCALE = null; return; }
    if (locale === LOCALE) return;
    try {
      const url = chrome.runtime.getURL('_locales/' + locale + '/messages.json');
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      MESSAGES = await r.json();
      LOCALE = locale;
    } catch (_) {
      MESSAGES = null; LOCALE = null;   // fall back to chrome.i18n
    }
  }

  function applyI18n(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const val = t(key);
      if (val) el.textContent = val;
    });
    root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      // format: "placeholder:keyName,title:otherKey"
      el.getAttribute('data-i18n-attr').split(',').forEach((pair) => {
        const [attr, key] = pair.split(':').map((s) => s.trim());
        if (attr && key) el.setAttribute(attr, t(key));
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyI18n());
  } else {
    applyI18n();
  }

  // Expose for dynamic content + runtime locale switching.
  window.AIS_I18N = { t, applyI18n, loadLocale };
})();
