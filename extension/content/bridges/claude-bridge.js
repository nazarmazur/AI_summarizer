// Bridge for claude.ai. Thin wrapper over window.AISBridge.
(function () {
  'use strict';
  const B = window.AISBridge;
  if (!B) { console.error('[AIS-claude-bridge] AISBridge missing'); return; }

  B.register('anthropic', {
    findInput: () =>
         document.querySelector('div[contenteditable="true"].ProseMirror')
      || document.querySelector('div[contenteditable="true"][role="textbox"]')
      || document.querySelector('fieldset div[contenteditable="true"]'),
    findSend: () =>
         document.querySelector('button[aria-label*="Send" i]:not([disabled])')
      || document.querySelector('button[type="submit"][aria-label]:not([disabled])'),
    lastBlock: () => {
      const blocks = document.querySelectorAll('.font-claude-message .prose, .font-claude-message, div[data-testid*="message"] .prose, .prose');
      return blocks[blocks.length - 1] || null;
    },
    isStreaming: () => !!document.querySelector(
      'button[aria-label*="Stop" i], .is-streaming, [data-streaming="true"]'),
  });
})();
