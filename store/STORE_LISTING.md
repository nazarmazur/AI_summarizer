# Chrome Web Store — Listing Copy (free v1.x build)

> This copy matches the shipped free build: bring-your-own-key, **no account,
> no subscription, no Pro tier, no pricing**. Do not add billing/sign-in claims
> unless the build actually ships them.
>
> ⚠️ **Keyword-spam policy (caused the "Yellow Argon" rejection).** In the product
> **description** (each locale): list **at most 5** third-party brands/sites inline
> and don't repeat any single keyword **>5×**. So name only a few video sites
> ("YouTube, Vimeo, Twitch and more") and the 3 API providers (Gemini, OpenAI,
> Anthropic) — describe browser-session mode generically ("your signed-in AI chat
> tab"), don't enumerate all 8 AI sites, and don't name competitors. The full
> 8-site list belongs ONLY in the Privacy-practices permission justifications (a
> separate field), not the description. Refs:
> developer.chrome.com/docs/webstore/program-policies/spam-faq#keyword-spam

## English

### Short description (≤ 132 chars)
Free AI summaries for YouTube, any article, or PDF — with Gemini, GPT, or Claude. Ask smart follow-up questions. Your own key.

### Detailed description

**Smart AI Summarizer turns any video, article, web page, or PDF into a clean summary in seconds — then lets you ask questions about it. Works on far more than just video.**

✦ **Works on more than just video**
 • Full transcript summaries for YouTube and Vimeo videos
 • TikTok, Instagram, and X: summarizes the post's caption/description
 • Any blog, news article, or web page — plus PDFs by URL or file upload

✦ **Bring your own AI**
 • Use your own API key from Google Gemini, OpenAI, or Anthropic
 • Or no key at all — optional browser-session mode reuses your already-signed-in AI chat tab
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
A free, bring-your-own-key AI summarizer for videos, articles, and PDFs that also answers your follow-up questions.

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

### CWS dashboard — per-permission justification (paste verbatim into "Privacy practices")

> ⚠️ Keep these in sync with `extension/manifest.json`. The reviewer compares the
> declared hosts against the justification — listing fewer sites than the manifest
> (or sites not in it, e.g. Supabase) causes a rejection. As of v1.2.11 there are
> **8** browser-session AI hosts. Do NOT mention `*.supabase.co` — it is not in the
> manifest in the free build.

**storage**
> Зберігає у chrome.storage.local: налаштування користувача (AI-провайдер, мова, довжина, тема), введені користувачем API-ключі (Gemini/OpenAI/Anthropic) для прямих API-викликів, останні 50 підсумків як локальну історію, та діагностику стабільності browser-session режиму. Жодні дані не передаються на сервери розробника — усе живе лише в браузері користувача. Користувач може стерти історію на сторінці History або скинути налаштування.

**scripting**
> Дозвіл потрібен для трьох сценаріїв, усі — лише за явною дією користувача: 1) Content-script на відео-сайтах (youtube, vimeo, twitch, tiktok, instagram, x) — додає кнопку «AI Summarize» і зчитує субтитри/транскрипт відео. 2) Browser-session режим — впроваджує невеликий скрипт у вкладку вибраного AI-сервісу (gemini, chatgpt, claude, grok, deepseek, qwen, kimi, perplexity), що друкує промпт і зчитує відповідь з DOM. 3) Читання звичайної статті/PDF — chrome.scripting.executeScript зчитує текст активної вкладки ЛИШЕ після кліку «Summarize» і лише після наданого користувачем разового дозволу на цей сайт. Фонового чи прихованого injection не відбувається.

**tabs**
> Використовується у двох сценаріях: 1) Читання URL активної вкладки при відкритті розширення — щоб попередньо заповнити поле URL (напр. URL відео на YouTube). 2) Відкриття нової вкладки на одному з AI-сервісів (gemini.google.com, chatgpt.com, claude.ai, grok.com, chat.deepseek.com, chat.qwen.ai, kimi.com, perplexity.ai), коли користувач у режимі browser-session, а сесія ще не відкрита. Жодного фонового моніторингу вкладок чи відстеження активності користувача не відбувається.

