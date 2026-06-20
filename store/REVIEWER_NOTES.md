# Notes for the Chrome Web Store review team

Paste the text below into the **"Notes for the review team"** field (shown in the
Privacy practices tab / the submission step). Replace `PASTE_KEY_HERE` with a real
Google Gemini API key you generate for free at https://aistudio.google.com/app/apikey
(you can delete or rotate this key right after the review is approved).

--- SHORT VERSION (≤500 chars — paste this) -------------------------------------
BYOK extension — uses your own AI key. NO-KEY DEMO: onboarding Step 3 → "Try an example summary" shows Summarize working with no key/account.

Test it live with this Gemini key: PASTE_KEY_HERE
1. Toolbar icon → gear/Settings → paste the Gemini key → Save.
2. Open any YouTube video that has captions.
3. Click the toolbar icon → "Summary" — it streams in a few seconds.

No account or subscription. Key is review-only, rotated after approval.
---------------------------------------------------------------------------------

--- EXTRA-SHORT FALLBACK (~400 chars) -------------------------------------------
BYOK extension — uses your own AI key. No-key demo: onboarding Step 3 → "Try an example summary" shows it working.

Live test — Gemini key: PASTE_KEY_HERE
1. Toolbar icon → Settings → paste key → Save.
2. Open any YouTube video with captions.
3. Toolbar icon → "Summary" — streams in seconds.

No account or subscription. Key is review-only.
---------------------------------------------------------------------------------

## Why this is needed

Chrome reviewers test in a clean profile with no API key configured. A BYOK
extension cannot produce a *live* summary without a key, which is why "Summarize"
appeared not to work in earlier reviews (rejection code **Red Potassium**).

Two changes in v1.0.15 fix this for good:
1. **Zero-setup demo.** Onboarding **Step 3 → "Try an example summary"** renders a
   real, clearly-labelled summary with **no key, no account, no network** — so the
   reviewer can see the feature work immediately.
2. **Removed the non-functional "pool" option** that a CSS bug had left visible in
   the free build (picking it did nothing — another likely cause of Red Potassium).

Providing a temporary key in these notes additionally lets the reviewer exercise a
real live summary; that is the standard, Google-recommended approach for BYOK.

## Appeal text (paste into the "Submit appeal" form if you appeal the last decision)

> This is a free "bring your own API key" (BYOK) extension. The Summarize feature
> works, but in earlier reviews the tester's clean profile had no API key, so no
> live summary could be produced. The new version adds a zero-setup example
> summary in onboarding (Step 3, "Try an example summary") that demonstrates the
> feature with **no key and no account**, and removes a previously-visible option
> that did nothing in the free build. A temporary Gemini test key and exact steps
> are provided in the reviewer notes so the live feature can also be verified.
> We verified end-to-end that summarization returns output. Thank you for re-reviewing.

## After approval

- Delete or rotate the Gemini key you shared (aistudio.google.com → API keys).
- Real users supply their own key; yours was only for the review.
