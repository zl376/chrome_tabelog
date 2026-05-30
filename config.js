// config.js — shared between content script and service worker
// Site-specific CSS selectors and Tabelog parsing rules.
// This is the single file to update when site markup changes.

// --- Target site definitions for hover detection ---
const SITE_CONFIG = {
  'www.tablecheck.com': {
    restaurantSelector: 'a[href*="/ja/"]',
    nameExtractor: (block) => {
      const h5 = block.querySelector('h5');
      if (h5) return h5.textContent.trim();
      const h4 = block.querySelector('h4');
      if (h4) return h4.textContent.trim();
      const h3 = block.querySelector('h3');
      if (h3) return h3.textContent.trim();
      const img = block.querySelector('img[alt]');
      if (img) return img.alt.trim();
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
const TABELOG_CONFIG = {
  searchUrl: 'https://tabelog.com/rstLst/',
  listingSelector: [
    'li.list-rst',
    '.rstlist-item',
    '[class*="list-rst"]',
    '.rstdtl-list__item'
  ].join(', '),
  nameSelector: [
    'h3 a',
    '.list-rst__name a',
    '.rst-name a',
    'a.rstlist-name'
  ].join(', '),
  scoreSelector: [
    '.c-rating__score b',
    '.list-rst__rating-score b',
    '.rating-score b',
    '.c-rating__score span',
    'b.c-rating__score-val'
  ].join(', '),
  reviewCountSelector: [
    '.list-rst__review-num a em',
    '.review-count em',
    '[class*="review"] em',
    '.c-rvw__count em'
  ].join(', '),
  areaSelector: [
    '.list-rst__area',
    '.station-info',
    '.list-rst__station',
    '.rstinfo-area'
  ].join(', '),
  linkSelector: [
    'h3 a',
    '.list-rst__name a',
    '.rstdtl-list__image a',
    'a[href*="/A13"]'
  ].join(', ')
};

// --- Cache TTL settings ---
const CACHE_TTL = {
  sessionMs: 6 * 60 * 60 * 1000,   // 6 hours
  localMs: 24 * 60 * 60 * 1000,    // 24 hours
  notFoundMs: 60 * 60 * 1000       // 1 hour for "not found"
};

// --- Matching ---
const MATCH_THRESHOLD = 0.6;

// --- Rate limiting ---
const RATE_LIMIT = {
  maxRequestsPerMinute: 10,
  minIntervalMs: 600
};
