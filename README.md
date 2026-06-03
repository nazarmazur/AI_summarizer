# AI Summarizer

> **🚀 v1.0.0 — Ready to publish.** Build is in `dist/ai-summarizer-1.0.0.zip` (114 KB). Screenshots, promo tiles, and privacy policy are in [`store/`](store/). See [**store/LAUNCH.md**](store/LAUNCH.md) for the submission checklist.

Безкоштовне Chrome-розширення, яке робить підсумок **будь-якого контенту**:

- 🎬 **Відео** на YouTube, Vimeo, Twitch, TikTok, Instagram, X(Twitter)
- 📄 **Веб-сторінки** — статті, блоги, документація
- 📕 **PDF документи** — за URL або через файл-пікер

…за допомогою **Gemini**, **ChatGPT** або **Claude**. Підтримує два режими:

1. **Через API-ключ** — швидко, стабільно, тарифікується за вашим лімітом у Google AI Studio / OpenAI / Anthropic.
2. **Через залогінений браузер** — без API-ключів, розширення відкриває gemini.google.com / chatgpt.com / claude.ai у фоновій вкладці й використовує вашу сесію.

Авторизація через **Google SSO або email/пароль** (Supabase). Безкоштовний tier Supabase покриває тисячі користувачів.

---

## Можливості

- **Картка на YouTube у правому сайдбарі**, над списком рекомендованих відео — як на твоєму скріншоті
- Кнопка **AI Summarize** біля Subscribe, яка прокручує до картки і розгортає її
- Pop-up з тулбару Chrome (`Alt+S`)
- Вибір **мови** підсумку (8 мов + авто)
- Вибір **довжини**: коротка / середня / детальна
- Вибір **моделі**: Auto / Gemini 2.0 Flash / Gemini 2.5 Pro / GPT-4o mini / GPT-4o / Claude Haiku 4.5 / Claude Sonnet 4.6
- 2 види виводу:
  - **Сводка** — структурований підсумок відео
  - **Тайм-коди** — клікабельні відмітки, що відкривають потрібну секунду
- Автоматична темна тема, що відстежує темну тему YouTube
- Історія підсумків у Supabase (синхронізується між пристроями)
- Локалізація UA / RU / EN

---

## Встановлення (одноразово, ~5-10 хв)

### 1. Завантажити проект

Розпакуйте архів куди завгодно, наприклад у `D:\AI summarizer`.

### 2. Створити проект у Supabase (для логіну)

1. Зайдіть на [supabase.com](https://supabase.com) → **Start your project** (вхід через GitHub або email).
2. **New project** → введіть назву, оберіть регіон, придумайте пароль БД. Зачекайте ~1 хв.
3. Зліва **SQL Editor** → **New query** → скопіюйте вміст файлу [`supabase/schema.sql`](supabase/schema.sql) → **Run**. Це створить таблиці `profiles` та `summaries` з RLS.
4. **Project Settings** → **API** → скопіюйте:
   - **Project URL** (виглядає як `https://xxxxxx.supabase.co`)
   - **anon / public** ключ (починається з `eyJ…`)

### 3. Налаштувати Google SSO у Supabase

1. У Supabase → **Authentication** → **Providers** → увімкніть **Google**.
2. Окремо у [Google Cloud Console](https://console.cloud.google.com/) створіть OAuth 2.0 Client ID:
   - Тип: **Web application**
   - **Authorized redirect URIs**: вставте те, що Supabase показує (`https://<project>.supabase.co/auth/v1/callback`)
3. Скопіюйте отримані `Client ID` + `Client Secret` у форму Google провайдера в Supabase → **Save**.
4. У Supabase → **Authentication** → **URL Configuration** → **Redirect URLs**, додайте:
   ```
   https://<EXTENSION_ID>.chromiumapp.org/supabase-auth
   ```
   `<EXTENSION_ID>` ви дізнаєтеся в кроці 5.

### 4. Вставити свої ключі в код

Відредагуйте файл [`extension/lib/config.js`](extension/lib/config.js):

```js
export const SUPABASE_URL  = 'https://xxxxxx.supabase.co';   // ← ваш URL
export const SUPABASE_ANON = 'eyJ...';                       // ← ваш anon key
```

### 5. Завантажити розширення в Chrome

1. Відкрийте `chrome://extensions`
2. Увімкніть **Developer mode** (вгорі праворуч)
3. **Load unpacked** → виберіть папку `D:\AI summarizer\extension`
4. Скопіюйте показаний **ID розширення** (виглядає як `abcdefghijklmnopqrstuvwxyzabcdef`)
5. Поверніться в Supabase → **Auth → URL Configuration → Redirect URLs** → додайте:
   ```
   https://<тойID>.chromiumapp.org/supabase-auth
   ```
   і збережіть.

### 6. (Опційно) Отримати API-ключі

Якщо хочете режим **через API**, заведіть ключі:

| Сервіс    | Звідки                                                                 |
|-----------|------------------------------------------------------------------------|
| Gemini    | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) — безкоштовний tier є |
| OpenAI    | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) — потрібен баланс         |
| Anthropic | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) — є кредити |

