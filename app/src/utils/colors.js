// Color utilities for rank columns

const POS_COLORS = {
  RB: { bg: '#d4edda', border: '#28a745', text: '#155724' },
  WR: { bg: '#cce5ff', border: '#004085', text: '#004085' },
  QB: { bg: '#fff3cd', border: '#856404', text: '#856404' },
  TE: { bg: '#e2d9f3', border: '#6f42c1', text: '#432874' },
};

export function positionColors(pos) {
  return POS_COLORS[pos] || { bg: '#f8f9fa', border: '#6c757d', text: '#495057' };
}

// Interpolate between green → yellow → red based on rank value
// rank: 1-based rank (lower = better), total: total players in pool
export function rankToColor(rank, total = 64) {
  if (rank == null) return { bg: 'transparent', text: '#888' };
  const t = Math.max(0, Math.min(1, (rank - 1) / (total - 1)));

  let r, g, b;
  if (t < 0.5) {
    // green -> yellow
    const u = t / 0.5;
    r = Math.round(34 + u * (255 - 34));
    g = Math.round(139 + u * (193 - 139));
    b = Math.round(34 * (1 - u));
  } else {
    // yellow -> red
    const u = (t - 0.5) / 0.5;
    r = 255;
    g = Math.round(193 * (1 - u));
    b = 0;
  }

  const bg = `rgb(${r},${g},${b})`;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const text = luminance > 0.55 ? '#1a1a1a' : '#ffffff';
  return { bg, text };
}

// Color for ZAP score (0-100, higher = better)
export function zapToColor(score) {
  if (score == null) return { bg: 'transparent', text: '#888' };
  const t = Math.max(0, Math.min(1, 1 - score / 100));
  return rankToColor(Math.round(t * 63) + 1, 64);
}

// Color for delta values (negative = player ranked higher than ADP/avg = good)
export function deltaToColor(delta) {
  if (delta == null) return { bg: 'transparent', text: '#888' };
  if (delta < -3) return { bg: '#28a745', text: '#fff' };   // strong buy
  if (delta < 0)  return { bg: '#7bc67e', text: '#1a1a1a' }; // slight buy
  if (delta === 0) return { bg: '#f8f9fa', text: '#555' };
  if (delta <= 3) return { bg: '#ffc107', text: '#1a1a1a' }; // slight sell
  return { bg: '#dc3545', text: '#fff' };                    // strong sell
}

export function tierToColor(tier) {
  const palette = [
    '#1a472a', '#155724', '#186a3b', '#1e8449',
    '#239b56', '#27ae60', '#52be80', '#82e0aa',
    '#abebc6', '#d5f5e3',
  ];
  if (tier == null) return '#cccccc';
  return palette[Math.min(tier - 1, palette.length - 1)];
}
