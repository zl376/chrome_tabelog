# Tabelog Score Viewer

Chrome extension that shows [Tabelog](https://tabelog.com) review scores when hovering over restaurant listings on supported sites.

## Supported Sites

- `https://omakase.in/*`
- `https://www.tablecheck.com/*`

## How It Works

1. Browse a supported restaurant listing page
2. Hover over any restaurant block — a tooltip appears with the Tabelog score
3. The tooltip shows: rating score, star visualization, review count, and a link to the Tabelog page

Scores are cached at multiple levels (extension + native host) to avoid repeated requests.

## Installation

### Prerequisites

- **macOS only** (Linux/Windows not yet supported)
- [Chrome](https://www.google.com/chrome/) (or any Chromium-based browser)
- [Python 3](https://www.python.org/downloads/) (3.10+)

### Setup

```bash
git clone https://github.com/zl376/chrome_tabelog.git
cd chrome_tabelog
bash install.sh
```

The install script handles everything: creates a Python venv with `uv`, installs dependencies, and registers the native messaging host with Chrome.

Then in Chrome:
1. Open `chrome://extensions`
2. Toggle **Developer mode** ON (top-right corner)
3. Click **Load unpacked** and select the `chrome_tabelog` folder
4. Done — visit `tablecheck.com/ja/japan` and hover over a restaurant

No server to run, no terminal to keep open. Chrome auto-launches the Python host on demand.

For configuration and technical details, see [TECHNICALS.md](doc/TECHNICALS.md).
