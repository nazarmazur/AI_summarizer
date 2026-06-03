// Bridge for claude.ai.
(function () {
  'use strict';

  const SIG = '[AIS-Claude-Bridge]';

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
    return document.querySelector('div[contenteditable="true"].ProseMirror')
        || document.querySelector('div[contenteditable="true"][role="textbox"]')
        || document.querySelector('fieldset div[contenteditable="true"]');
  }

  function findSendBtn() {
    return document.querySelector('button[aria-label*="Send" i]')
        || document.querySelector('button[type="submit"][aria-label]');
  }

  function lastAssistantBlock() {
    // Claude renders each message with a data-test-render-count or a specific structure.
    // Most reliable: the last .font-claude-message container, else fall back.
    const blocks = document.querySelectorAll('.font-claude-message, div[data-testid*="message"], .prose');
    return blocks[blocks.length - 1] || null;
  }

  function isStillStreaming() {
    return !!document.querySelector('button[aria-label*="Stop" i]')
        || !!document.querySelector('.is-streaming, [data-streaming="true"]');
  }

  async function setPrompt(text) {
    const input = await waitFor(findInput, 15000);
    if (!input) throw new Error('Claude input not found');
    input.focus();
    input.innerText = '';
    document.execCommand && document.execCommand('insertText', false, text);
    if (!input.innerText) input.innerText = text;
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    return input;
  }

  async function clickSend() {
    const btn = await waitFor(() => {
      const b = findSendBtn();
      return b && !b.disabled ? b : null;
    }, 8000);
    if (!btn) throw new Error('Claude send button not found');
    btn.click();
  }

  async function waitForCompletion() {
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
        if (stableTicks >= 4) return t;
      } else {
        stableTicks = 0;
        lastText = t;
      }
      await sleep(500);
    }
    if (lastText) return lastText;
    throw new Error('Claude response timeout');
  }

  async function runPrompt(text) {
    await setPrompt(text);
    await clickSend();
    return await waitForCompletion();
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'BRIDGE_RUN' && msg.provider === 'anthropic') {
      (async () => {
        try {
          const text = await runPrompt(msg.prompt);
          sendResponse({ ok: true, text });
        } catch (e) {
          console.error(SIG, e);
          sendResponse({ ok: false, error: e.message || String(e) });
        }
      })();
      return true;
    }
    if (msg && msg.type === 'BRIDGE_PING' && msg.provider === 'anthropic') {
      sendResponse({ ok: true, ready: !!findInput() });
      return false;
    }
  });
})();
