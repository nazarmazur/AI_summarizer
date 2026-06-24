# Chrome Web Store — Listing Copy (free v1.x build)

> This copy matches the shipped free build: bring-your-own-key, **no account,
> no subscription, no Pro tier, no pricing**. Do not add billing/sign-in claims
> unless the build actually ships them.

## English

### Short description (≤ 132 chars)
Free AI summaries for YouTube, any article, or PDF — with Gemini, GPT, or Claude. Ask smart follow-up questions. Your own key.

### Detailed description

**Smart AI Summarizer turns any YouTube video, article, web page, or PDF into a clean summary in seconds — then lets you ask questions about it. Not just YouTube, and not just one AI.**

✦ **Works everywhere — not only YouTube**
 • YouTube, Vimeo, Twitch, TikTok, Instagram, X
 • Any blog, news article, or web page
 • PDFs by URL or file upload (scans too, via Gemini's native vision)

✦ **Pick your AI — not just Gemini**
 • Use your own API key from Google Gemini, OpenAI, or Anthropic
 • Newest models supported: Gemini 2.5 / 3.x Flash & Pro, GPT-4o / GPT-5 family, Claude Haiku / Sonnet / Opus / Fable
 • Or **no key at all** — optional browser-session mode reuses your already-signed-in tab on Gemini, ChatGPT, Claude, Grok, DeepSeek, Qwen, Kimi, or Perplexity
 • No account and no subscription — you only pay your AI provider for what you use

✦ **Docked side panel**
 Click the toolbar icon and the summarizer opens in a side panel next to the page — summarize while you read or watch.

✦ **Smart Q&A with suggested questions**
 After each summary you get a few content-specific starter questions to tap — or ask your own. The AI answers using the exact content you just summarized. Works on videos, articles, and PDFs alike.

✦ **Made for long content**
 Long videos and big PDFs are split into sections, summarized in parallel, then woven into one coherent overview. Clickable timestamps for videos.

✦ **Your way**
 35 summary languages · short / medium / long · streaming output · copy or download as Markdown · local history. UI in Ukrainian, Russian, English.

✦ **Privacy first**
 Your API key is stored only in your browser (chrome.storage.local) and is sent only to the AI provider you chose. No first-party server, no analytics, no trackers, no resold data. The extension reads a page's content only after you ask it to summarize.

### Single-sentence pitch
A free, bring-your-own-key alternative to Eightify/Glasp that works on videos, articles, and PDFs — with your choice of Gemini, GPT, or Claude — and lets you chat about them.

### Permissions justification (for store review)

| Permission / host | Why we need it |
|---|---|
| storage | Save your preferences and your locally-stored API key. |
| scripting | Inject the "Summarize" button/card and read the current article/PDF page only when you ask for a summary. |
| tabs | Read the active tab's URL to auto-target the page you're summarizing, and pass the transcript from the open video tab. |
| activeTab | Access the page you're on when you click the action. |
| sidePanel | Open the summarizer in Chrome's docked side panel. |
| host: youtube.com, vimeo.com, twitch.tv, tiktok.com, instagram.com, x.com / twitter.com | Add the summarize UI and read video transcripts/captions on these sites. |
| host: gemini.google.com, chatgpt.com, claude.ai, grok.com, chat.deepseek.com, chat.qwen.ai, kimi.com, perplexity.ai | Optional "browser-session" mode: type your prompt into your already-signed-in AI tab and read the reply back, instead of using an API key. |
| host: generativelanguage.googleapis.com, api.openai.com, api.anthropic.com | Send the content + your prompt directly to the AI provider you selected. |
| **optional** host: `<all_urls>` | Read a regular web page or PDF you choose to summarize. Requested **on demand** as a one-time per-site prompt when you summarize a non-video page — never at install. |

`<all_urls>` is an **optional** permission — requested on demand (a one-time per-site prompt) only to read a page/PDF you ask to summarize, never granted at install. There is no sign-in, no account, and no payment.

---

## Ukrainian / Українська

### Короткий опис (≤ 132 chars)
Безкоштовні AI-підсумки YouTube, статей і PDF — Gemini, GPT чи Claude. Розумні питання. Власний ключ, без акаунта.

### Детальний опис

**Smart AI Summarizer перетворює будь-яке відео, статтю, вебсторінку чи PDF на стислий підсумок за секунди — і дозволяє ставити запитання. Не лише YouTube і не лише один AI.**

✦ **Працює всюди — не лише YouTube**
 • YouTube, Vimeo, Twitch, TikTok, Instagram, X
 • Будь-який блог, новина чи вебсторінка
 • PDF за URL або файлом (зокрема скани, через Gemini)

✦ **Обирайте свій AI — не лише Gemini**
 • Власний ключ Google Gemini, OpenAI або Anthropic
 • Найновіші моделі: Gemini 2.5 / 3.x, GPT-4o / GPT-5, Claude Haiku / Sonnet / Opus / Fable
 • Без акаунта й без підписки — платите лише своєму AI-провайдеру за використання

✦ **Докована бічна панель**
 Клік на іконку — і саммарайзер відкривається збоку від сторінки.

✦ **Розумний чат із підказками-питаннями**
 Після підсумку — кілька питань саме про цей контент, які можна натиснути, або своє питання. AI відповідає по щойно підсумованому. Працює на відео, статтях і PDF.

✦ **Для довгого контенту**
 Довгі відео й великі PDF — паралельне підсумовування в один зв'язний огляд. Клікабельні тайм-коди для відео.

✦ **Як зручно вам**
 35 мов підсумку · коротко / середньо / довго · стрімінг · копія або завантаження в Markdown · локальна історія. Інтерфейс: UA / RU / EN.

✦ **Приватність на першому місці**
 Ключ зберігається лише у вашому браузері й надсилається тільки обраному AI-провайдеру. Жодного нашого сервера, аналітики чи трекерів.

---

## Russian / Русский

### Краткое описание (≤ 132 chars)
Бесплатные AI-сводки YouTube, статей и PDF — Gemini, GPT или Claude. Умные вопросы. Свой ключ, без аккаунта.

### Подробное описание

**Smart AI Summarizer превращает любое видео, статью, веб-страницу или PDF в краткую сводку за секунды — и позволяет задавать вопросы. Не только YouTube и не только один AI.**

✦ **Работает везде — не только YouTube** — YouTube, Vimeo, Twitch, TikTok, Instagram, X, любые статьи и веб-страницы, PDF (URL и файлы).

✦ **Выберите AI — не только Gemini** — свой ключ Google Gemini, OpenAI или Anthropic; новейшие модели (Gemini 2.5/3.x, GPT-4o/GPT-5, Claude Haiku/Sonnet/Opus/Fable). Без аккаунта и подписки.

✦ **Док-панель сбоку** — клик по иконке открывает саммарайзер рядом со страницей.

✦ **Умный чат с подсказками** — после сводки несколько вопросов по этому контенту (можно нажать), AI отвечает по содержимому. Видео, статьи и PDF.

✦ **Для длинного контента** — длинные видео и большие PDF обрабатываются параллельно. Кликабельные тайм-коды.

✦ **Как удобно вам** — 35 языков сводки, короткая/средняя/длинная, стриминг, экспорт в Markdown, локальная история. UI: UA/RU/EN.

✦ **Приватность** — ключ только в вашем браузере, отправляется только выбранному провайдеру. Никакого нашего сервера, аналитики и трекеров.
