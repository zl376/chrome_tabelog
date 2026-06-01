# Progress

## What

Chrome extension that shows [Tabelog](https://tabelog.com) review scores on hover when browsing restaurant listings on `omakase.in` and `tablecheck.com`.

## Status

**Working end-to-end with zero manual setup.** Hover over a restaurant → instant loading spinner → Tabelog score with stars, review count, and link.

### Done

- [x] Chrome extension skeleton (Manifest V3, content script + service worker)
- [x] `content.js` — hover detection via event delegation, tooltip UI (loading / score / not-found / error states), instant tooltip + debounced fetch
- [x] `config.js` — CSS selectors for tablecheck.com (styled-components, dynamic class names) and omakase.in (fallbacks)
- [x] `content.css` — dark glassmorphism tooltip, orange score, spinner animation
- [x] `fuzzy-match.js` — Levenshtein + substring matching with Japanese text normalization
- [x] `background.js` — 3-tier cache (memory → `chrome.storage.session` → `chrome.storage.local`), native messaging bridge
- [x] `native_host.py` — Python native messaging host, auto-launched by Chrome on demand; uses `curl_cffi` with Safari TLS impersonation to bypass Tabelog's Cloudflare bot detection
- [x] In-memory cache in native host (clears on process exit)
- [x] Stable extension ID via pinned `key` in manifest.json
- [x] `install.sh` — one-command setup: creates venv via `uv`, installs deps, patches shebang, registers native host with Chrome. No hardcoded paths — auto-detects machine layout.
- [x] Playwright E2E test scaffold (`test_e2e.mjs`, gitignored)
- [x] All personal paths scrubbed from committed code (shebang: `#!/usr/bin/env python3`, manifest: `.example` template)

### Known issues

- [ ] **omakase.in selectors untested** — site blocked WebFetch and Playwright; selectors are broad guesses, need real-browser testing
- [ ] **Native host cold start latency** — first hover after browser launch takes 2-3s (Python import + TLS warmup); subsequent hovers are fast (cache + warm connection)
- [ ] **No error recovery** — if native host fails, tooltip shows one-line error; could add retry button

### Won't do (for now)

- Tabelog has no public API; scraping is the only option
- No popup/settings page — zero-config by design
- No omakase.in testing until someone visits it with the extension loaded

## Architecture

```
tablecheck.com / omakase.in
        │
        │ hover
        ▼
   content.js ──── instant loading tooltip
        │
        │ chrome.runtime.sendMessage
        ▼
   background.js ─── cache check (3-tier: memory → session → local)
        │
        │ cache miss → chrome.runtime.sendNativeMessage
        ▼
   native_host.py ─── cache check (in-memory dict, lives until process exits)
        │                              ▲
        │ cache miss → curl_cffi       │ Chrome auto-launches on demand
        │ (Safari TLS impersonation)   │ stdin/stdout JSON protocol
        ▼                              │
   tabelog.com/rst/rstsearch?sk=NAME  │
        │                              │
        │ BeautifulSoup + CSS selectors│
        ▼                              │
   JSON results → fuzzy match → score returned upstream
```

## How to run

```bash
git clone <repo-url>
cd chrome_tabelog
bash install.sh
```

Then in Chrome:
1. `chrome://extensions` → Developer mode ON
2. Load unpacked → select the `chrome_tabelog` folder
3. Browse `tablecheck.com/ja/japan`, hover over restaurant cards

`install.sh` uses `uv` to create a local `.venv`, installs `curl_cffi` + `beautifulsoup4`, patches `native_host.py`'s shebang, and registers the native messaging host with Chrome. No server, no manual startup — Chrome auto-launches `native_host.py` on the first hover.

## Distribution

For sharing with a broader audience, three paths were evaluated:

### Path A: GitHub only (current)
Users clone the repo, run setup steps manually, load unpacked. Good for devs, bad for normal users. Zero cost, zero review process.

### Path B: Chrome Web Store + install script
Extension published on Web Store (one-click install). On first use without native host, it prompts the user to run a one-line install script: `curl -sSL ... | bash`. The script downloads the native host, creates the venv, installs deps, and registers with Chrome's NativeMessagingHosts. ~15 seconds, no cloning or manual setup.

This is the standard pattern for extensions with native companions (1Password, Dropbox). $5 one-time Chrome Web Store developer fee.

### Path C: Eliminate native host entirely
Options considered:
| Approach | Verdict |
|----------|---------|
| JS-only fetch from service worker | Tabelog returns 403 |
| Background tab scraping | Tabelog shows rate-limit page |
| Third-party Tabelog API (Apify, etc.) | Works but costs per request |
| Pre-built restaurant→score DB | No API needed, but data goes stale |

### Recommendation
For personal use: GitHub. For broader audience: Path B — Web Store for the extension, one-line install script for the native host. True one-click install would require bundling everything into a macOS .dmg or running a cloud proxy (infra cost).

### `install.sh` outline
```bash
#!/bin/bash
# One-command setup for native host
INSTALL_DIR="$HOME/.tabelog-extension"
mkdir -p "$INSTALL_DIR"
curl -sSL "https://github.com/.../releases/.../tarball.gz" | tar xz -C "$INSTALL_DIR"
uv venv "$INSTALL_DIR/.venv"
uv pip install --python "$INSTALL_DIR/.venv/bin/python3" curl_cffi beautifulsoup4
mkdir -p "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
cat > "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.tabelog.proxy.json" << EOF
{ "name": "com.tabelog.proxy", "path": "$INSTALL_DIR/native_host.py", ... }
EOF
```

## Privacy

The repo is **identity-clean**. No usernames, home folder paths, machine names, or personal identifiers appear in any committed file. Machine-specific paths are templated (`NATIVE_HOST_PATH`, `#!/usr/bin/env python3`) and patched by `install.sh` at setup time. The extension key in `manifest.json` is a throwaway RSA key pair with no personal data — it exists solely to pin the extension ID for native messaging.

## Key design decisions

- **Native Messaging over persistent server**: Chrome manages the process lifecycle. The Python script is launched on demand, processes the request, and exits. No idle resource usage.
- **Safari TLS impersonation**: Tabelog's Cloudflare blocks Chrome fingerprints but allows Safari. `curl_cffi` impersonates Safari to pass the check.
- **Extension key pinned**: A stable extension ID is required for Native Messaging to whitelist the extension. Generated a 2048-bit RSA key pair; the public key lives in manifest.json.
- **3-tier JS cache + in-memory Python cache**: Extension caches across browser restarts (local storage), sessions (session storage), and worker lifetime (memory). Native host caches in its process memory, so repeated hovers on the same restaurant are instant.
