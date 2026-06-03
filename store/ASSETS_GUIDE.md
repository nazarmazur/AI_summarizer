# Chrome Web Store — Asset Requirements

Chrome Web Store needs the following assets. Sizes are pixels.

## Required

| Asset            | Size            | Format     | Notes                                                                                  |
|------------------|-----------------|------------|----------------------------------------------------------------------------------------|
| Store icon       | **128 × 128**   | PNG        | We already have it at `extension/icons/icon128.png`. Reuse.                             |
| Screenshot       | **1280 × 800**  | PNG / JPG  | 1 minimum, 5 recommended. See compositions below.                                       |
| Small promo tile | 440 × 280       | PNG        | Optional but boosts visibility.                                                         |
| Large promo tile | 920 × 680       | PNG        | Optional.                                                                               |
| Marquee promo    | 1400 × 560      | PNG        | Optional, used in CWS featured section.                                                 |

## Suggested 5 screenshots

Compose at 1280 × 800. Add a 24 px gradient padding around the actual screenshot for visual polish; put a one-line headline above each. Save as PNG.

### Screenshot 1 — "YouTube sidebar embed"
**Headline:** *Summary right where you watch.*
**Composition:**
- Screenshot of a popular tech-talk YouTube video page (long enough to need a real summary).
- The AI Summarizer card mounted in `#secondary-inner`, expanded, showing a generated 6-bullet summary.
- Highlight: small purple arrow pointing at "Auто" model chip + "Сводка" tile.

### Screenshot 2 — "Works on any article"
**Headline:** *Articles, blogs, paywalled docs — done.*
**Composition:**
- Open a long article on theverge.com or similar.
- The floating purple FAB visible bottom-right.
- The floating panel open above it, mid-stream, summary visible.

### Screenshot 3 — "PDFs, including scans"
**Headline:** *Drop in a PDF. Get the gist.*
**Composition:**
- Popup UI in toolbar (not iframe), URL field filled with `research-paper-2024.pdf`.
- Source chip showing "📕 PDF документ".
- Bullet-pointed summary in the result area with section headings.

### Screenshot 4 — "Q&A follow-up chat"
**Headline:** *Ask anything about what you just watched.*
**Composition:**
- YouTube embed view, scrolled down to chat section.
- One user bubble: "Які книги він рекомендує?"
- Assistant bubble: bulleted reply with [05:23] clickable timestamp + book titles.

### Screenshot 5 — "Free vs Pro"
**Headline:** *Use your key, or upgrade to Pro.*
**Composition:**
- The upsell modal open in popup view.
- Bullet list of Pro features visible.
- Both pricing cards shown (monthly $4.99 / yearly $39 with "Save 35%" badge).

## How to capture

1. Set Chrome window to **1280 × 800** (Chrome DevTools → Device Toolbar → Responsive → 1280 × 800).
2. Load the extension (unpacked is fine).
3. Navigate to the target page and trigger the UI for the screenshot.
4. Use Chrome's full-page capture (Cmd/Ctrl + Shift + P → "Capture node screenshot") to grab the specific element.
5. Compose in Figma / Photopea / similar:
   - 1280 × 800 canvas
   - Background: linear gradient `#f5f3ff → #ede9fe` (matches the auth.css palette)
   - Headline at the top in **Inter Semibold 36px**, color `#1a1a1f`
   - Sub-line in **Inter Regular 18px**, color `#6b7280` (optional)
   - Drop the screenshot centered with `border-radius: 12px` and a soft shadow `0 20px 40px rgba(99,102,241,.18)`
6. Export each as PNG (sRGB).

## Promo tiles

### Small (440 × 280)
- Same gradient background.
- Centered: extension icon (96 × 96), wordmark "AI Summarizer" in **Inter Bold 32px**.
- Bottom: tagline "Summarize anything. In any language." in 16 px.

### Large (920 × 680)
- Big icon (192 × 192) on the left.
- Right side: 3 thumbnail screenshots stacked (YouTube card, PDF result, Q&A chat).

### Marquee (1400 × 560)
- Hero shot: laptop mockup with YouTube tab + sidebar card visible.
- Right: bold headline "Summary in seconds. Then ask anything."
- Below: 3 mini badges — "Gemini · GPT · Claude", "Free + Pro", "UA / RU / EN".

## Brand colours

| Use                  | Hex         |
|----------------------|-------------|
| Primary (indigo)     | `#6366f1`   |
| Primary (purple)     | `#a855f7`   |
| Accent (pink)        | `#ec4899`   |
| Pro badge gradient   | `#f59e0b → #ef4444` |
| Text dark            | `#1a1a1f`   |
| Text soft            | `#6b7280`   |
| Surface              | `#ffffff`   |
| Surface (dark)       | `#0f0f0f`   |

## Wordmark

- Font: **Inter** (free, [fonts.google.com/specimen/Inter](https://fonts.google.com/specimen/Inter)).
- Style: lowercase "ai summarizer" or Title Case "AI Summarizer".
- Weights: Semibold for the wordmark, Bold for headlines.
