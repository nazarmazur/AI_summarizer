// Bridge for gemini.google.com — types a prompt into the active chat,
// waits until streaming finishes, and returns the assistant message text.
(function () {
  'use strict';

  const SIG = '[AIS-Gemini-Bridge]';

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function waitFor(predicate, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < (timeoutMs || 30000)) {
      const v = predicate();
      if (v) return v;
      await sleep(150);
    }
    return null;
  }

  function findInput() {
    return document.querySelector('rich-textarea .ql-editor')
        || document.querySelector('rich-textarea div[contenteditable="true"]')
        || document.querySelector('div[contenteditable="true"][role="textbox"]');
  }

  function findSendBtn() {
    return document.querySelector('button[aria-label*="Send" i], button[aria-label*="Надіслати" i], button[aria-label*="Отправ" i], button.send-button')
        || document.querySelector('button[mat-icon-button][data-test-id*="send" i]');
  }

  function lastAssistantBlock() {
    // model-response is Gemini's per-turn container; .markdown is the rendered text
    const blocks = document.querySelectorAll('model-response, .response-container, message-content');
    const last = blocks[blocks.length - 1];
    if (!last) return null;
    return last.querySelector('.markdown, .model-response-text, .response-content') || last;
  }

  function isStillStreaming() {
    return !!document.querySelector('.thinking, .stream, [data-test-id="thinking"], .blinking-cursor');
  }

  async function setPrompt(text) {
    const input = await waitFor(findInput, 15000);
    if (!input) throw new Error('Gemini input not found');
    input.focus();
    // Clear existing content
    input.innerText = '';
    document.execCommand && document.execCommand('selectAll', false, null);
    document.execCommand && document.execCommand('insertText', false, text);
    // Fallback if execCommand is gone in a future build
    if (!input.innerText) input.innerText = text;
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    return input;
  }

  async function clickSend() {
    const btn = await waitFor(() => {
      const b = findSendBtn();
      return b && !b.disabled ? b : null;
    }, 8000);
    if (!btn) throw new Error('Gemini send button not found');
    btn.click();
  }

  async function waitForCompletion() {
    // Wait until a new assistant block appears AND it stops growing.
    await sleep(800);
    let lastText = '';
    let stableTicks = 0;
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const node = lastAssistantBlock();
      const t = node ? (node.innerText || '').trim() : '';
      const streaming = isStillStreaming();
      if (t && t === lastText && !streaming) {
        stableTicks++;
        if (stableTicks >= 4) return t; // ~2s stable
      } else {
        stableTicks = 0;
        lastText = t;
      }
      await sleep(500);
    }
    if (lastText) return lastText;
    throw new Error('Gemini response timeout');
  }

  async function runPrompt(text) {
    await setPrompt(text);
    await clickSend();
    return await waitForCompletion();
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'BRIDGE_RUN' && msg.provider === 'gemini') {
      (async () => {
        try {
          const text = await runPrompt(msg.prompt);
          sendResponse({ ok: true, text });
        } catch (e) {
          console.error(SIG, e);
          sendResponse({ ok: false, error: e.message || String(e) });
        }
      })();
      return true; // async response
    }
    if (msg && msg.type === 'BRIDGE_PING' && msg.provider === 'gemini') {
      sendResponse({ ok: true, ready: !!findInput() });
      return false;
    }
  });
})();
