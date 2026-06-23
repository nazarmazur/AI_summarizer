// Bridge for chat.deepseek.com. Thin wrapper over window.AISBridge.
// Selectors are best-effort and may need tuning against the live DOM.
(function () {
  'use strict';
  const B = window.AISBridge;
  if (!B) { console.error('[AIS-deepseek-bridge] AISBridge missing'); return; }

  B.register('deepseek', {
    findInput: () =>
         document.querySelector('textarea[placeholder*="message" i]')
      || document.querySelector('textarea#chat-input')
      || document.querySelector('div[contenteditable="true"][role="textbox"]')
      || document.querySelector('textarea'),
    findSend: () =>
         document.querySelector('button[aria-label*="Send" i]:not([disabled])')
      || document.querySelector('div[role="button"][aria-disabled="false"]')
      || document.querySelector('button[type="submit"]:not([disabled])'),
    lastBlock: () => {
      const m = document.querySelectorAll('[data-role="assistant"], .ds-markdown, .message-assistant, [role="article"]');
      return m[m.length - 1] || null;
    },
    isStreaming: () => !!document.querySelector('button[aria-label*="Stop" i], [data-streaming="true"], .generating'),
  });
})();
