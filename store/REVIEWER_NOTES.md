# Notes for the Chrome Web Store review team

Paste the text below into the **"Notes for the review team"** field (shown in the
Privacy practices tab / the submission step). Replace `PASTE_KEY_HERE` with a real
Google Gemini API key you generate for free at https://aistudio.google.com/app/apikey
(you can delete or rotate this key right after the review is approved).

---------------------------------------------------------------------------------
TESTING INSTRUCTIONS — AI SUMMARIZATION

This extension is "Bring Your Own Key" (BYOK): the user supplies their own AI
provider API key, which stays in local browser storage. To let you test the core
"AI summarization" feature without creating your own account, here is a working
Google Gemini API key for the review:

    Gemini API key:  PASTE_KEY_HERE

Steps to verify summarization works:

1. Install the extension. The onboarding tab opens automatically.
2. On the onboarding "How to use AI" step, choose "I have an API key", paste the
   key above into the Gemini field, and click Next, then Finish.
   (Alternatively: click the extension icon → gear/Settings → paste the key into
    "Gemini API key" → Save.)
3. Open any YouTube video that has captions (most popular videos and all TED
   talks do — you can confirm a video has captions if the "CC" button is
   available in its player).
4. Click the extension toolbar icon. The video URL is auto-filled. (On a YouTube
   watch page you can also use the "AI Summarize" button that appears in the
   right sidebar above the suggested videos.)
5. Click "Сводка" / "Summary".
6. A structured AI summary streams into the panel within a few seconds.
7. To test an article: open any news article or blog post, click the toolbar icon,
   then click Summary.
8. To test the Q&A: after a summary appears, type a question in the chat box at the
   bottom (e.g. "What are the main points?") and press send.

Notes:
- No account, no sign-up, and no subscription are required or offered.
- The key above is for review only and will be rotated after approval.
- If summarization ever shows "Add an API key", it means the key field is empty —
  re-paste the key in Settings and Save.
---------------------------------------------------------------------------------

## Why this is needed

Chrome reviewers test in a clean profile with no API key configured. A BYOK
extension cannot produce a summary without a key, which is why "AI summarization"
appeared not to work. Providing a temporary key in the reviewer notes is the
standard, Google-recommended way to let reviewers exercise the feature.

## After approval

- Delete or rotate the Gemini key you shared (aistudio.google.com → API keys).
- Real users supply their own key; yours was only for the review.
