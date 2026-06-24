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
      // Claude renamed the message container (.font-claude-message → .font-claude-response)
      // and dropped .prose — verified live 2026-06 (old selectors returned 0 nodes, so the
      // bridge saw no text → 45s timeout → "not working" + mute). Extended-thinking replies
      // also wrap the "Thought for Ns" reasoning in a 2-row grid: reasoning in row-start-1,
      // the actual answer in row-start-2. Prefer the answer cell so the reasoning never
      // leaks into the summary; fall back to the whole response, then to legacy selectors.
      const resp = document.querySelectorAll('.font-claude-response');
      const last = resp[resp.length - 1];
      if (last) return last.querySelector('[class*="row-start-2"]') || last;
      const b = document.querySelectorAll('.font-claude-message, [data-testid="assistant-message"], .prose');
      return b[b.length - 1] || null;
    },
    isStreaming: () => !!document.querySelector(
      'button[aria-label*="Stop" i], .is-streaming, [data-streaming="true"]'),
  });
})();
