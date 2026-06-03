# 🪄 AI Summarizer

[🇬🇧 English](README.md) · **🇺🇦 Українською**

> Безкоштовне Chrome-розширення, яке робить підсумок **будь-якого відео, статті чи PDF** за секунди — через Gemini, ChatGPT або Claude. А потім дозволяє ставити запитання про підсумоване.

[![Ліцензія: MIT](https://img.shields.io/badge/%D0%9B%D1%96%D1%86%D0%B5%D0%BD%D0%B7%D1%96%D1%8F-MIT-blue.svg)](LICENSE)
[![Chrome 124+](https://img.shields.io/badge/Chrome-124%2B-brightgreen)](https://www.google.com/chrome/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Версія](https://img.shields.io/badge/%D0%B2%D0%B5%D1%80%D1%81%D1%96%D1%8F-1.0.3-purple)](dist/)

---

## ✨ Що вміє

| | |
|---|---|
| 🎬 **Відео** | YouTube · Vimeo · Twitch · TikTok · Instagram · X (Twitter) |
| 📄 **Веб-сторінки** | Будь-яка стаття, блог, документація |
| 📕 **PDF-документи** | За URL або через файл — Gemini читає нативно, включно зі сканами |
| 💬 **Q&A чат** | Запитуйте додаткові питання про щойно підсумований контент |
| ⚡ **Streaming** | Дивіться як підсумок зʼявляється посимвольно, як у ChatGPT |
| 🧩 **Довгий контент** | 3-годинні відео та 200-сторінкові PDF через паралельний map-reduce |
| 🌍 **35 мов** | Підсумок 35 мовами. Інтерфейс англійською / українською / російською |
| 🎨 **Темна тема** | Автоматично слідує за темною темою YouTube |
| 📥 **Експорт** | Копіювати Markdown або завантажити `.md` файл |
| 🕐 **Історія** | Локально зберігаються останні 50 підсумків |
| 🔌 **3 AI-провайдери** | Свій API-ключ або вже залогінена вкладка |

## 🤖 Підтримувані моделі

| Провайдер | Моделі |
|---|---|
| **Google Gemini** | 2.0 Flash · 2.5 Flash · 1.5 Flash · 2.5 Pro · 1.5 Pro |
| **OpenAI** | GPT-4o mini · GPT-3.5 Turbo · GPT-4o · GPT-4 Turbo · GPT-4.1 · o3-mini · o1 |
| **Anthropic** | Claude Haiku 4.5 · 3.5 Haiku · Sonnet 4.6 · 3.5 Sonnet · Opus 4.6 · 3 Opus |

## 🚀 Встановлення

### З Chrome Web Store
*Скоро — v1.0.3 зараз на модерації CWS.*

### З вихідного коду (розробники)

```bash
git clone https://github.com/nazarmazur/AI_summarizer.git
```

1. Відкрийте `chrome://extensions/` у Chrome
2. Увімкніть **Режим розробника** (перемикач справа вгорі)
3. Натисніть **Завантажити розпаковане** → виберіть папку `extension/`
4. Onboarding wizard зʼявиться автоматично — вставте свій API-ключ Gemini / OpenAI / Anthropic, або користуйтеся сесією браузера

### Готовий `.zip`

Останній production-build лежить у [`dist/ai-summarizer-1.0.3.zip`](dist/) (117 KB) — готовий для upload у Chrome Web Store.

## 🔑 Як отримати API-ключ

| Провайдер | Безкоштовно? | Звідки |
|---|---|---|
| **Gemini** | ✅ Щедро | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| **OpenAI** | ❌ $5 starter | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Anthropic** | ✅ $5 стартові кредити | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |

API-ключі зберігаються тільки у `chrome.storage.local` — нікуди не передаються з вашого браузера.

## 📂 Структура проекту

```
extension/                 # Сам розширення (Manifest V3, чистий JS)
├── manifest.json
├── _locales/{uk,ru,en}/   # Інтерфейс 3-ма мовами
├── icons/                 # PNG 16/32/48/128 px
├── background/            # Service worker — оркестратор
├── popup/                 # UI попапа тулбару
├── auth/                  # Логін (приховано у free mode)
├── options/               # Сторінка налаштувань
├── onboarding/            # 4-кроковий welcome wizard
├── history/               # Перегляд минулих підсумків
├── content/               # UI всередині сторінок (карта YouTube, плаваюча панель)
│   ├── page.js + page.css
│   └── bridges/           # Драйвери браузерної сесії Gemini/ChatGPT/Claude
└── lib/
    ├── config.js          # Налаштування провайдерів, мови, моделі
    ├── ai-api.js          # Уніфікований streaming Gemini / OpenAI / Anthropic
    ├── extractors/        # YouTube · Vimeo · Twitch · social · webpage · PDF
    ├── prompts.js         # Шаблони промптів: summary / timestamps / chat
    ├── templates.js       # Кастомні шаблони (Pro)
    ├── chunker.js         # Map-reduce для довгого контенту
    ├── chat-store.js      # Контекст Q&A сесії
    ├── history-store.js   # Локальна історія
    ├── supabase.js        # Auth-клієнт (опційно, тільки full mode)
    ├── tier.js            # Перевірка Free / Pro тарифу
    ├── features.js        # Прапори фіч
    └── bridge-health.js   # Авто-fallback коли bridge ламається
supabase/                  # Опційний бекенд (для майбутнього Pro)
├── schema.sql             # Таблиці + RLS + RPC
└── functions/             # Edge Functions для білінгу та ai-proxy
store/                     # Асети для Chrome Web Store
├── PRIVACY.html           # Privacy policy (хоститься через GH Pages)
├── STORE_LISTING.md       # Опис магазину 3-ма мовами
├── ASSETS_GUIDE.md        # Гайд по композиції скріншотів
├── LAUNCH.md              # Чекліст submission
├── build-zip.ps1          # Робить dist/ai-summarizer-*.zip
├── make-screenshots.ps1   # Перегенерує всі PNG з HTML-мокапів
└── assets/                # 5 скріншотів + 3 промо-тайли
```

## 🏗️ Збірка

```powershell
# Windows PowerShell — створює dist/ai-summarizer-X.Y.Z.zip
.\store\build-zip.ps1 -Version 1.0.4
```

## 🔬 Pro tier (у майбутньому)

Кодова база вже містить повноцінний Pro tier (Stripe / Paddle / Lemon Squeezy + Supabase + Pool API). Активується одним прапором:

```js
// extension/lib/config.js
export const RELEASE_MODE = 'free';   // ← змінити на 'full' для Pro
```

Переключення на `'full'` додає:
- Логін (Google SSO + email/пароль через Supabase)
- Підписка з 7-денним пробним періодом
- Синхронізована історія між пристроями
- Pool API (50 підсумків/міс на наших ключах)
- Преміум моделі (Gemini 2.5 Pro, GPT-4o, Claude Sonnet тощо)
- Клікабельні тайм-коди · custom промпти · expor

Деталі активації: [store/LAUNCH.md](store/LAUNCH.md)

## 🔒 Приватність

- 🚫 Жодної аналітики, third-party трекерів, реклами
- 🚫 Жодного сервера в pipeline-і AI підсумарізації (у free mode)
- 🚫 Ми ніколи не бачимо ваші API-ключі — вони у `chrome.storage.local`
- ✅ Вміст сторінки читається **тільки після** кліку Summarize
- ✅ Локальну історію можна стерти у будь-який момент

Повна Privacy Policy: [nazarmazur.github.io/AI_summarizer/store/PRIVACY.html](https://nazarmazur.github.io/AI_summarizer/store/PRIVACY.html)

## 🛠️ Стек

- **Без build step.** Чисті ES modules, vanilla JS, без бандлерів.
- **Без runtime залежностей.** Нуль npm-пакетів у самому розширенні.
- **Опційно:** Supabase (auth, синк історії, webhook-и білінгу), Paddle / Lemon Squeezy / Stripe (білінг), pdfjs-dist (offline-витяг тексту з PDF).
- **Браузер:** Chrome 124+ (DOMParser у service workers).

## 🤝 Контрибуції

PR-и вітаються! Дивіться [відкриті issues](https://github.com/nazarmazur/AI_summarizer/issues).

Швидкий локальний тест:

```powershell
.\store\qa-smoke.ps1    # відкриває Chrome з чистим профілем + розширенням + 4 тест-вкладки
```

## 📜 Ліцензія

[MIT](LICENSE) — робіть що завгодно, тільки збережіть копірайт.

## 🙋 Контакт

[m.nazar77@gmail.com](mailto:m.nazar77@gmail.com) · [@nazarmazur на GitHub](https://github.com/nazarmazur)
