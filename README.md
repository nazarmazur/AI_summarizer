# 🪄 AI Summarizer

**🇬🇧 English** · [🇺🇦 Українською](README.uk.md)

> Free Chrome extension that summarizes **any video, article, or PDF** in seconds using Gemini, ChatGPT, or Claude — and lets you chat with the content afterward.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chrome 124+](https://img.shields.io/badge/Chrome-124%2B-brightgreen)](https://www.google.com/chrome/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Version](https://img.shields.io/badge/version-1.0.3-purple)](dist/)

---

## ✨ What it does

| | |
|---|---|
| 🎬 **Videos** | YouTube · Vimeo · Twitch · TikTok · Instagram · X (Twitter) |
| 📄 **Web pages** | Any article, blog post, or documentation page |
| 📕 **PDFs** | Via URL or file picker — Gemini reads them natively, including scans |
| 💬 **Q&A chat** | Ask follow-up questions about what you just summarized |
| ⚡ **Streaming** | Watch the summary appear word-by-word, like ChatGPT |
| 🧩 **Long content** | 3-hour videos and 200-page PDFs via parallel map-reduce chunking |
| 🌍 **Multilingual** | Summarize in 35 languages. UI in English / Ukrainian / Russian |
| 🎨 **Themes** | Auto-follows YouTube's dark mode |
| 📥 **Export** | Copy as Markdown or download `.md` file |
| 🕐 **History** | Local-first storage of your last 50 summaries |
| 🔌 **3 AI providers** | Use your own API key, or your already-signed-in tab |

## 🤖 Supported AI models

| Provider | Models |
|---|---|
| **Google Gemini** | 2.0 Flash · 2.5 Flash · 1.5 Flash · 2.5 Pro · 1.5 Pro |
| **OpenAI** | GPT-4o mini · GPT-3.5 Turbo · GPT-4o · GPT-4 Turbo · GPT-4.1 · o3-mini · o1 |
| **Anthropic** | Claude Haiku 4.5 · 3.5 Haiku · Sonnet 4.6 · 3.5 Sonnet · Opus 4.6 · 3 Opus |

## 🚀 Installation

### From Chrome Web Store
*Coming soon — v1.0.3 is currently in CWS review.*

### From source (developers / power users)

```bash
git clone https://github.com/nazarmazur/AI_summarizer.git
```

1. Open `chrome://extensions/` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `extension/` folder
4. The onboarding wizard opens automatically — paste your Gemini / OpenAI / Anthropic API key, or just use your browser session

### Pre-built `.zip`

Latest production build is in [`dist/ai-summarizer-1.0.3.zip`](dist/) (117 KB) — ready to upload to Chrome Web Store.

## 🔑 Getting an API key

| Provider | Free tier? | Where |
|---|---|---|
| **Gemini** | ✅ Generous | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| **OpenAI** | ❌ $5 starter | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Anthropic** | ✅ $5 starter credit | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |

API keys stay in `chrome.storage.local` — they never leave your browser.

## 📂 Project structure

```
extension/                 # The Chrome extension (Manifest V3, vanilla JS)
├── manifest.json
├── _locales/{uk,ru,en}/   # 3-language UI
├── icons/                 # 16/32/48/128 px PNGs
├── background/            # Service worker — orchestrator
├── popup/                 # Toolbar popup UI
├── auth/                  # Sign-in flow (hidden in free mode)
├── options/               # Settings page
├── onboarding/            # 4-step welcome wizard
├── history/               # Past summaries viewer
├── content/               # In-page UI (YouTube card, floating panel)
│   ├── page.js + page.css
│   └── bridges/           # Browser-session drivers for Gemini/ChatGPT/Claude
└── lib/
    ├── config.js          # Provider settings, language list, model catalog
    ├── ai-api.js          # Unified Gemini / OpenAI / Anthropic streaming
    ├── extractors/        # YouTube · Vimeo · Twitch · social · webpage · PDF
    ├── prompts.js         # Summary / timestamps / chat prompt templates
    ├── templates.js       # User-customizable prompt templates (Pro)
    ├── chunker.js         # Map-reduce for long content
    ├── chat-store.js      # Q&A session context
    ├── history-store.js   # Local summary storage
    ├── supabase.js        # Auth client (optional, full mode only)
    ├── tier.js            # Free / Pro tier lookup
    ├── features.js        # Feature-gating flags
    └── bridge-health.js   # Auto-fallback when a bridge breaks
supabase/                  # Optional backend (for Pro tier later)
├── schema.sql             # Tables + RLS + RPC
└── functions/             # Edge Functions for billing + ai-proxy
store/                     # Chrome Web Store assets
├── PRIVACY.html           # Privacy policy (hosted via GH Pages)
├── STORE_LISTING.md       # Multilingual store descriptions
├── ASSETS_GUIDE.md        # Screenshot composition guide
├── LAUNCH.md              # Submission checklist
├── build-zip.ps1          # Produces dist/ai-summarizer-*.zip
├── make-screenshots.ps1   # Re-renders all PNGs from HTML mockups
└── assets/                # 5 screenshots + 3 promo tiles
```

## 🏗️ Build

```powershell
# Windows PowerShell — produces dist/ai-summarizer-X.Y.Z.zip
.\store\build-zip.ps1 -Version 1.0.4
```

## 🔬 Pro tier (future)

The codebase ships with a complete Pro tier (Stripe / Paddle / Lemon Squeezy + Supabase + Pool API). It's gated behind a single config flag:

```js
// extension/lib/config.js
export const RELEASE_MODE = 'free';   // ← change to 'full' to enable Pro
```

Switching to `'full'` adds:
- Sign-in (Google SSO + email/password via Supabase)
- Subscription billing with 7-day free trial
- Synced history across devices
- Pool API (50 summaries/month on our keys)
- Premium models (Gemini 2.5 Pro, GPT-4o, Claude Sonnet, etc.)
- Clickable timestamps · custom prompts · cross-device export

See [store/LAUNCH.md](store/LAUNCH.md) for activation steps.

## 🔒 Privacy

- 🚫 No analytics, no third-party trackers, no ads
- 🚫 No server in the AI summarization pipeline (free mode)
- 🚫 We never see your API keys — they're in `chrome.storage.local`
- ✅ Page content is read **only after** you click Summarize
- ✅ Local history can be wiped any time from the History page

Full Privacy Policy: [nazarmazur.github.io/AI_summarizer/store/PRIVACY.html](https://nazarmazur.github.io/AI_summarizer/store/PRIVACY.html)

## 🛠️ Tech stack

- **No build step.** Pure ES modules, vanilla JS, no bundlers required.
- **No runtime dependencies.** Zero npm packages in the extension itself.
- **Optional:** Supabase (auth, history sync, billing webhooks), Paddle / Lemon Squeezy / Stripe (billing), pdfjs-dist (offline PDF text extraction).
- **Browser:** Chrome 124+ (DOMParser in service workers).

## 🤝 Contributing

PRs welcome! See [open issues](https://github.com/nazarmazur/AI_summarizer/issues).

Quick local test:

```powershell
.\store\qa-smoke.ps1    # opens Chrome with fresh profile + extension + 4 test tabs
```

## 📜 License

[MIT](LICENSE) — do whatever you want, just keep the copyright notice.

## 🙋 Contact

[m.nazar77@gmail.com](mailto:m.nazar77@gmail.com) · [@nazarmazur on GitHub](https://github.com/nazarmazur)
