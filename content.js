// content.js — Hover detection, tooltip UI, and Tabelog score display
// Runs on omakase.in and tablecheck.com

(function () {
  'use strict';

  const hostname = window.location.hostname;
  const siteCfg = SITE_CONFIG[hostname];
  if (!siteCfg) return;

  // --- State ---
  let hoverTimer = null;
  let hideTimer = null;
  let tooltipEl = null;
  let requestId = 0;
  let currentBlock = null;

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

    // Flip below if above viewport
    if (blockRect.top < th + 16) {
      top = blockRect.bottom + window.scrollY + gap;
    }

    // Clamp horizontally
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
      case 'RATE_LIMITED':
        msg = 'リクエスト制限中。しばらく待ってからお試しください。';
        break;
      case 'NOT_FOUND':
        msg = '食べログで見つかりませんでした';
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

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- Hover handlers ---
  function handleMouseOver(e) {
    const block = e.target.closest(siteCfg.restaurantSelector);
    if (!block) return;
    if (block === currentBlock) return;
    currentBlock = block;

    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

    hoverTimer = setTimeout(() => {
      const name = siteCfg.nameExtractor(block);
      if (!name || name.length < 2) return;

      const area = siteCfg.areaExtractor(block);
      const rect = block.getBoundingClientRect();
      showLoading(tooltipEl, rect);

      const rid = ++requestId;
      chrome.runtime.sendMessage(
        { type: 'FETCH_TABELOG', data: { name, area } },
        (response) => {
          if (rid !== requestId) return; // stale
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
    }, siteCfg.hoverDelay || 300);
  }

  function handleMouseOut(e) {
    const block = e.target.closest(siteCfg.restaurantSelector);
    if (!block) return;
    if (block !== currentBlock) return;
    currentBlock = null;

    clearTimeout(hoverTimer);
    hideTimer = setTimeout(hideTooltip, 200);
  }

  // --- Init ---
  tooltipEl = createTooltip();
  document.addEventListener('mouseover', handleMouseOver, { passive: true });
  document.addEventListener('mouseout', handleMouseOut, { passive: true });
})();
