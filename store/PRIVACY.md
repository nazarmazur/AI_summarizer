# AI Summarizer — Privacy Policy

_Last updated: 2026-06-01_

This Privacy Policy explains what data the **AI Summarizer** Chrome extension collects, what we do with it, and what your rights are.

## TL;DR

- We don't sell your data.
- We don't run advertising. There are no third-party trackers.
- API keys you paste stay in your browser. They are never transmitted to our servers.
- The text we send to AI providers (Google Gemini, OpenAI, Anthropic) is the content you asked us to summarise — and only that.
- Optional account features (Google SSO / email signup) store **only** your email + subscription state in Supabase.

## 1. What the extension does

When you click **Summarize** on a video, web page, or PDF, AI Summarizer:

1. Reads the URL of the page you're currently viewing, or the file you uploaded.
2. Fetches the underlying content:
   - For YouTube/Vimeo videos: the public caption track (timedtext API or VTT subtitles).
   - For web pages: the rendered HTML (extracted to plain text in your browser).
   - For PDFs: the bytes of the file you chose (either via URL or local file picker).
3. Sends that content along with your chosen prompt to the AI provider you selected (Gemini / OpenAI / Anthropic).
4. Displays the model's reply back to you.

The entire pipeline runs in your browser. We don't have a server in the middle of this flow.

## 2. What data we store

### On your device (chrome.storage.local — never leaves your computer)
- Your selected AI provider, model, language, and length preferences.
- The API keys you pasted, if any. These keys are stored locally only. We never see them.
- A per-day counter of how many free-pool requests you've used.

### On your device (chrome.storage.session — cleared when you quit the browser)
- For the Q&A follow-up chat: the extracted source content + a few back-and-forth messages for the page you just summarised. Cleared on browser close.

### On our infrastructure (Supabase — only if you sign in)
- Your email address (so you can log in across devices).
- Your subscription status mirrored from Stripe (active, canceled, plan tier, renewal date).
- Optional: a synced history of summary titles + the resulting text, **only if** you've signed in. You can delete this at any time from the Options page → Account → Delete history.

We do **not** store:
- Your IP address (Supabase logs are kept on their infrastructure, subject to [Supabase's policy](https://supabase.com/privacy)).
- Browsing history other than the URLs you actively summarise.
- The content of any page you didn't trigger a summary on.

## 3. Third parties

When you ask for a summary, the page content goes directly from your browser to the AI provider you selected. We don't proxy it.

| Provider     | What we send                          | Their privacy policy                                     |
|--------------|---------------------------------------|----------------------------------------------------------|
| Google Gemini | The page content + your prompt        | https://policies.google.com/privacy                       |
| OpenAI       | The page content + your prompt        | https://openai.com/policies/privacy-policy                |
| Anthropic    | The page content + your prompt        | https://www.anthropic.com/legal/privacy                   |
| Billing (Stripe / Paddle / Lemon Squeezy) — *optional, Pro only; not used in the free version* | Your email + customer id | See the provider's site |
| Supabase — *optional, account sync only; not used in the free version* | Email, subscription state, synced history | https://supabase.com/privacy |

> The free version of the extension has **no billing and no account** — it never contacts Stripe/Paddle/Lemon Squeezy or Supabase. Those rows describe optional features in a future paid release. The full, canonical privacy policy is the hosted [PRIVACY.html](https://nazarmazur.github.io/AI_summarizer/store/PRIVACY.html).

## 4. Permissions justification

The extension requests these Chrome permissions:

| Permission      | Why                                                                                  |
|-----------------|--------------------------------------------------------------------------------------|
| `storage`       | Save your preferences and locally-stored API key.                                    |
| `scripting`     | Inject the in-page "Summarize" button/card and read the page content only after you ask for a summary. |
| `tabs`          | Detect the active tab's URL so the panel pre-fills, and read the open video tab's transcript. |
| `activeTab`     | Access the page you're on when you click the action.                                 |
| `sidePanel`     | Open the summarizer in Chrome's docked side panel.                                    |
| host: youtube / vimeo / twitch / tiktok / instagram / x | Add the summarize UI and read video transcripts on these sites. |
| host: generativelanguage.googleapis.com, api.openai.com, api.anthropic.com | Send content + your prompt to the provider you chose. |

We do **not** read or transmit page content unless you explicitly click Summarize.

## 5. Your rights

You can:

- **Delete your account and all stored data** from the Options page → Account → Delete account. This triggers a Supabase row delete (cascades to your subscriptions, usage, and history rows).
- **Export your data** as a JSON file from Options → Account → Export.
- **Cancel your subscription** at any time via Stripe's Billing Portal (Options → Subscription → Manage). You retain Pro access until the end of the paid period.
- **Revoke API keys** in your provider's dashboard at any time; we have no copy.

For EU users: data is processed under GDPR Article 6(1)(b) — performance of a contract — for account/subscription data, and Article 6(1)(a) — consent — for optional history sync.

## 6. Contact

For privacy questions or deletion requests, reach out to: **m.nazar77@gmail.com**

This policy may be updated. Material changes will be announced in the extension's release notes.
