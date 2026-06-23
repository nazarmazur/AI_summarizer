// Bridge for chat.qwen.ai. Thin wrapper over window.AISBridge.
// Selectors are best-effort and may need tuning against the live DOM.
(function () {
  'use strict';
  const B = window.AISBridge;
  if (!B) { console.error('[AIS-qwen-bridge] AISBridge missing'); return; }

  B.register('qwen', {
    findInput: () =>
         document.querySelector('textarea[placeholder*="Ask" i]')
      || document.querySelector('textarea[placeholder*="message" i]')
      || document.querySelector('div[contenteditable="true"][role="textbox"]')
      || document.querySelector('textarea'),
    findSend: () =>
         document.querySelector('button[aria-label*="Send" i]:not([disabled])')
      || document.querySelector('button.send-btn:not([disabled])')
      || document.querySelector('button[type="submit"]:not([disabled])'),
    lastBlock: () => {
      const m = document.querySelectorAll('[data-role="assistant"], .message-item.assistant, .markdown-body, [role="article"]');
      return m[m.length - 1] || null;
    },
    isStreaming: () => !!document.querySelector('button[aria-label*="Stop" i], [data-streaming="true"], .responding'),
  });
})();