Після встановлення розширення автоматично відкриє вкладку налаштувань — там вставте ключі та збережіть.

Якщо API-ключів немає — у налаштуваннях перемкніть **«Як використовувати AI»** на **«Через залогінений браузер»**. Тоді просто залогіньтеся в gemini.google.com / chatgpt.com / claude.ai (та лишіть вкладки відкритими) — розширення скористається вашою сесією.

---

## Як користуватися

- **На сторінці відео YouTube** — натисніть фіолетову кнопку **AI Summarize** біля Subscribe. Праворуч з'явиться панель з тим же UI, що й у попапі.
- **З будь-якої сторінки** — натисніть іконку розширення в тулбарі або `Alt+S`.
- **Вставити URL** — введіть/вставте лінк у поле та натисніть кнопку відправки.

Кнопки **Сводка** (підсумок) і **Тайм-коди** під полем URL.

---

## Підтримка PDF

Розширення підтримує два режими обробки PDF — обирається в Налаштуваннях → **PDF обробка**:

### Gemini native (за замовчуванням)
- Просто вибирай Gemini-модель — PDF відсилається на API як inline base64
- Працює зі скан-ами, таблицями, складною версткою
- Ліміт: 20 MB
- ⚠️ Не працює з GPT/Claude — для них використовуй pdfjs

### pdf.js (локальний витяг тексту)
- Витягує текст у браузері, відсилає як звичайний текст до будь-якої моделі
- Не працює зі сканами (потрібен OCR)

**Установка pdf.js** (одноразово):

