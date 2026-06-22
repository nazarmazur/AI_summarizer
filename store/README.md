# Chrome Web Store Submission

Everything needed to publish AI Summarizer on the Chrome Web Store lives in this folder.

## Files

| File                  | What it is                                                                       |
|-----------------------|----------------------------------------------------------------------------------|
| `PRIVACY.md`          | Privacy Policy. Host this as HTML somewhere (GitHub Pages, your domain).         |
| `STORE_LISTING.md`    | Short + detailed descriptions in UA, RU, EN + permission justifications.         |
| `ASSETS_GUIDE.md`     | Specs and composition for screenshots and promo tiles.                           |
| `build-zip.ps1`       | PowerShell script to produce a clean .zip ready to upload.                        |

## Publishing flow

### 1. One-time setup
- Create a Chrome Web Store developer account at https://chrome.google.com/webstore/devconsole/
- Pay the **$5 one-time developer fee** with a credit card.
- Verify your email address.

### 2. Host the privacy policy
- Convert `PRIVACY.md` to HTML (any Markdown renderer works).
- Host at a stable URL (GitHub Pages: enable Pages on your repo and point to `store/PRIVACY.md`, or use your own domain).
- Copy the URL — you'll paste it into the Store listing.

### 3. Capture screenshots
- Follow `ASSETS_GUIDE.md`. You need at least 1, ideally 5, at **1280 × 800**.
- Drop them in `store/screenshots/` so they're versioned with the repo.

### 4. Build the .zip
```powershell
# From the repo root
pwsh ./store/build-zip.ps1 -Version 1.0.0
```
Output: `dist/ai-summarizer-1.0.0.zip` — that's what you upload.

### 5. Create the listing
- Click **Add new item** in the Developer Dashboard.
- Upload the .zip.
- Fill in:
  - **Name**: AI Summarizer
  - **Short description**: copy from `STORE_LISTING.md` (132 chars max)
  - **Detailed description**: copy the full "Detailed description" section
  - **Category**: Productivity
  - **Language**: English (Primary). Then **Add another language** → Ukrainian, Russian, and paste their respective copy from `STORE_LISTING.md`.
  - **Screenshots**: upload your 5 PNGs
  - **Small/Large/Marquee promo**: optional but recommended
  - **Privacy policy URL**: the URL from step 2
  - **Single purpose**: "Summarize web content (videos, articles, PDFs) using AI models."
- Under **Permissions justification**, paste the table from `STORE_LISTING.md` → "Permissions justification".
- Under **Single purpose**, write the single-sentence pitch.

### 6. Submit for review
- Save the draft, then click **Submit for review**.
- Reviews typically take **1-3 days**. Common rejections:
  - **Broken / misleading functionality** (Red Potassium) → the reviewer must be able to produce a real summary; give a working API key in the reviewer notes (BYOK).
  - Missing privacy disclosure → ensure the policy URL is reachable.
  - Excessive permissions → we request only `storage, scripting, tabs, activeTab, sidePanel` + specific hosts; no `<all_urls>`.

### 7. After approval
- The extension goes live at `https://chromewebstore.google.com/detail/<id>`.
- Updates: bump the version in `manifest.json` (or via `-Version` flag in `build-zip.ps1`), upload new .zip, submit again.
- Stripe Price IDs and Supabase secrets are **not** in the bundled code — they live in the user's local `extension/lib/config.js`. Make sure you ship the build with **your** Supabase URL + anon key, not placeholders.

## Pre-publish checklist

- [ ] `extension/lib/config.js` has real Supabase URL + ANON, not `YOUR-PROJECT`.
- [ ] `extension/_locales/uk/messages.json` etc. validated as JSON.
- [ ] Privacy policy URL is live and reachable.
- [ ] Screenshots at 1280 × 800.
- [ ] Tested **install → sign in → summary on a YouTube video** in a fresh Chrome profile.
- [ ] Tested **billing flow → Stripe Checkout → returns to options with billing=success**.
- [ ] No console errors on a clean install.
- [ ] Extension icon visible in toolbar after install.
- [ ] Version bump matches the previous published version + 1.
