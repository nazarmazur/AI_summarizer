// Shared helpers for ALL browser-session bridges. The manifest loads this file
// in each provider tab immediately BEFORE the provider's own bridge script, in
// the same isolated world — so each bridge can call these top-level helpers via
// `window.AISBridge`.
//
// Responsibilities centralised here so all providers behave identically:
//   • set the prompt into the site's composer and SUBMIT (Enter-key first —
//     site "Send" buttons change their selectors constantly; Enter is stable),
//   • wait until the answer stops growing,
//   • return the answer as MARKDOWN reconstructed from the rendered HTML
//     (so bold/headings/lists survive — innerText would flatten them),
//   • strip the trailing follow-up "suggestion chips" the chat UIs append.
(function () {
  'use strict';
  if (window.AISBridge) return;          // already defined in this world

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function waitFor(pred, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < (timeoutMs || 30000)) {
      let v = null;
      try { v = pred(); } catch (_) {}
      if (v) return v;
      await sleep(150);
    }
    return null;
  }

  // ── HTML → Markdown ───────────────────────────────────────────────────────
  // Walk the rendered response container and re-emit Markdown. Drop UI chrome
  // (buttons, icons, copy/like controls, follow-up suggestion chips) first.
  const STRIP_SEL = [
    'svg', 'mat-icon', 'button', '[role="button"]', 'menu', '[role="menu"]',
    '.response-footer', '[class*="suggestion" i]', '[class*="follow-up" i]',
    '[class*="followup" i]', '[class*="action" i][class*="bar" i]',
    '[data-testid*="follow" i]', '[aria-label*="Copy" i]', '[aria-hidden="true"]',
  ];
  function htmlToMarkdown(root) {
    if (!root) return '';
    let node;
    try { node = root.cloneNode(true); } catch (_) { return (root.innerText || '').trim(); }
    STRIP_SEL.forEach((s) => { try { node.querySelectorAll(s).forEach((e) => e.remove()); } catch (_) {} });

    let out = '';
    const ensureNL = () => { if (out && !/\n$/.test(out)) out += '\n'; };

    function walk(el, depth) {
      for (const n of el.childNodes) {
        if (n.nodeType === 3) { out += n.textContent.replace(/[ \t\r\n]+/g, ' '); continue; }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName.toLowerCase();
        switch (tag) {
          case 'h1': ensureNL(); out += '\n# ';   walk(n, depth); ensureNL(); out += '\n'; break;
          case 'h2': ensureNL(); out += '\n## ';  walk(n, depth); ensureNL(); out += '\n'; break;
          case 'h3': ensureNL(); out += '\n### '; walk(n, depth); ensureNL(); out += '\n'; break;
          case 'h4':
          case 'h5':
          case 'h6': ensureNL(); out += '\n#### '; walk(n, depth); ensureNL(); out += '\n'; break;
          case 'strong':
          case 'b': out += '**'; walk(n, depth); out += '**'; break;
          case 'em':
          case 'i': out += '_'; walk(n, depth); out += '_'; break;
          case 'code':
            if (n.closest('pre')) walk(n, depth);
            else { out += '`'; walk(n, depth); out += '`'; }
            break;
          case 'pre': ensureNL(); out += '```\n' + (n.innerText || '').trim() + '\n```\n'; break;
          case 'br': out += '\n'; break;
          case 'li': {
            ensureNL();
            const parent = n.parentElement ? n.parentElement.tagName.toLowerCase() : 'ul';
            out += '  '.repeat(Math.max(0, depth - 1)) + (parent === 'ol' ? '1. ' : '- ');
            walk(n, depth + 1); ensureNL(); break;
          }
          case 'ul':
          case 'ol': ensureNL(); walk(n, depth + 1); ensureNL(); break;
          case 'blockquote': ensureNL(); out += '> '; walk(n, depth); ensureNL(); break;
          case 'p':
          case 'div':
          case 'section': ensureNL(); walk(n, depth); ensureNL(); break;
          case 'a': { const h = n.getAttribute('href') || ''; out += '['; walk(n, depth); out += '](' + h + ')'; break; }
          default: walk(n, depth);
        }
      }
    }
    walk(node, 0);
    out = out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return stripFollowups(out);
  }

  // Chat UIs append generated "what next?" suggestion lines after the answer.
  // If the last few lines are short imperative prompts, drop them.
  function stripFollowups(md) {
    const lines = md.split('\n');
    const sugg = /^(create|list|translate|summari[sz]e|explain|write|draft|generate|show|give|tell|compare|suggest|outline|brainstorm|що|які|як|чому|створ|напиш|переклад|поясн|склад|розкаж|порівня)/i;
    let cut = lines.length, run = 0;
    for (let i = lines.length - 1; i >= 0 && i >= lines.length - 6; i--) {
      const t = lines[i].trim().replace(/^[-*•\d.\s]+/, '');
      if (!t) continue;
      if (t.length < 95 && sugg.test(t) && !/[.!?]$/.test(t)) { run++; cut = i; }
      else break;
    }
    if (run >= 2) return lines.slice(0, cut).join('\n').trim();
    return md;
  }

  // ── Compose + submit ──────────────────────────────────────────────────────
  function setText(input, text) {
    input.focus();
    if (input.tagName === 'TEXTAREA') {
      try {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      } catch (_) {}
    }
    input.innerText = '';
    try { document.execCommand('selectAll', false, null); document.execCommand('insertText', false, text); } catch (_) {}
    if (!input.innerText) input.innerText = text;
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }

  function pressEnter(input) {
    const o = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    input.dispatchEvent(new KeyboardEvent('keydown', o));
    input.dispatchEvent(new KeyboardEvent('keypress', o));
    input.dispatchEvent(new KeyboardEvent('keyup', o));
  }

  // sel = { findInput, findSend?, lastBlock, isStreaming? }
  async function runBridge(sel, prompt) {
    const input = await waitFor(sel.findInput, 15000);
    if (!input) throw new Error('composer not found');
    setText(input, prompt);
    await sleep(200);
    // Prefer an enabled Send button if we can find one; otherwise Enter.
    const btn = sel.findSend
      ? await waitFor(() => { const b = sel.findSend(); return b && !b.disabled ? b : null; }, 3000)
      : null;
    if (btn) btn.click();
    else pressEnter(input);
    return await waitForCompletion(sel);
  }

  async function waitForCompletion(sel) {
    await sleep(900);
    let last = '', stable = 0, everText = false, lastNode = null;
    const start = Date.now();
    const HARD = 180000, NO_TEXT = 45000;
    while (Date.now() - start < HARD) {
      const node = sel.lastBlock();
      const txt = node ? (node.innerText || '').trim() : '';
      if (txt) { everText = true; lastNode = node; }
      const streaming = sel.isStreaming ? !!sel.isStreaming() : false;
      if (txt && txt === last && !streaming) {
        if (++stable >= 4) return htmlToMarkdown(node) || txt;   // ~2s stable
      } else { stable = 0; last = txt; }
      // Never produced any text → composer/submit likely failed; fail fast.
      if (!everText && Date.now() - start > NO_TEXT) {
        throw new Error('no response (composer or submit selector may have changed)');
      }
      await sleep(500);
    }
    if (lastNode) return htmlToMarkdown(lastNode) || last;
    throw new Error('response timeout');
  }

  // Standard chrome.runtime wiring for a provider bridge.
  function register(provider, sel) {
    chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
      if (!msg) return;
      if (msg.type === 'BRIDGE_RUN' && msg.provider === provider) {
        (async () => {
          try { sendResponse({ ok: true, text: await runBridge(sel, msg.prompt) }); }
          catch (e) { console.error('[AIS-' + provider + '-bridge]', e); sendResponse({ ok: false, error: e.message || String(e) }); }
        })();
        return true;
      }
      if (msg.type === 'BRIDGE_PING' && msg.provider === provider) {
        let ready = false; try { ready = !!sel.findInput(); } catch (_) {}
        sendResponse({ ok: true, ready });
        return false;
      }
    });
  }

  window.AISBridge = { sleep, waitFor, htmlToMarkdown, stripFollowups, runBridge, register, pressEnter };
})();
