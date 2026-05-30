# Tabelog Score Viewer

Chrome extension that shows [Tabelog](https://tabelog.com) review scores when hovering over restaurant listings on supported sites.

## Supported Sites

- `https://omakase.in/*`
- `https://www.tablecheck.com/*`

## How It Works

1. Browse a supported restaurant listing page
2. Hover over any restaurant block — a tooltip appears with the Tabelog score
3. The tooltip shows: rating score, star visualization, review count, and a link to the Tabelog page

Scores are cached for 6 hours (browser session) to 24 hours (persistent) to avoid repeated requests.

## Installation

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked** and select this folder
4. The extension icon appears in the toolbar

## Configuration

All site selectors and matching rules are in `config.js`. If a site changes its markup, only this file needs updating:

- **`SITE_CONFIG`** — CSS selectors for finding restaurant blocks + name/location extraction functions
- **`TABELOG_CONFIG`** — Selectors for parsing Tabelog search results
- **`MATCH_THRESHOLD`** — Minimum similarity score for name matching (0.0–1.0)
- **`CACHE_TTL`** — How long scores are cached (in milliseconds)

## Debug Mode

To see which restaurant blocks are detected, run this in the page's DevTools console:

```js
document.querySelectorAll(siteSelector).forEach(el => console.log(nameExtractor(el)))
```

Replace `siteSelector` and `nameExtractor` with values from `config.js`.

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension definition (MV3) |
| `config.js` | Site selectors + Tabelog parsing rules |
| `background.js` | Service worker — fetches Tabelog, caches results |
| `content.js` | Content script — hover detection, tooltip UI |
| `content.css` | Tooltip styling |
| `utils/fuzzy-match.js` | Restaurant name matching |
