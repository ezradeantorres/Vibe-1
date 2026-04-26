# Scrape failed for sunflower-ridge-assisted-living

**Date:** 2026-04-26
**Source URL:** https://sunflowerridgeassistedliving.com/

## Failure modes encountered

1. **Broken TLS cert** — Subject Alternative Names do not include the apex domain.
   All TLS-verifying clients (httpx, curl without `-k`, WebFetch) fail at handshake.
2. **Cloudflare/WAF anti-bot** — With `-k` (skip TLS), curl gets HTTP/2 403; with a
   browser User-Agent, curl gets 200 but the body is ~344 bytes of binary garbage
   (JS-challenge or obfuscated content).
3. **Playwright timeout** — `chromium-headless-shell`, full `chromium`, AND
   `channel='chrome'` (real Chrome from /Applications) all timeout on `page.goto(...)`
   even with stealth flags (`--disable-blink-features=AutomationControlled`,
   `navigator.webdriver` removed). Headless-browser fingerprinting blocks render.

## Resolution

Per `PROJECT_PLAN.md` §13: fall back to (a) curated stock or placeholder hero,
(b) generic-but-warm copy with no invented staff/services/pricing/testimonials,
(c) note the fallback in `out/manifest.json` so the operator knows real photos
must be sourced from the prospect before sending the demo.

## To re-attempt later

- Try non-headless Chrome with a residential IP, OR
- Have the operator capture homepage HTML/PDF from his laptop and drop it under
  `work/scrapes/sunflower-ridge-assisted-living/manual_capture.html`, OR
- Ask the prospect directly for their content (the offer is "I built you a new
  website" — they can supply photos as part of accepting it).
