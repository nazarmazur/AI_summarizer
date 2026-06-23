// Bridge for gemini.google.com. Thin wrapper over window.AISBridge (loaded
// first by the manifest). Selectors verified against the live DOM 2026-06.
(function () {
  'use strict';
  const B = window.AISBridge;
  if (!B) { console.error('[AIS-gemini-bridge] AISBridge missing'); return; }

  B.register('gemini', {
    findInput: () =>
         document.querySelector('rich-textarea .ql-editor')
      || document.querySelector('div[contenteditable="true"][role="textbox"]')
      || document.querySelector('rich-textarea div[contenteditable="true"]'),
    // "Send" aria-label is unreliable (changes / localised), so AISBridge falls
    // back to the Enter key when this returns nothing.
    findSend: () =>
         document.querySelector('button.send-button:not([disabled])')
      || document.querySelector('button[aria-label*="Send" i]:not([disabled])')
      || document.querySelector('button[aria-label*="Надісл" i]:not([disabled])')
      || document.querySelector('button[aria-label*="Отправ" i]:not([disabled])'),
    lastBlock: () => {
      const blocks = document.querySelectorAll(
        'model-response .markdown, message-content .markdown, .model-response-text, model-response, message-content');
      return blocks[blocks.length - 1] || null;
    },
    isStreaming: () => !!document.querySelector(
      'button[aria-label*="Stop" i], button[aria-label*="Зупин" i], button[aria-label*="Останов" i], .blinking-cursor, .thinking'),
  });
})();
