// Bridge for www.kimi.com. Thin wrapper over window.AISBridge.
// Selectors are best-effort and may need tuning against the live DOM.
(function () {
  'use strict';
  const B = window.AISBridge;
  if (!B) { console.error('[AIS-kimi-bridge] AISBridge missing'); return; }

  B.register('kimi', {
    findInput: () =>
         document.querySelector('textarea[placeholder*="message" i]')
      || document.querySelector('div[contenteditable="true"].chat-input-editor')
      || document.querySelector('div[contenteditable="true"][role="textbox"]')
      || document.querySelector('textarea'),
    findSend: () =>
         document.querySelector('button[aria-label*="Send" i]:not([disabled])')
      || document.querySelector('.send-button:not([disabled])')
      || document.querySelector('button[type="submit"]:not([disabled])'),
    lastBlock: () => {
      const m = document.querySelectorAll('[data-role="assistant"], .message.assistant, .markdown, [role="article"]');
      return m[m.length - 1] || null;
    },
    isStreaming: () => !!document.querySelector('button[aria-label*="Stop" i], [data-streaming="true"], .is-responding'),
  });
})();
