// =============================================================================
// Release mode controls how much of the extension is exposed to end users.
//
//   'free'  — v1 launch:
//             • BYOK only (user provides their own API key, or uses browser session)
//             • No sign-in required, no Pro tier, no Stripe/Paddle
//             • Local history only (chrome.storage)
//             • Onboarding hides the Pool option
//             • All "PRO" badges + upsell modal are hidden
//   'full'  — everything wired up:
//             • Sign-in required for history sync
//             • Pro subscription, pooled API, billing card, upsell flow
//             • Server-side history in Supabase
//
// Switch to 'full' once you've deployed Supabase + a billing provider + the
// ai-proxy Edge Function.
// =============================================================================
export const RELEASE_MODE = 'free';

// Project-level configuration. Required only when RELEASE_MODE='full'; the
// 'free' build can run with the placeholders below — Supabase calls just
// silently no-op.
export const SUPABASE_URL  = 'https://YOUR-PROJECT.supabase.co';
export const SUPABASE_ANON = 'YOUR-PUBLIC-ANON-KEY';

// True when Supabase URL/ANON have been set to real values.
export const HAS_SUPABASE = !SUPABASE_URL.includes('YOUR-PROJECT') && !SUPABASE_ANON.includes('YOUR-');

// True when Pro features should be visible/accessible.
export const HAS_PRO = RELEASE_MODE === 'full';

// =============================================================================
// Voluntary donations ("Support development"). This is NOT a subscription and
// NOT a paywall — it never gates any feature. Disabled by default so it does
// not appear in the version under Chrome Web Store review. After the extension
// is APPROVED, fill in the links/addresses below, set enabled: true, bump the
// version, and submit an update.
//
// CWS-safety rules for this block: framing is always "Support" / "Donate",
// never "Upgrade / Pro / Premium / Trial / Subscribe". PayPal link uses
// no_recurring=1 to make it explicitly one-time.
// =============================================================================
export const DONATE = {
  enabled: false,            // ← flip to true ONLY after CWS approval

  // One-time PayPal donation bound to the developer's PayPal email.
  paypal:  'https://www.paypal.com/donate/?business=m.nazar77@gmail.com&no_recurring=1&item_name=Support%20Smart%20AI%20Summarizer&currency_code=USD',

  // Patreon page — fill in your handle before enabling.
  patreon: 'https://www.patreon.com/YOUR_HANDLE',

  // Crypto wallet addresses — fill in before enabling. Leave a value empty to
  // hide that coin. Shown with a copy button (no third party, no fees).
  crypto: {
    BTC:  '',   // e.g. 'bc1q...'
    ETH:  '',   // e.g. '0x...'
    USDT: '',   // TRC20 or ERC20 address
  },
};

// Which billing provider to use for Pro subscriptions.
// 'paddle' (recommended)   — Paddle Billing, MoR, handles VAT/tax globally
// 'lemonsqueezy'           — Lemon Squeezy, MoR, simpler setup
// 'stripe'                 — Stripe (requires US/UK/EU entity, Stripe Atlas works)
//
// The deployer must have ALSO deployed the corresponding Edge Functions
// (paddle-* / lemonsqueezy-* / stripe-*) for the selected provider.
export const BILLING_PROVIDER = 'paddle';

// OAuth redirect that Supabase will send the user back to. For Chrome extensions
// we use chrome.identity.getRedirectURL() which gives a stable https://<ext-id>.chromiumapp.org URL.
// You MUST add this URL to: Supabase → Auth → URL Configuration → Redirect URLs.
export function getOAuthRedirect() {
  return chrome.identity.getRedirectURL('supabase-auth');
}

// Each entry: { provider, model, label, description, group ('free'|'pro'), order }
// `provider` must match the streamer in lib/ai-api.js
// `model` is the API model identifier — must be a real model id on the provider's API
// `description` is shown under the model name in the picker
export const MODELS = {
  // ─── Google Gemini ─── (model ids verified against the live API, 2026-06) ──
  gemini:            { provider: 'gemini', model: 'gemini-2.5-flash',     label: 'Gemini 2.5 Flash',       description: 'Fast & affordable. Great for daily summaries.',   group: 'free', order: 10 },
  geminiFlashLatest: { provider: 'gemini', model: 'gemini-flash-latest',  label: 'Gemini Flash (latest)',  description: 'Always the newest fast Flash model.',             group: 'free', order: 11 },
  gemini3Flash:      { provider: 'gemini', model: 'gemini-3.5-flash',     label: 'Gemini 3.5 Flash',       description: 'Newest Flash generation. Smart and quick.',       group: 'free', order: 12 },
  geminiPro:         { provider: 'gemini', model: 'gemini-2.5-pro',       label: 'Gemini 2.5 Pro',         description: 'Deeper reasoning for complex content.',           group: 'pro',  order: 13 },
  geminiProLatest:   { provider: 'gemini', model: 'gemini-pro-latest',    label: 'Gemini Pro (latest)',    description: 'Always the newest Pro model.',                    group: 'pro',  order: 14 },

  // ─── OpenAI ─── (gpt-3.5-turbo & gpt-4-turbo verified dead; o1 retiring) ────
  gpt:           { provider: 'openai',    model: 'gpt-4o-mini',                label: 'GPT-4o mini',                description: 'Affordable OpenAI for everyday summaries.',        group: 'free', order: 20 },
  gptPro:        { provider: 'openai',    model: 'gpt-4o',                     label: 'GPT-4o',                     description: 'OpenAI flagship for nuanced summaries.',           group: 'pro',  order: 21 },
  gpt41:         { provider: 'openai',    model: 'gpt-4.1',                    label: 'GPT-4.1',                    description: 'Large 1M-token context. Best for long content.',   group: 'pro',  order: 22 },
  o3Mini:        { provider: 'openai',    model: 'o3-mini',                    label: 'OpenAI o3-mini',             description: 'Reasoning model. Slower, stronger on logic.',      group: 'pro',  order: 23 },

  // ─── Anthropic Claude ─── (Anthropic API rejects "-latest" aliases) ────────
  claude:        { provider: 'anthropic', model: 'claude-haiku-4-5',           label: 'Claude Haiku 4.5',           description: 'Fast & affordable. Excellent for summaries.',      group: 'free', order: 30 },
  claudePro:     { provider: 'anthropic', model: 'claude-sonnet-4-6',          label: 'Claude Sonnet 4.6',          description: 'Best balance of depth and speed.',                 group: 'pro',  order: 31 },
  claudeOpus:    { provider: 'anthropic', model: 'claude-opus-4-6',            label: 'Claude Opus 4.6',            description: 'Powerful for deep, careful analysis.',             group: 'pro',  order: 32 },
  claudeOpus8:   { provider: 'anthropic', model: 'claude-opus-4-8',            label: 'Claude Opus 4.8',            description: 'Newest Opus. Anthropic\'s most capable model.',     group: 'pro',  order: 33 },
};

