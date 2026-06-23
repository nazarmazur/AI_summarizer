// Bridge for grok.com — types a prompt into the active chat,
// waits until streaming finishes, and returns the assistant message text.
(function () {
  'use strict';

  const SIG = '[AIS-Grok-Bridge]';

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
    return document.querySelector('textarea[placeholder*="Ask" i]')
        || document.querySelector('textarea[aria-label*="Ask" i]')
        || document.querySelector('textarea[role="textbox"]')
        || document.querySelector('textarea');
  }

  function findSendBtn() {
    return document.querySelector('button[aria-label*="Send" i]')
        || document.querySelector('button[title*="Send" i]')
        || document.querySelector('form button[type="submit"]');
  }

  function lastAssistantBlock() {
    // Grok renders assistant messages in containers; look for last message from assistant
    const msgs = document.querySelectorAll('[data-role="assistant"], .assistant-message, [role="article"]');
    return msgs[msgs.length - 1] || null;
  }

  function isStillStreaming() {
    return !!document.querySelector('button[aria-label*="Stop" i]')
        || !!document.querySelector('[data-streaming="true"], .streaming');
  }

  async function setPrompt(text) {
    const input = await waitFor(findInput, 15000);
    if (!input) throw new Error('Grok input not found');
    input.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return input;
  }

  async function clickSend() {
    const btn = await waitFor(() => {
      const b = findSendBtn();
      return b && !b.disabled ? b : null;
    }, 8000);
    if (!btn) throw new Error('Grok send button not found');
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
    throw new Error('Grok response timeout');
  }

  async function runPrompt(text) {
    await setPrompt(text);
    await clickSend();
    return await waitForCompletion();
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'BRIDGE_RUN' && msg.provider === 'grok') {
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
    if (msg && msg.type === 'BRIDGE_PING' && msg.provider === 'grok') {
      sendResponse({ ok: true, ready: !!findInput() });
      return false;
    }
  });
})();
