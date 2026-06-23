// Bridge for chatgpt.com / chat.openai.com. Thin wrapper over window.AISBridge.
(function () {
  'use strict';
  const B = window.AISBridge;
  if (!B) { console.error('[AIS-chatgpt-bridge] AISBridge missing'); return; }

  B.register('openai', {
    findInput: () =>
         document.querySelector('#prompt-textarea')
      || document.querySelector('div[contenteditable="true"]#prompt-textarea')
      || document.querySelector('main div[contenteditable="true"]')
      || document.querySelector('main textarea'),
    findSend: () =>
         document.querySelector('button[data-testid="send-button"]:not([disabled])')
      || document.querySelector('button[aria-label*="Send" i]:not([disabled])'),
    lastBlock: () => {
      const msgs = document.querySelectorAll('[data-message-author-role="assistant"] .markdown, [data-message-author-role="assistant"]');
      return msgs[msgs.length - 1] || null;
    },
    isStreaming: () => !!document.querySelector(
      'button[data-testid="stop-button"], button[aria-label*="Stop" i]'),
  });
})();