// Helper: get models grouped by provider for menu rendering.
export function modelsByProvider() {
  const groups = { gemini: [], openai: [], anthropic: [] };
  for (const [key, m] of Object.entries(MODELS)) {
    if (groups[m.provider]) groups[m.provider].push({ key, ...m });
  }
  for (const k of Object.keys(groups)) groups[k].sort((a, b) => a.order - b.order);
  return groups;
}

export const DEFAULT_SETTINGS = {
  source: 'api',           // 'api' | 'browser'
  model:  'auto',          // 'auto' | one of MODELS keys
  language: 'auto',        // 'auto' = follow YouTube/system, or 'uk', 'ru', 'en', 'es', 'de', 'fr', 'pl'
  length: 'medium',        // 'short' | 'medium' | 'long'
  uiLang: 'auto',          // 'auto' | 'uk' | 'ru' | 'en'
  pdfMode: 'gemini',       // 'gemini' (native PDF) | 'pdfjs' (local text extract)
};

// 35 most-used languages. Ordered by global speaker count.
// Flag emojis are decorative — fall back gracefully if the OS lacks emoji fonts.
export const LANGUAGES = [
  { code: 'auto', label: '🌐 Auto' },

  // Top-tier internet languages
  { code: 'en',   label: '🇬🇧 English' },
  { code: 'zh',   label: '🇨🇳 中文 (简体)' },
  { code: 'es',   label: '🇪🇸 Español' },
  { code: 'ar',   label: '🇸🇦 العربية' },
  { code: 'pt',   label: '🇵🇹 Português' },
  { code: 'id',   label: '🇮🇩 Indonesia' },
  { code: 'fr',   label: '🇫🇷 Français' },
  { code: 'ja',   label: '🇯🇵 日本語' },
  { code: 'ru',   label: '🇷🇺 Русский' },
  { code: 'de',   label: '🇩🇪 Deutsch' },
  { code: 'ko',   label: '🇰🇷 한국어' },
  { code: 'tr',   label: '🇹🇷 Türkçe' },

  // European
  { code: 'it',   label: '🇮🇹 Italiano' },
  { code: 'pl',   label: '🇵🇱 Polski' },
  { code: 'uk',   label: '🇺🇦 Українська' },
  { code: 'nl',   label: '🇳🇱 Nederlands' },
  { code: 'ro',   label: '🇷🇴 Română' },
  { code: 'sv',   label: '🇸🇪 Svenska' },
  { code: 'cs',   label: '🇨🇿 Čeština' },
  { code: 'el',   label: '🇬🇷 Ελληνικά' },
  { code: 'hu',   label: '🇭🇺 Magyar' },
  { code: 'da',   label: '🇩🇰 Dansk' },
  { code: 'fi',   label: '🇫🇮 Suomi' },
  { code: 'no',   label: '🇳🇴 Norsk' },
  { code: 'bg',   label: '🇧🇬 Български' },
  { code: 'sk',   label: '🇸🇰 Slovenčina' },
  { code: 'sr',   label: '🇷🇸 Српски' },
  { code: 'hr',   label: '🇭🇷 Hrvatski' },

  // Asian + Middle East
  { code: 'vi',   label: '🇻🇳 Tiếng Việt' },
  { code: 'fa',   label: '🇮🇷 فارسی' },
  { code: 'he',   label: '🇮🇱 עברית' },
  { code: 'hi',   label: '🇮🇳 हिन्दी' },
  { code: 'th',   label: '🇹🇭 ไทย' },
  { code: 'bn',   label: '🇧🇩 বাংলা' },
  { code: 'ms',   label: '🇲🇾 Bahasa Melayu' },
];
