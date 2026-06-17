# Notes for the Chrome Web Store review team

Paste the text below into the **"Notes for the review team"** field (shown in the
Privacy practices tab / the submission step). Replace `PASTE_KEY_HERE` with a real
Google Gemini API key you generate for free at https://aistudio.google.com/app/apikey
(you can delete or rotate this key right after the review is approved).

--- SHORT VERSION (≤500 chars — paste this) -------------------------------------
BYOK extension — bring your own AI key. Test key for review:

Gemini key: PASTE_KEY_HERE

1. Install — onboarding opens.
2. "How to use AI" → "I have an API key" → paste key → Next → Finish. (Or: icon → Settings → paste Gemini key → Save.)
3. Open any YouTube video with captions.
4. Click the toolbar icon (URL auto-fills) → "Summary".
5. Summary streams in a few seconds.

No account, sign-up or subscription. Key is review-only, rotated after approval.
---------------------------------------------------------------------------------

--- EXTRA-SHORT FALLBACK (~390 chars) -------------------------------------------
BYOK extension — uses your own AI key. Review test key:

Gemini key: PASTE_KEY_HERE

1. Install → onboarding opens.
2. Pick "I have an API key" → paste key → Finish.
3. Open any YouTube video with captions.
4. Click toolbar icon (URL auto-fills) → "Summary".
5. Summary appears in seconds.

No account or subscription needed. Key is review-only.
---------------------------------------------------------------------------------

## Why this is needed

Chrome reviewers test in a clean profile with no API key configured. A BYOK
extension cannot produce a summary without a key, which is why "AI summarization"
appeared not to work. Providing a temporary key in the reviewer notes is the
standard, Google-recommended way to let reviewers exercise the feature.

## After approval

- Delete or rotate the Gemini key you shared (aistudio.google.com → API keys).
- Real users supply their own key; yours was only for the review.
