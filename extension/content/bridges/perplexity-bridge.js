// Bridge for www.perplexity.ai. Thin wrapper over window.AISBridge.
// Selectors are best-effort and may need tuning against the live DOM.
(function () {
  'use strict';
  const B = window.AISBridge;
  if (!B) { console.error('[AIS-perplexity-bridge] AISBridge missing'); return; }

  B.register('perplexity', {
    findInput: () =>
         document.querySelector('textarea[placeholder*="Ask" i]')
      || document.querySelector('div[contenteditable="true"][role="textbox"]')
      || document.querySelector('textarea[aria-label*="Ask" i]')
      || document.querySelector('textarea'),
    findSend: () =>
         document.querySelector('button[aria-label*="Submit" i]:not([disabled])')
      || document.querySelector('button[aria-label*="Send" i]:not([disabled])')
      || document.querySelector('button[type="submit"]:not([disabled])'),
    lastBlock: () => {
      const m = document.querySelectorAll('[data-role="assistant"], .prose, .answer-block, [role="article"]');
      return m[m.length - 1] || null;
    },
    isStreaming: () => !!document.querySelector('button[aria-label*="Stop" i], [data-streaming="true"], .generating'),
  });
})();