1. `npm i pdfjs-dist@4` будь-де (або скачайте https://mozilla.github.io/pdf.js/legacy/)
2. Скопіюйте файли в розширення:
   ```
   cp node_modules/pdfjs-dist/legacy/build/pdf.min.mjs        extension/lib/pdfjs/
   cp node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs extension/lib/pdfjs/
   ```
3. Reload розширення в `chrome://extensions`

Без pdf.js — режим залишається на Gemini native, що не потребує жодних бібліотек.

## Підписка Pro ($4.99/міс або $39/рік)

Розширення працює як **freemium**:

| | Free | Pro |
|---|---|---|
| Підсумок відео (Сводка) | ✓ | ✓ |
| Базові моделі (Gemini Flash, GPT-4o mini, Claude Haiku) | ✓ | ✓ |
| Браузерна сесія (без API ключів) | ✓ | ✓ |
| Власні API-ключі (BYOK) | ✓ (unlimited) | ✓ |
| Преміум моделі (Gemini 2.5 Pro, GPT-4o, Claude Sonnet) | — | ✓ |
| Клікабельні тайм-коди | — | ✓ |
| Відео довші за 30 хв | — | ✓ |
| Custom промпти, експорт, повна історія | — | ✓ |
| Пул API без власних ключів | 5/день | 50/місяць |

### Pooled API (Edge Function ai-proxy)

Pro обіцяє «50 запитів/міс на наших ключах» — для цього треба задеплоїти Edge Function що проксує виклики до AI з вашими (загальними) ключами.

1. **Отримати свої "pool" ключі** (через які будуть йти всі запити):
   - Gemini → [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
   - OpenAI → [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   - Anthropic → [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)

2. **Задеплоїти Edge Function**:
   ```bash
   supabase functions deploy ai-proxy
   ```

3. **Встановити секрети** (без `--no-verify-jwt` — функція сама перевіряє auth):
   ```bash
   supabase secrets set \
     AIS_GEMINI_KEY=AIza... \
     AIS_OPENAI_KEY=sk-... \
     AIS_ANTHROPIC_KEY=sk-ant-...
   ```

Тепер у Налаштуваннях розширення → «Як використовувати AI» можна вибрати **«Через наші ключі (пул)»** і користуватися без жодних власних ключів. Free отримує 25/міс, Pro — 50/міс (ліміт прописаний у [ai-proxy/index.ts](supabase/functions/ai-proxy/index.ts)).

Витрати на pool ключі — ваша зона відповідальності. Один підсумок коштує ~$0.0001-0.001 в залежності від моделі і довжини відео. На вільному tier Gemini й Anthropic безкоштовно для розумних обсягів.

## Біллінг (Pro підписка)

Підтримується **3 провайдери**, обирається через `BILLING_PROVIDER` у [`extension/lib/config.js`](extension/lib/config.js):

| Провайдер | Коли обирати | Доступний з України |
|---|---|---|
| **`paddle`** (рекомендовано) | Merchant of Record. Paddle сам платить VAT/tax. Стандарт для indie SaaS | ✅ (ФОП/ТОВ) |
| **`lemonsqueezy`** | Те саме, простіший setup. Куплений Stripe-ом у 2024 | ✅ (ФОП/ТОВ) |
| **`stripe`** | Класичний Stripe — нижчі комісії, але потрібна US/EU entity | Тільки через Stripe Atlas ($500) |

Розгорнути потрібно **тільки 3 функції активного провайдера** (інші можна не деплоїти).

---

### Варіант A: Paddle (рекомендовано)

1. Створіть акаунт на [paddle.com](https://paddle.com). Verification ~1-3 дні.
2. **Catalog → Products** → створіть «AI Summarizer Pro».
3. У продукта створіть **дві ціни**:
   - Monthly: $4.99 USD recurring, billing cycle `month`, **trial period 7 days**
   - Yearly: $39 USD recurring, billing cycle `year`, **trial period 7 days**
4. Скопіюйте `price_id` обох (формат `pri_…`).
5. **Developer Tools → Notifications → Add Notification**:
   - URL: `https://<project>.supabase.co/functions/v1/paddle-webhook`
   - Events: `subscription.created`, `subscription.updated`, `subscription.canceled`, `subscription.activated`, `subscription.trialing`
   - Скопіюйте **Secret key** (формат `pdl_ntfset_…`).
6. **Developer Tools → Authentication → Generate API key** (формат `pdl_live_…` для prod або `pdl_sdbx_…` для sandbox).
7. Deploy + secrets:
   ```bash
   supabase functions deploy paddle-checkout
   supabase functions deploy paddle-portal
   supabase functions deploy paddle-webhook --no-verify-jwt
   supabase secrets set \
     PADDLE_API_KEY=pdl_live_… \
     PADDLE_ENV=live \
     PADDLE_PRICE_MONTHLY=pri_… \
     PADDLE_PRICE_YEARLY=pri_… \
     PADDLE_WEBHOOK_SECRET=pdl_ntfset_…
   ```
8. У `extension/lib/config.js`: `BILLING_PROVIDER = 'paddle'`.

---

### Варіант B: Lemon Squeezy

1. Створіть акаунт на [lemonsqueezy.com](https://lemonsqueezy.com).
2. Створіть Store → продукт «AI Summarizer Pro» (Subscription type).
3. У продукта створіть **два варіанти**:
   - Monthly: $4.99, billing every 1 month, **Has free trial: 7 days**
   - Yearly: $39, billing every 1 year, **Has free trial: 7 days**
4. Скопіюйте Store ID і обидва Variant ID з URL дашборда.
5. **Settings → Webhooks → Create**:
   - URL: `https://<project>.supabase.co/functions/v1/lemonsqueezy-webhook`
   - Events: всі `subscription_*`
   - Створіть будь-який **Signing Secret** (запам'ятайте — він потрібен у env).
6. **Settings → API → Create API key**.
7. Deploy + secrets:
   ```bash
   supabase functions deploy lemonsqueezy-checkout
   supabase functions deploy lemonsqueezy-portal
   supabase functions deploy lemonsqueezy-webhook --no-verify-jwt
   supabase secrets set \
     LEMONSQUEEZY_API_KEY=lsk_… \
     LEMONSQUEEZY_STORE_ID=12345 \
     LEMONSQUEEZY_VARIANT_MONTHLY=67890 \
     LEMONSQUEEZY_VARIANT_YEARLY=67891 \
     LEMONSQUEEZY_WEBHOOK_SECRET=your_secret_string
   ```
8. У `extension/lib/config.js`: `BILLING_PROVIDER = 'lemonsqueezy'`.

---

### Варіант C: Stripe (у майбутньому через Stripe Atlas)

1. Реєструйте US LLC через [stripe.com/atlas](https://stripe.com/atlas) — $500 одноразово.
2. **Stripe Dashboard** → Products → створити «AI Summarizer Pro»:
   - Monthly $4.99 USD, **trial 7 days**
   - Yearly $39 USD, **trial 7 days**
3. Скопіюйте `price_id` обох (формат `price_…`).
4. **Webhooks** → Add endpoint:
   - URL: `https://<project>.supabase.co/functions/v1/stripe-webhook`
   - Events: `customer.subscription.created/updated/deleted` + `checkout.session.completed`
   - Скопіюйте **Signing secret** (`whsec_…`).
5. Deploy + secrets:
   ```bash
   supabase functions deploy stripe-checkout
   supabase functions deploy stripe-portal
   supabase functions deploy stripe-webhook --no-verify-jwt
   supabase secrets set \
     STRIPE_SECRET_KEY=sk_live_… \
     STRIPE_PRICE_MONTHLY=price_… \
     STRIPE_PRICE_YEARLY=price_… \
     STRIPE_WEBHOOK_SECRET=whsec_…
   ```
6. У `extension/lib/config.js`: `BILLING_PROVIDER = 'stripe'`.

---

### Як переключатися між провайдерами

Усі три пишуть у спільну таблицю `subscriptions` зі стовпцем `provider`. Можна стартувати з Lemon Squeezy для швидкості, потім мігрувати на Paddle коли матиме сенс — стара історія залишається доступною. Існуючі підписники продовжать працювати через свого провайдера (бо `me_status` view їх не розрізняє), нові — через нового.

## Структура проекту

```
extension/
├── manifest.json
├── _locales/{uk,ru,en}/messages.json   # локалізація
├── icons/icon{16,32,48,128}.png
├── background/service-worker.js        # маршрутизація + транскрипт + AI
├── popup/                              # головний UI (як на скріншоті)
│   ├── popup.html / popup.css / popup.js
├── content/
│   ├── youtube.js / youtube.css        # кнопка біля плеєра
│   └── bridges/
│       ├── gemini-bridge.js            # «через залогінений браузер» для Gemini
│       ├── chatgpt-bridge.js
│       └── claude-bridge.js
├── auth/                               # сторінка логіну (Google SSO + email)
├── options/                            # сторінка налаштувань
└── lib/
    ├── config.js                       # ⚠️ тут ваш Supabase URL/ANON
    ├── supabase.js                     # auth-клієнт без важких залежностей
    ├── transcript.js                   # витяг YouTube transcript
    ├── ai-api.js                       # уніфікований інтерфейс до 3 провайдерів
    ├── prompts.js                      # промпт-шаблони
    └── i18n.js                         # helper для data-i18n атрибутів
supabase/
└── schema.sql                          # таблиці + RLS + тригер profiles
```

---

## Поширені питання

**Q: Розширення не бачить субтитрів.**
Не у всіх відео вони є. YouTube створює автоматичні субтитри для більшості мов, але для нових відео іноді потрібно 5–30 хв. Спробуйте інше відео.

**Q: Працює, але видає помилку «BRIDGE_NOT_READY».**
Це браузерний режим. Зайдіть на gemini.google.com / chatgpt.com / claude.ai, переконайтеся що ви залогінені, лишіть вкладку відкритою — і повторіть спробу.

**Q: Google SSO повертає помилку redirect.**
Перевірте, що ID розширення (`chrome://extensions`) додано в Supabase у **Redirect URLs** у форматі `https://<ID>.chromiumapp.org/supabase-auth`.

**Q: Хочу публікувати в Chrome Web Store.**
Видаліть з `manifest.json` `"key"` (якщо додасте), згенеруйте `.zip` з папки `extension/`, завантажте через [Developer Dashboard](https://chrome.google.com/webstore/devconsole/). Будьте готові пояснити дозволи `tabs`, `scripting`, `identity`.

---

## Безпека

- API-ключі зберігаються **тільки** в `chrome.storage.local` вашого браузера, нікуди не передаються
- Запити до AI йдуть **напряму** з вашого браузера до Google / OpenAI / Anthropic
- Supabase бачить лише ваш email і збережені підсумки (за бажанням можна вимкнути збереження історії — закоментуйте виклик `saveToHistory` у `background/service-worker.js`)

## Ліцензія

MIT