**activeTab**
> Доступ до URL і title активної вкладки потрібен лише в момент явного кліку користувача на іконку розширення. URL використовується для попереднього заповнення поля у попапі, title — для заголовка результату. Дозвіл спрацьовує лише через явний жест користувача і не дає доступу до інших вкладок чи фонового моніторингу.

**sidePanel**
> Розширення відкривається як панель у бічній області Chrome (docked side panel), а не як попап. Уся взаємодія — перегляд AI-підсумку, перемикання Підсумок/Тайм-коди і чат з уточнюючими запитаннями щодо вмісту — відбувається в цій панелі поряд із відео чи статтею. Side panel потрібен тому, що звичайний попап закривається при будь-якому кліку поза ним, що переривало б читання довгого підсумку та діалог. Дозвіл лише відкриває власну панель розширення і не дає доступу до вмісту сторінок.

**Host permissions**
> Розширення запитує доступ лише до конкретних доменів: — Відео-сайти (youtube.com, vimeo.com, twitch.tv, tiktok.com, instagram.com, x.com/twitter.com): витяг субтитрів/транскриптів і метаданих відео, яке користувач явно обрав підсумувати. — AI-сервіси (gemini.google.com, chatgpt.com, claude.ai, grok.com, chat.deepseek.com, chat.qwen.ai, kimi.com, perplexity.ai): опціональний режим browser-session — розширення друкує промпт у вже залогінену вкладку користувача замість API-ключа. — AI API (generativelanguage.googleapis.com, api.openai.com, api.anthropic.com): прямі виклики з ключем користувача. Для довільних статей/PDF широкий доступ НЕ надається при встановленні — `<all_urls>` запитується опціонально, разовим запитом на конкретний сайт, лише коли користувач натискає підсумувати звичайну сторінку.

---

## Ukrainian / Українська

### Короткий опис (≤ 132 chars)
Безкоштовні AI-підсумки YouTube, статей і PDF — Gemini, GPT чи Claude. Розумні питання. Власний ключ, без акаунта.

### Детальний опис

**Smart AI Summarizer перетворює будь-яке відео, статтю, вебсторінку чи PDF на стислий підсумок за секунди — і дозволяє ставити запитання.**

✦ **Не лише відео**
 • Повний підсумок за транскриптом — YouTube і Vimeo
 • TikTok, Instagram, X — підсумок з опису/підпису поста
 • Будь-яка стаття чи вебсторінка та PDF (за URL або файлом)

✦ **Власний AI**
 • Власний ключ Google Gemini, OpenAI або Anthropic
 • Або зовсім без ключа — опційний browser-session режим використовує вашу вже залогінену вкладку AI-чату
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

**Smart AI Summarizer превращает любое видео, статью, веб-страницу или PDF в краткую сводку за секунды — и позволяет задавать вопросы.**

✦ **Не только видео** — полный пересказ по транскрипту для YouTube и Vimeo; для TikTok, Instagram и X — сводка из описания/подписи поста; любые статьи, веб-страницы и PDF.

✦ **Свой AI** — свой ключ Google Gemini, OpenAI или Anthropic; либо без ключа — опциональный browser-session режим использует вашу уже залогиненную вкладку AI-чата. Без аккаунта и подписки.

✦ **Док-панель сбоку** — клик по иконке открывает саммарайзер рядом со страницей.

✦ **Умный чат с подсказками** — после сводки несколько вопросов по этому контенту (можно нажать), AI отвечает по содержимому. Видео, статьи и PDF.

✦ **Для длинного контента** — длинные видео и большие PDF обрабатываются параллельно. Кликабельные тайм-коды.

✦ **Как удобно вам** — 35 языков сводки, короткая/средняя/длинная, стриминг, экспорт в Markdown, локальная история. UI: UA/RU/EN.

✦ **Приватность** — ключ только в вашем браузере, отправляется только выбранному провайдеру. Никакого нашего сервера, аналитики и трекеров.
