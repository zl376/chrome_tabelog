// background.js — Service worker: proxies Tabelog requests via Native Messaging
importScripts('config.js', 'utils/fuzzy-match.js');
console.log('[TabelogExt] Service worker started');

const NATIVE_HOST = 'com.tabelog.proxy';
const memoryCache = new Map();
const pendingRequests = new Map();

function cacheKey(name, area) {
  return `tg:${name.toLowerCase().replace(/\s+/g, '_')}:${(area || '').toLowerCase().replace(/\s+/g, '_')}`;
}

async function lookupCache(key) {
  const mem = memoryCache.get(key);
  if (mem) {
    const ttl = mem.notFound ? CACHE_TTL.notFoundMs : CACHE_TTL.sessionMs;
    if (Date.now() - mem.timestamp < ttl) return mem;
    memoryCache.delete(key);
  }
  const stored = await chrome.storage.local.get(key);
  if (stored[key]) {
    const entry = stored[key];
    const ttl = entry.notFound ? CACHE_TTL.notFoundMs : CACHE_TTL.localMs;
    if (Date.now() - entry.timestamp < ttl) {
      memoryCache.set(key, entry);
      return entry;
    }
  }
  return null;
}

async function storeCache(key, entry) {
  const full = { ...entry, timestamp: Date.now() };
  memoryCache.set(key, full);
  await chrome.storage.local.set({ [key]: full }).catch(() => {});
}

function fetchViaNative(name, area) {
  return new Promise((resolve, reject) => {
    console.log('[TabelogExt] Native message:', name);

    chrome.runtime.sendNativeMessage(NATIVE_HOST, { name, area }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (response.error) {
        reject(new Error(response.error));
        return;
      }
      console.log('[TabelogExt] Native returned:', response.results?.length, 'results');
      resolve(response.results || []);
    });
  });
}

async function handleScoreRequest({ name, area }) {
  const key = cacheKey(name, area);
  console.log('[TabelogExt] Request:', name);

  const cached = await lookupCache(key);
  if (cached) {
    if (cached.notFound) return { success: false, error: 'NOT_FOUND' };
    return { success: true, data: cached };
  }

  if (pendingRequests.has(key)) {
    console.log('[TabelogExt] Awaiting in-flight request');
    return pendingRequests.get(key);
  }

  const promise = (async () => {
    try {
      const results = await fetchViaNative(name, area);
      const match = findBestMatch(name, results, MATCH_THRESHOLD);

      if (!match) {
        await storeCache(key, { notFound: true });
        return { success: false, error: 'NOT_FOUND' };
      }

      console.log('[TabelogExt] Match:', match.name, match.score);
      await storeCache(key, match);
      return { success: true, data: match };
    } catch (err) {
      console.error('[TabelogExt] Error:', err.message, err.stack);
      return { success: false, error: err.message };
    } finally {
      pendingRequests.delete(key);
    }
  })();

  pendingRequests.set(key, promise);
  return promise;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'PING') {
    sendResponse({ pong: true, time: Date.now() });
    return false;
  }
  if (request.type === 'FETCH_TABELOG') {
    handleScoreRequest(request.data)
      .then(sendResponse)
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// Cache cleanup
try {
  chrome.alarms.create('cleanup', { periodInMinutes: 60 });
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'cleanup') {
      const all = await chrome.storage.local.get(null);
      const now = Date.now();
      const toRemove = [];
      for (const [k, v] of Object.entries(all)) {
        if (k.startsWith('tg:') && v.timestamp && now - v.timestamp > CACHE_TTL.localMs + 86400000) {
          toRemove.push(k);
        }
      }
      if (toRemove.length > 0) {
        await chrome.storage.local.remove(toRemove);
      }
    }
  });
} catch (e) {
  console.warn('[TabelogExt] Alarms unavailable:', e.message);
}

console.log('[TabelogExt] Service worker ready');
