// config.js — shared between content script and service worker
// Site-specific CSS selectors and Tabelog parsing rules.
// This is the single file to update when site markup changes.

// --- Target site definitions for hover detection ---
var SITE_CONFIG = {
  'www.tablecheck.com': {
    restaurantSelector: 'a[href*="/ja/"]',
    nameExtractor: (block) => {
      // Try heading elements first
      for (const tag of ['h5', 'h4', 'h3', 'h2', 'h1']) {
        const el = block.querySelector(tag);
        if (el && el.textContent.trim().length >= 2) return el.textContent.trim();
      }
      // Try img alt
      const img = block.querySelector('img[alt]');
      if (img && img.alt.trim().length >= 2) return img.alt.trim();
      // Fallback: use own text content (styled-components often put name directly)
      const text = block.textContent.trim();
      // Filter out non-restaurant links (short text, navigation, etc.)
      if (text && text.length >= 2 && text.length < 60 && !text.includes('>')) {
        return text;
      }
      return '';
    },
    areaExtractor: (block) => {
      return '';
    },
    hoverDelay: 300
  },
  'omakase.in': {
    restaurantSelector: [
      '[data-restaurant-id]',
      '.restaurant-card',
      'a[href*="/restaurants/"]',
      '[class*="restaurant"]',
      '[class*="shop"]',
      '[class*="store"]'
    ].join(', '),
    nameExtractor: (block) => {
      const selectors = ['h3', 'h4', 'h2', '.restaurant-name', '[data-name]', '.shop-name', '.store-name'];
      for (const sel of selectors) {
        const el = block.querySelector(sel);
        if (el) return el.textContent.trim();
      }
      const a = block.closest('a') || block.querySelector('a');
      if (a) {
        const text = a.textContent.trim();
        if (text && text.length < 80) return text;
      }
      return '';
    },
    areaExtractor: (block) => {
      const selectors = ['.area', '.location', '[data-area]', '.region', '.prefecture'];
      for (const sel of selectors) {
        const el = block.querySelector(sel);
        if (el) return el.textContent.trim();
      }
      return '';
    },
    hoverDelay: 300
  }
};

// --- Tabelog search result parsing selectors ---
var TABELOG_CONFIG = {
  searchUrl: 'https://tabelog.com/rst/rstsearch',
  FETCH_TIMEOUT_MS: 15000,
  listingSelector: 'div.list-rst',
  nameSelector: 'a.list-rst__rst-name-target, a.cpy-rst-name',
  scoreSelector: 'span.c-rating__val.list-rst__rating-val, span.c-rating__val--strong',
  reviewCountSelector: 'em.list-rst__rvw-count-num, em.cpy-review-count',
  areaSelector: 'div.list-rst__area-genre, div.cpy-area-genre',
  linkSelector: 'a.list-rst__rst-name-target, a.cpy-rst-name'
};

// --- Cache TTL settings ---
var CACHE_TTL = {
  sessionMs: 6 * 60 * 60 * 1000,   // 6 hours
  localMs: 24 * 60 * 60 * 1000,    // 24 hours
  notFoundMs: 60 * 60 * 1000       // 1 hour for "not found"
};

// --- Matching ---
var MATCH_THRESHOLD = 0.6;

// --- Rate limiting ---
var RATE_LIMIT = {
  maxRequestsPerMinute: 10,
  minIntervalMs: 600
};
