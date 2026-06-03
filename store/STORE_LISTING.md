# Chrome Web Store — Listing Copy

## English

### Short description (≤ 132 chars)
Summarize any YouTube video, article, or PDF in seconds with Gemini, ChatGPT, or Claude — plus ask follow-up questions.

### Detailed description

**AI Summarizer turns any YouTube video, article, or PDF into a clean summary you can read in under a minute. Then you can chat with it.**

✦ **Works everywhere**
 • YouTube, Vimeo, Twitch, TikTok, Instagram, X (Twitter)
 • Any blog or news article — even paywalled ones you already have access to
 • PDFs by URL or file upload (including scans, via Gemini's native vision)

✦ **Pick your AI**
 • Bring your own API key (Gemini, OpenAI, or Anthropic) — unlimited use, you pay only what the provider charges
 • Or use your already-logged-in Gemini, ChatGPT, or Claude tab — no key required
 • Or subscribe to Pro and use our pooled keys with a monthly quota

✦ **Built-in Q&A**
 Ask "what did they say about X?" or "summarise just the second half" — the AI remembers the content you just summarised and answers in context.

✦ **Smart for long content**
 3-hour videos and 200-page PDFs work seamlessly. The extension chunks the content into sections, summarises each in parallel, then weaves it all into one coherent overview.

✦ **Multilingual**
 Summarize in 8 languages. UI in Ukrainian, Russian, English.

✦ **Privacy first**
 API keys live in your browser only. We never see what you summarise. No ads, no third-party trackers, no resold data.

✦ **Streaming output**
 Watch the summary appear word-by-word, just like ChatGPT. Hit Stop anytime if you've seen enough.

## Pricing

**Free** — unlimited summaries when you provide your own API key, or 5 pooled requests per day on ours.

**Pro — $4.99 / month or $39 / year** — unlocks Gemini 2.5 Pro / GPT-4o / Claude Sonnet, clickable video timestamps, summaries of 30+ min videos, custom prompt templates, Markdown / Notion export, and 50 pooled requests per month.

## Permissions justification (for store review)

| Permission      | Why we need it                                                                 |
|-----------------|--------------------------------------------------------------------------------|
| storage         | Save user preferences and locally-stored API keys.                              |
| identity        | Google sign-in via chrome.identity.launchWebAuthFlow (Supabase auth).           |
| tabs            | Detect URL of active tab to pre-fill the popup.                                 |
| activeTab       | Read the URL of the page the user is currently on when they click the action.   |
| scripting       | Required to inject Summarize button on YouTube and other supported sites.       |
| host_permissions: youtube.com, vimeo.com, twitch.tv, tiktok.com, instagram.com, x.com, gemini.google.com, chatgpt.com, claude.ai, supabase.co, generativelanguage.googleapis.com, api.openai.com, api.anthropic.com | Fetch transcripts / page content, run browser-session bridges, authenticate users, call AI APIs. |
| host_permissions: <all_urls> | Required to inject the floating Summarize button on any article or PDF the user wants to summarise. Content is only read after the user clicks the button. |

## Single-sentence pitch
A modern alternative to Eightify/Glasp that works on videos, articles, and PDFs — and lets you chat about them.

---

## Ukrainian / Українська

### Короткий опис (≤ 132 chars)
Підсумок будь-якого YouTube-відео, статті чи PDF за секунди через Gemini, ChatGPT або Claude — з функцією чат-питань.

### Детальний опис

**AI Summarizer перетворює будь-яке YouTube-відео, статтю чи PDF на стислий підсумок за хвилину. А потім дозволяє ставити запитання.**

✦ **Працює всюди**
 • YouTube, Vimeo, Twitch, TikTok, Instagram, X (Twitter)
 • Будь-який блог чи новинна стаття — навіть за пейволом, якщо у вас вже є доступ
 • PDF за URL або через завантаження файлу (включно зі сканами через Gemini)

✦ **Обирайте свій AI**
 • Свій API ключ (Gemini / OpenAI / Anthropic) — необмежено
 • Або вже залогінена вкладка Gemini / ChatGPT / Claude — без ключа
 • Або підписка Pro з пулом наших ключів

✦ **Вбудований чат**
 Питайте «що вони сказали про X?» — AI пам'ятає контент, який ви тільки що подивилися.

✦ **Розумно для довгих відео**
 3-годинні відео та 200-сторінкові PDF — без проблем. Чанкуємо паралельно і збираємо єдиний підсумок.

✦ **8 мов** для підсумку. Інтерфейс UA/RU/EN.

✦ **Приватність на першому місці**
 API ключі лишаються тільки у вашому браузері. Ми не бачимо що ви підсумовуєте.

✦ **Streaming output**
 Дивитесь як підсумок з'являється посимвольно. Stop коли захочете.

## Тарифи

**Безкоштовно** — необмежено зі своїм ключем, або 5 запитів/день на наших.

**Pro — $4.99/міс або $39/рік** — Gemini 2.5 Pro / GPT-4o / Claude Sonnet, клікабельні тайм-коди, відео 30+ хв, експорт, 50 запитів/міс.

---

## Russian / Русский

### Краткое описание (≤ 132 chars)
Сводка любого YouTube-видео, статьи или PDF за секунды через Gemini, ChatGPT или Claude — плюс чат-вопросы.

### Подробное описание

**AI Summarizer превращает любое YouTube-видео, статью или PDF в краткую сводку за минуту. А потом позволяет задавать вопросы.**

✦ **Работает везде** — YouTube, Vimeo, Twitch, TikTok, Instagram, X, любые статьи, PDF (URL и файлы).

✦ **Выберите AI** — свой API-ключ (Gemini / OpenAI / Anthropic) — без лимита, либо залогиненная вкладка ИИ-сайта, либо подписка Pro.

✦ **Чат-вопросы** — спросите «что они сказали о X?» — ИИ помнит контент.

✦ **Длинные видео** — 3-часовые ролики и 200-страничные PDF обрабатываются параллельно.

✦ **8 языков** сводки. UI на украинском/русском/английском.

✦ **Приватность** — ключи только локально, никаких трекеров.

## Тарифы

**Бесплатно** — без лимита со своим ключом, или 5 запросов/день на наших.

**Pro — $4.99/мес или $39/год** — топ-модели, тайм-коды, длинные видео, экспорт, 50 запросов/мес.
