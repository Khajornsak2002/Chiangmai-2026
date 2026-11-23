# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Static website for a 6-person group trip to Chiang Mai (starts 2026-12-26). UI text, code comments and commit messages are in Thai — keep writing them in Thai. No build step, no package manager, no tests: every page is a single self-contained HTML file with inline `<style>` and `<script>` (vanilla JS). Pages reference each other and `forest.css`/`.bin` files by relative path, so they must be served together from the repo root.

Run locally with any static server (pages use `fetch`, so `file://` won't work for `tickets.html`):

```bash
python3 -m http.server 8000
```

## Pages

- `trip-data.js` — shared by `index.html` and `route.html`: sheet constants, the hardcoded `FALLBACK` trip (used when the sheet can't be loaded), `parseCSV`, `buildTrip`, `dayMeta`, `fetchTrip`. Each day's items are `[time, text, type, mapQuery]`.
- `index.html` — day-by-day itinerary, with the in-page plan editor.
- `route.html` — driving-route map per day (Leaflet + OpenStreetMap tiles; CARTO tiles now return "API KEY REQUIRED"). Stops = items that have a map query, in plan order; a day starts from the previous night's `stay`. Coordinates come from the `PLACES` table in the page (keyed by the exact map-query text), else a `lat,lng` typed in the sheet's map-query cell, else a runtime Nominatim lookup (flagged as approximate). Road geometry, distance and drive time come from the public OSRM server at runtime; places and routes are cached in `localStorage` (`geo:*`, `osrm:*`). When someone adds a new place to the plan, add its coordinates to `PLACES`.
- `expenses.html` — shared expense tracker: who paid each item, per-person balances, "who transfers to whom" settlement, PromptPay QR generation with the amount embedded (EMVCo payload + CRC16, rendered via `qrcode-generator` from cdnjs).
- `tickets.html` — train tickets, stored encrypted in `tickets-out.bin` (outbound) and `tickets.bin` (return). Format: `"TKT1"` magic + 16-byte salt + 12-byte IV + AES-GCM ciphertext; key = PBKDF2-SHA256, 310000 iterations. Plaintext is JSON `{tickets:[{img (b64 jpeg), pdf (b64), car, seat, ...}]}`. Decryption is client-side only; the encryption tool is not in the repo. Don't touch the `.bin` files unless replacing them with newly encrypted ones.
- `forest.css` — shared forest/mountain background theme (day/night via `prefers-color-scheme`, falling snow). Each page links it after its own `<style>` and puts `<div class="scene">…</div>` at the top of `<body>`.

## Data architecture: Google Sheet as the backend

All live data lives in one Google Sheet (`SHEET_ID` constant, repeated in the HTML files and `.gs` files).

- **Reads**: pages fetch the sheet as CSV through the public gviz endpoint (`/gviz/tq?tqx=out:csv&sheet=…` or `&gid=…`) and poll every `REFRESH_SEC` (30s). Parsing is positional/by header text, so renaming sheet tabs, header labels (e.g. `รายการ`, `รวมทั้งหมด`) or columns breaks the pages.
  - Itinerary: tab `แพลนเว็บ`, columns `วัน, เวลา, กิจกรรม, ประเภท, ค้นหาในแผนที่, หัวข้อวัน`.
  - Expenses: tab with gid `490426652`. Checkbox columns (TRUE/FALSE) are detected as one column per person; names are read from a second request (`HEADER_RANGE`) because gviz drops header text over checkbox columns. Items whose note contains `ไม่เอาไปรวม` are excluded from totals.
- **Writes**: go through Google Apps Script web apps (`apps-script/`), called with `fetch(URL, {method:"POST", body: JSON.stringify({action, pin, ...})})`. Every request carries a shared trip PIN that the browser stores in `localStorage["tripPin"]` (same key on all pages); the server answers `{ok:false, error:"รหัสไม่ถูกต้อง"}` on a bad PIN and the client then clears it.
  - `apps-script/plan.gs` — its own Apps Script project; `savePlan` rewrites the `แพลนเว็บ` tab, backing up to `แพลนเว็บ_สำรอง` first. URL = `PLAN_API_URL` in `index.html`.
  - `apps-script/expenses.gs` + `apps-script/pay.gs` — must be in the **same** Apps Script project (`expenses.gs` dispatches `savePay`/`getPay` defined in `pay.gs`). Actions: `check`, `add`, `toggle`, `status`, `savePay`; `GET ?action=pay` returns payee bank/PromptPay/QR info from tab `บัญชีรับเงิน` (QR images stored as base64 text in a cell, capped by `QR_MAX` because a cell holds ≤50,000 chars). URL = `WEB_APP_URL` in `expenses.html`.

The `.gs` files in the repo are reference copies: they are deployed by pasting into the Apps Script editor and deploying as a web app, not from this repo. Keep `PIN` as the placeholder `"ใส่รหัสทริปตรงนี้"` in committed code — the real PIN is set only in the deployed script. When a script is redeployed as a new deployment, its `/exec` URL changes and the constant in the corresponding HTML file must be updated. Changes to `.gs` files only take effect after the user redeploys them, so mention that when you change one.
