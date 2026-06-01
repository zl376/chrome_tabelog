// fuzzy-match.js — String normalization and fuzzy matching for restaurant names
// Handles Japanese text including full-width characters, brackets, and dividers.

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[・･•·/／]/g, '')           // Dividers common in Japanese
    .replace(/[（）()\[\]【】「」『』]/g, '') // Brackets
    .replace(/[~〜～]/g, '')                // Tildes
    .replace(/[！!？?。、.,，]/g, '')       // Punctuation
    .replace(/[\s　]+/g, ' ')          // Whitespace (incl. full-width space)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/[​-‍﻿]/g, '') // Zero-width chars
    .replace(/[♪♫★☆♥♡◆◇●○]/g, '')         // Decorative symbols
    .trim();
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

function similarity(a, b) {
  if (a === b) return 1.0;
  if (!a || !b) return 0.0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - dist / maxLen;
}

function findBestMatch(query, candidates, threshold) {
  const q = normalize(query);
  if (!q || candidates.length === 0) return null;

  let best = { score: 0, match: null };

  for (const c of candidates) {
    const cn = normalize(c.name);
    if (!cn) continue;

    if (cn === q) {
      return { ...c, matchConfidence: 1.0 };
    }

    // Substring containment: one fully contains the other
    if (cn.includes(q) || q.includes(cn)) {
      const lenRatio = Math.min(q.length, cn.length) / Math.max(q.length, cn.length);
      const conf = 0.85 + 0.10 * lenRatio;
      if (conf > best.score) {
        best = { score: conf, match: { ...c, matchConfidence: conf } };
      }
      continue;
    }

    // Levenshtein
    const sim = similarity(q, cn);
    if (sim >= threshold && sim > best.score) {
      best = { score: sim, match: { ...c, matchConfidence: sim } };
    }
  }

  return best.match;
}
