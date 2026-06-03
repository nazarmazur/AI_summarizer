// Tiny helper that walks the DOM and replaces [data-i18n] / [data-i18n-attr]
// with chrome.i18n.getMessage values. Works in popup, options, auth, and content scripts.
(function () {
  'use strict';

  function t(key, subs) {
    if (!chrome.i18n) return key;
    return chrome.i18n.getMessage(key, subs) || key;
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

  // Expose for dynamic content
  window.AIS_I18N = { t, applyI18n };
})();
