# 🚀 v1.0.0 Free Launch Checklist

Реліз сьогодні. Все Pro/Stripe/Supabase лишається у репо, але вимкнено через `RELEASE_MODE = 'free'` у [`extension/lib/config.js`](../extension/lib/config.js).

---

## ✅ Що увійшло в v1.0.0

**Фічі:**
- YouTube, Vimeo, Twitch, TikTok, Instagram, X — підсумок відео
- Будь-яка веб-сторінка через Readability-екстрактор
- PDF (URL або файл) через Gemini native
- Q&A чат після підсумку
- Streaming output з курсором
- Map-reduce для довгих відео (3+ години)
- Експорт у Markdown / завантаження .md
- Локальна історія (50 останніх записів у chrome.storage)
- Onboarding wizard
- Темна тема, що йде за YouTube
- 8 мов підсумку, UI: UA / RU / EN

**Вимкнено через `RELEASE_MODE = 'free'`:**
- Sign-in (необов'язково)
- Pro tier (BYOK only)
- Pool API (немає Edge Function)
- Stripe / Paddle / Lemon Squeezy
- Synchronized history через Supabase
- Tier checks, quotas, upsell modal, PRO badges

---

## 🟢 Що **НЕ** потрібно для v1.0.0

Жодних серверних залежностей. Розширення працює standalone:

- ❌ Supabase проект — не треба
- ❌ Google OAuth client — не треба
- ❌ Stripe / Paddle / Lemon Squeezy — не треба
- ❌ Edge Functions — не треба
- ❌ Pool API ключі — не треба
- ❌ База даних — не треба

Користувач відкриває → вставляє свій Gemini ключ → користується.

---

## 📋 Pre-submission checklist

### Код і збірка
- [x] `RELEASE_MODE = 'free'` у [config.js](../extension/lib/config.js)
- [x] `manifest.json version = 1.0.0`
- [x] `dist/ai-summarizer-1.0.0.zip` зібраний (114 KB)
- [x] JSON-файли валідовані
- [x] Жодних `console.log` для дебагу
- [ ] **Протестовано встановлення в чистому Chrome профілі**
- [ ] **Протестовано онбординг → BYOK → підсумок YouTube**
- [ ] **Протестовано підсумок статті (theverge.com)**
- [ ] **Протестовано PDF з URL (arxiv.org/pdf/...)**
- [ ] **Протестовано Q&A після підсумку**
- [ ] **Протестовано browser-session mode (gemini.google.com)**
- [ ] **Протестовано історію (відкривається, видаляється)**
- [ ] **Перевірено dark mode на dark YouTube**

### Store асети
- [ ] **Privacy Policy hosted на стабільному URL** (наприклад через GitHub Pages)
- [ ] **5 скріншотів 1280×800** за композиціями з [ASSETS_GUIDE.md](ASSETS_GUIDE.md)
  - [ ] YouTube sidebar embed
  - [ ] Web article + floating panel
  - [ ] PDF summary
  - [ ] Q&A chat
  - [ ] (для v1 можна без upsell screenshot — заміни на onboarding step 2)
- [ ] Small promo tile 440×280 (опційно)
- [ ] Large promo tile 920×680 (опційно)

### CWS форма
- [ ] Зайти на https://chrome.google.com/webstore/devconsole/ → **$5 fee** (one-time)
- [ ] Click **Add new item** → upload `dist/ai-summarizer-1.0.0.zip`
- [ ] Поля з [STORE_LISTING.md](STORE_LISTING.md):
  - Name: `AI Summarizer`
  - Short description: див. STORE_LISTING.md → English short
  - Detailed description: див. STORE_LISTING.md → English detailed
  - Category: **Productivity**
  - Single purpose: `Summarize web content (videos, articles, PDFs) using AI models.`
- [ ] Додати **Ukrainian** і **Russian** як additional languages з відповідними описами
- [ ] Privacy Policy URL: вставити hosted URL
- [ ] **Permissions justification** — скопіювати таблицю з STORE_LISTING.md
- [ ] Screenshots upload
- [ ] Submit for review

---

## 🎯 Що сказати модераторам у відповідь на типові питання

### "Why do you need `<all_urls>` permission?"

> The extension adds a floating "Summarize" button to article and PDF pages so the user can summarize the page they're reading. Without `<all_urls>` we'd be limited to a small fixed list of sites (YouTube, Vimeo), which would defeat the core "summarize anything on the web" value prop. The button only injects the UI — page content is never read or transmitted until the user explicitly clicks Summarize.

### "Do you collect user data?"

> No. v1.0.0 has no backend. API keys are stored locally in `chrome.storage.local` and only sent to the AI provider the user selected (Google Gemini / OpenAI / Anthropic). No analytics, no third-party trackers, no server we operate. See Privacy Policy.

### "Why do you need `host_permissions` for gemini.google.com / chatgpt.com / claude.ai?"

> These hosts are used by the optional "browser session" mode — the extension can drive the user's already-signed-in tab on any of the three AI sites instead of using an API key. We never read anything on those tabs unless the user has selected that mode in settings and clicks Summarize.

### "Single purpose violation?"

> Single purpose: summarizing web content. Everything else (video transcripts, PDF text extraction, article extraction, Q&A about the just-summarized content) is in direct service of that one purpose.

---

## ⏱️ Очікувані терміни

- **CWS review:** 1-3 робочих дні зазвичай. Рідко тиждень при manual permission review.
- **Перші користувачі:** після approval listing з'явиться у пошуку через ~24h.
- **Перші відгуки:** ~50-100 installs до перших ratings.

---

## 🔄 Що далі після v1

Коли заходимо в `RELEASE_MODE = 'full'`:

1. **Створити Supabase проект** + запустити `schema.sql`
2. **Створити Google OAuth client** для SSO
3. Оновити `SUPABASE_URL` + `SUPABASE_ANON` у config.js
4. **Обрати billing provider:** Paddle / Lemon Squeezy / Stripe (через Atlas)
5. Deploy відповідних Edge Functions (див. README)
6. Deploy `ai-proxy` Edge Function з нашими pool ключами
7. **Повернути `auth/auth.html`** у `web_accessible_resources` у manifest.json (видалено у v1.0.8 щоб reviewer не натикався на неробочий Sign Up)
8. У `extension/onboarding/onboarding.js` прибрати рядки `poolBox.hidden = true`, `onbGoogle.disabled = true`, `onbEmail.hidden = true` (defensive guards для free mode)
9. Змінити `RELEASE_MODE = 'full'` у config.js
10. **Активувати forced login для всіх** — модальне вікно «Sign in to continue» блокує користувача поки не залогіниться через Google SSO або email. Код у `auth/auth.html` готовий. У `popup.js` додати `if (!session) { showAuthGate(); return; }` на старті init(). Текст: «Ask questions about videos, customize language and AI model, save summaries, track usage, and more — sign in to continue.»
11. Оновити CWS listing description — додати Pro фічі
12. Bump version → 1.1.0
13. Submit оновлення

> **Важливо для CWS:** при поверненні forced login переконатись що Supabase реально працює (URL + ANON налаштовані, проект створено, RLS активна). Інакше Red Potassium rejection повториться.

Існуючі користувачі v1.0.0 побачать у Settings новий розділ «Sign in to sync» — підписатись необов'язково, BYOK продовжує працювати.

---

## 🆘 Якщо щось пішло не так

**Rejection: "Excessive permissions"**
- Поясніть `<all_urls>` як floating button injection (див. вище).
- Якщо не приймуть — стиснемо до конкретних доменів (~50 популярних сайтів).

**Rejection: "Missing privacy disclosure"**
- Перевірте чи Privacy Policy URL відкривається у incognito.
- Доступний має бути без auth і без 30x redirect.

**Rejection: "Misleading metadata"**
- Зменшіть claim'и про "AI" → конкретно "Google Gemini, OpenAI, Anthropic Claude".
- Не використовуйте бренди як заголовки розширення.

**Rejection: "Functionality not working"**
- Тестують у чистому профілі. Якщо ваш onboarding вимагає вставити ключ — додайте demo mode чи скріншот де чітко видно процес.

---

## 📦 Файл для upload

**Path:** `dist/ai-summarizer-1.0.0.zip`
**Size:** 114 KB
**SHA256:** виведено після build (у консолі)

Завантажуй цей файл на https://chrome.google.com/webstore/devconsole/.
