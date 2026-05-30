// background.js — Service worker: Tabelog fetching, HTML parsing, caching, matching
importScripts('config.js', 'utils/fuzzy-match.js');

// --- Three-tier cache ---
const memoryCache = new Map();
const pendingRequests = new Map();

// --- Rate limiting ---
const requestTimestamps = [];

function enforceRateLimit() {
  const now = Date.now();
  while (requestTimestamps.length && requestTimestamps[0] < now - 60000) {
    requestTimestamps.shift();
  }
  if (requestTimestamps.length >= RATE_LIMIT.maxRequestsPerMinute) {
    throw new Error('RATE_LIMITED');
  }
  const last = requestTimestamps[requestTimestamps.length - 1];
  if (last && now - last < RATE_LIMIT.minIntervalMs) {
    return new Promise(r => setTimeout(r, RATE_LIMIT.minIntervalMs - (now - last)));
  }
  requestTimestamps.push(now);
  return Promise.resolve();
}

// --- Cache key ---
function cacheKey(name, area) {
  const n = name.toLowerCase().replace(/\s+/g, '_');
  const a = (area || '').toLowerCase().replace(/\s+/g, '_');
  return `tg:${n}:${a}`;
}

function isExpired(entry, ttl) {
  return Date.now() - entry.timestamp > ttl;
}

// --- Cache lookup with promotion ---
async function lookupCache(key) {
  // Tier 1: memory
  const mem = memoryCache.get(key);
  if (mem) {
    if (mem.notFound && !isExpired(mem, CACHE_TTL.notFoundMs)) return { found: false, notFound: true };
    if (!mem.notFound && !isExpired(mem, CACHE_TTL.sessionMs)) return { found: true, data: mem };
    memoryCache.delete(key);
  }

  // Tier 2: session storage
  const session = await chrome.storage.session.get(key);
  if (session[key]) {
    const entry = session[key];
    if (entry.notFound && !isExpired(entry, CACHE_TTL.notFoundMs)) {
      memoryCache.set(key, entry);
      return { found: false, notFound: true };
    }
    if (!entry.notFound && !isExpired(entry, CACHE_TTL.sessionMs)) {
      memoryCache.set(key, entry);
      return { found: true, data: entry };
    }
  }

  // Tier 3: local storage
  const local = await chrome.storage.local.get(key);
  if (local[key]) {
    const entry = local[key];
    if (entry.notFound && !isExpired(entry, CACHE_TTL.notFoundMs)) {
      await chrome.storage.session.set({ [key]: entry });
      memoryCache.set(key, entry);
      return { found: false, notFound: true };
    }
    if (!entry.notFound && !isExpired(entry, CACHE_TTL.localMs)) {
      await chrome.storage.session.set({ [key]: entry });
      memoryCache.set(key, entry);
      return { found: true, data: entry };
    }
  }

  return { found: false, notFound: false };
}

async function storeCache(key, entry) {
  const full = { ...entry, timestamp: Date.now() };
  memoryCache.set(key, full);
  await chrome.storage.session.set({ [key]: full }).catch(() => {});
  await chrome.storage.local.set({ [key]: full }).catch(() => {});
}

// --- Tabelog fetch ---
async function fetchTabelogResults(name, area) {
  const params = new URLSearchParams({ keyword: name });
  if (area) params.set('sk', area);
  const url = `${TABELOG_CONFIG.searchUrl}?${params.toString()}`;

  await enforceRateLimit();

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept-Language': 'ja,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  if (response.status === 429) throw new Error('RATE_LIMITED');
  if (!response.ok) throw new Error(`HTTP_${response.status}`);

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const listings = doc.querySelectorAll(TABELOG_CONFIG.listingSelector);
  const results = [];

  for (const item of listings) {
    const nameEl = item.querySelector(TABELOG_CONFIG.nameSelector);
    const scoreEl = item.querySelector(TABELOG_CONFIG.scoreSelector);
    const reviewEl = item.querySelector(TABELOG_CONFIG.reviewCountSelector);
    const areaEl = item.querySelector(TABELOG_CONFIG.areaSelector);
    const linkEl = item.querySelector(TABELOG_CONFIG.linkSelector);

    if (!nameEl) continue;

    const nameText = nameEl.textContent.replace(/\s+/g, ' ').trim();
    const scoreText = scoreEl ? scoreEl.textContent.replace(/[^0-9.]/g, '') : '';
    const reviewText = reviewEl ? reviewEl.textContent.replace(/[^0-9]/g, '') : '';

    results.push({
      name: nameText,
      score: scoreText ? parseFloat(scoreText) : 0,
      reviewCount: reviewText ? parseInt(reviewText, 10) || 0 : 0,
      area: areaEl ? areaEl.textContent.replace(/\s+/g, ' ').trim() : '',
      url: linkEl ? linkEl.href : ''
    });
  }

  return results;
}

// --- Main handler ---
async function handleScoreRequest({ name, area }) {
  const key = cacheKey(name, area);

  // Check cache
  const cached = await lookupCache(key);
  if (cached.found) return { success: true, data: cached.data };
  if (cached.notFound) return { success: false, error: 'NOT_FOUND' };

  // Coalesce duplicate requests
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }

  const promise = (async () => {
    try {
      const results = await fetchTabelogResults(name, area);
      const match = findBestMatch(name, results, MATCH_THRESHOLD);

      if (!match) {
        const notFoundEntry = { notFound: true, timestamp: Date.now() };
        await storeCache(key, notFoundEntry);
        return { success: false, error: 'NOT_FOUND' };
      }

      await storeCache(key, match);
      return { success: true, data: match };
    } catch (err) {
      return { success: false, error: err.message };
    } finally {
      pendingRequests.delete(key);
    }
  })();

  pendingRequests.set(key, promise);
  return promise;
}

// --- List of known Japanese metro keywords for area extraction ---
function extractAreaFromBlock(block, siteCfg) {
  const text = siteCfg.areaExtractor(block);
  if (text) return text;
  return '';
}

// --- Message handler ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'FETCH_TABELOG') {
    handleScoreRequest(request.data)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async
  }
});

// --- Periodic cleanup of stale local storage entries ---
chrome.alarms.create('cleanup', { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'cleanup') {
    const all = await chrome.storage.local.get(null);
    const now = Date.now();
    const toRemove = [];
    for (const [k, v] of Object.entries(all)) {
      if (k.startsWith('tg:') && v.timestamp && now - v.timestamp > CACHE_TTL.localMs) {
        toRemove.push(k);
      }
    }
    if (toRemove.length > 0) {
      await chrome.storage.local.remove(toRemove);
    }
  }
});
