// content.js — Hover detection, tooltip UI
// Runs on omakase.in and tablecheck.com
// Delegates Tabelog fetch to background service worker (to bypass CORS)

(function () {
  'use strict';

  console.log('[TabelogExt] Content script loaded, hostname:', window.location.hostname);

  const hostname = window.location.hostname;
  const siteCfg = SITE_CONFIG[hostname];
  if (!siteCfg) {
    console.log('[TabelogExt] No site config for hostname:', hostname, 'available keys:', Object.keys(SITE_CONFIG));
    return;
  }
  console.log('[TabelogExt] Site config found for:', hostname, 'selector:', siteCfg.restaurantSelector);

  // --- State ---
  let hoverTimer = null;
  let hideTimer = null;
  let tooltipEl = null;
  let requestId = 0;
  let currentBlock = null;
  let lastCheck = 0;
  let clientTimeout = null;
  let fetchTimer = null;
  const THROTTLE_MS = 40;
  const DEBOUNCE_MS = 150;
  const CLIENT_TIMEOUT_MS = 20000;

  // --- Tooltip element ---
  function createTooltip() {
    const el = document.createElement('div');
    el.className = 'tabelog-tooltip tabelog-tooltip--hidden';
    document.body.appendChild(el);
    return el;
  }

  // --- Positioning ---
  function positionTooltip(tooltip, blockRect) {
    const tw = 260;
    const th = 140;
    const gap = 8;

    let top = blockRect.top + window.scrollY - th - gap;
    let left = blockRect.left + (blockRect.width - tw) / 2;

    if (blockRect.top < th + 16) {
      top = blockRect.bottom + window.scrollY + gap;
    }

    const maxLeft = window.innerWidth - tw - 8;
    if (left < 8) left = 8;
    if (left > maxLeft) left = maxLeft;

    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
  }

  // --- Star renderer ---
  function renderStars(score) {
    const full = Math.floor(score);
    const half = score - full >= 0.25 ? 1 : 0;
    const empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
  }

  // --- Tooltip states ---
  function showLoading(el, blockRect) {
    el.innerHTML = `
      <div class="tabelog-tooltip__loading">
        <div class="tabelog-tooltip__spinner"></div>
        <span>食べログを検索中…</span>
      </div>
    `;
    positionTooltip(el, blockRect);
    el.classList.remove('tabelog-tooltip--hidden');
  }

  function showScore(el, data, blockRect) {
    const stars = renderStars(data.score);
    const color = data.score >= 3.5 ? '#f5a623' : data.score >= 3.0 ? '#f0c040' : '#999';
    el.innerHTML = `
      <div class="tabelog-tooltip__header">
        <span>食べログ評価</span>
      </div>
      <div class="tabelog-tooltip__score-row">
        <span class="tabelog-tooltip__score" style="color:${color}">${data.score.toFixed(2)}</span>
        <span class="tabelog-tooltip__stars" style="color:${color}">${stars}</span>
      </div>
      ${data.reviewCount > 0 ? `<div class="tabelog-tooltip__reviews">${data.reviewCount.toLocaleString()} 件の口コミ</div>` : ''}
      ${data.url ? `<a class="tabelog-tooltip__link" href="${data.url}" target="_blank" rel="noopener">食べログで見る →</a>` : ''}
    `;
    positionTooltip(el, blockRect);
    el.classList.remove('tabelog-tooltip--hidden');
  }

  function showNotFound(el, name, blockRect) {
    el.innerHTML = `
      <div class="tabelog-tooltip__not-found">
        「${escapeHtml(name)}」は食べログで見つかりませんでした
      </div>
    `;
    positionTooltip(el, blockRect);
    el.classList.remove('tabelog-tooltip--hidden');
  }

  function showError(el, error, blockRect) {
    let msg;
    switch (error) {
      case 'TIMEOUT':
        msg = 'タイムアウトしました。もう一度お試しください。';
        break;
      case 'RATE_LIMITED':
        msg = 'リクエスト制限中。しばらく待ってからお試しください。';
        break;
      case 'NOT_FOUND':
        msg = '食べログで見つかりませんでした';
        break;
      case 'PROXY_UNREACHABLE':
        msg = 'サーバーが起動していません。python server.py を実行してください。';
        break;
      default:
        msg = '情報を取得できませんでした';
    }
    el.innerHTML = `<div class="tabelog-tooltip__error">${msg}</div>`;
    positionTooltip(el, blockRect);
    el.classList.remove('tabelog-tooltip--hidden');
  }

  function hideTooltip() {
    if (tooltipEl) {
      tooltipEl.classList.add('tabelog-tooltip--hidden');
    }
  }

  function clearClientTimeout() {
    if (clientTimeout) { clearTimeout(clientTimeout); clientTimeout = null; }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Hover handlers ---
  function doFetch(name, area, block, rid) {
    clientTimeout = setTimeout(() => {
      if (rid !== requestId) return;
      showError(tooltipEl, 'TIMEOUT', block.getBoundingClientRect());
    }, CLIENT_TIMEOUT_MS);

    chrome.runtime.sendMessage(
      { type: 'FETCH_TABELOG', data: { name, area } },
      (response) => {
        clearClientTimeout();
        if (rid !== requestId) return;
        if (chrome.runtime.lastError) {
          showError(tooltipEl, 'CONNECTION_ERROR', block.getBoundingClientRect());
          return;
        }
        const blockRect = block.getBoundingClientRect();
        if (response.success) {
          showScore(tooltipEl, response.data, blockRect);
        } else {
          const err = response.error || 'UNKNOWN';
          if (err === 'NOT_FOUND') {
            showNotFound(tooltipEl, name, blockRect);
          } else {
            showError(tooltipEl, err, blockRect);
          }
        }
      }
    );
  }

  function handleMouseOver(e) {
    const now = Date.now();
    if (now - lastCheck < THROTTLE_MS) return;
    lastCheck = now;

    const block = e.target.closest(siteCfg.restaurantSelector);
    if (!block) return;
    if (block === currentBlock) return;
    currentBlock = block;

    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    clearClientTimeout();
    if (fetchTimer) { clearTimeout(fetchTimer); fetchTimer = null; }

    const name = siteCfg.nameExtractor(block);
    if (!name || name.length < 2) return;

    const area = siteCfg.areaExtractor(block);
    const rect = block.getBoundingClientRect();

    // Show tooltip immediately with loading state
    showLoading(tooltipEl, rect);

    const rid = ++requestId;

    // Debounce the actual fetch — avoid calling API just from passing over
    fetchTimer = setTimeout(() => {
      doFetch(name, area, block, rid);
    }, DEBOUNCE_MS);
  }

  function handleMouseOut(e) {
    const block = e.target.closest(siteCfg.restaurantSelector);
    if (!block) return;
    if (block !== currentBlock) return;
    currentBlock = null;

    if (fetchTimer) { clearTimeout(fetchTimer); fetchTimer = null; }
    clearClientTimeout();
    hideTimer = setTimeout(hideTooltip, 200);
  }

  // --- Init ---
  console.log('[TabelogExt] Step 1: creating tooltip');
  tooltipEl = createTooltip();
  console.log('[TabelogExt] Step 2: adding listeners');
  document.addEventListener('mouseover', handleMouseOver, { passive: true });
  document.addEventListener('mouseout', handleMouseOut, { passive: true });

  console.log('[TabelogExt] Step 3: checking chrome.runtime');
  if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
    console.error('[TabelogExt] chrome.runtime.sendMessage not available!');
    return;
  }

  console.log('[TabelogExt] Step 4: sending ping');
  chrome.runtime.sendMessage({ type: 'PING' }, (response) => {
    console.log('[TabelogExt] Step 5: ping callback fired');
    if (chrome.runtime.lastError) {
      console.error('[TabelogExt] Service worker NOT reachable:', chrome.runtime.lastError.message);
    } else if (response && response.pong) {
      console.log('[TabelogExt] Service worker ping OK, latency:', Date.now() - response.time, 'ms');
    } else {
      console.log('[TabelogExt] Unexpected ping response:', response);
    }
  });
  console.log('[TabelogExt] Step 6: init complete');
})();
