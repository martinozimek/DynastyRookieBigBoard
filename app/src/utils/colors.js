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

// Color for Breakout Finder score (raw scale: 10s=red, 20s=orange, 30s=yellow, 40s=light green, 50s=green, 60s=solid green, 70s+=dark green)
export function breakoutToColor(score) {
  if (score == null) return { bg: 'transparent', text: '#888' };
  const s = Math.max(0, Math.min(80, score));
  // Map 0→red (t=1), 35→yellow (t=0.5), 70+→dark green (t=0)
  const t = Math.max(0, Math.min(1, 1 - s / 70));
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

// ZAP tier label color — Legendary Performer is best (green), Benchwarmer is worst (red)
const ZAP_TIER_ORDER = [
  'LEGENDARY PERFORMER',
  'ELITE PRODUCER',
  'WEEKLY STARTER',
  'FLEX PLAY',
  'DART THROW',
  'WAIVER WIRE ADD',
  'BENCHWARMER',
];
const ZAP_TIER_COLORS = [
  { bg: '#15803d', text: '#fff' },  // Legendary — deep green
  { bg: '#22c55e', text: '#fff' },  // Elite Producer — bright green
  { bg: '#86efac', text: '#1a1a1a' }, // Weekly Starter — light green
  { bg: '#fde68a', text: '#1a1a1a' }, // Flex Play — yellow
  { bg: '#fb923c', text: '#fff' },  // Dart Throw — orange
  { bg: '#f87171', text: '#fff' },  // Waiver Wire — light red
  { bg: '#dc2626', text: '#fff' },  // Benchwarmer — red
];
export function zapTierToColor(label) {
  if (!label) return { bg: 'transparent', text: '#888' };
  const idx = ZAP_TIER_ORDER.indexOf(label.toUpperCase());
  if (idx === -1) return { bg: '#e5e7eb', text: '#555' };
  return ZAP_TIER_COLORS[idx];
}

// Color for LateRound risk indicator
export function riskToColor(value) {
  if (!value) return { bg: 'transparent', text: '#888' };
  const v = String(value).trim().toLowerCase();
  if (v === 'low risk')  return { bg: '#22c55e', text: '#fff' };
  if (v === 'neutral')   return { bg: '#fbbf24', text: '#1a1a1a' };
  if (v === 'high risk') return { bg: '#dc2626', text: '#fff' };
  return { bg: '#e5e7eb', text: '#555' };
}

// Color for draft capital (e.g. "1.03", "3.15", "UDFA", null)
export function draftCapitalToColor(value) {
  if (!value || value === '—') return { bg: 'transparent', text: '#888' };
  const s = String(value).trim().toUpperCase();
  if (s === 'UDFA') return { bg: '#dc2626', text: '#fff' };
  const round = parseInt(s.split('.')[0], 10);
  if (isNaN(round)) return { bg: 'transparent', text: '#888' };
  // Round 1 = green, Round 7 = red
  return rankToColor(round, 7);
}

// Color for Sanderson target exposure (FADE=red, 1X=neutral, high multiples=green)
const EXPOSURE_ORDER = { 'FADE': 0, '0.25X': 1, '0.5X': 2, '0.75X': 3, '1X': 4, '1.25X': 5, '1.5X': 6, '2X': 7, '2.5X': 8, '3X': 9, '4X': 10, '6X': 11 };
const EXPOSURE_COLORS = [
  { bg: '#dc2626', text: '#fff' },    // FADE
  { bg: '#f87171', text: '#fff' },    // 0.25X
  { bg: '#fca5a5', text: '#1a1a1a' }, // 0.5X
  { bg: '#fde68a', text: '#1a1a1a' }, // 0.75X
  { bg: '#f3f4f6', text: '#555' },    // 1X (neutral)
  { bg: '#d1fae5', text: '#065f46' }, // 1.25X
  { bg: '#86efac', text: '#1a1a1a' }, // 1.5X
  { bg: '#4ade80', text: '#1a1a1a' }, // 2X
  { bg: '#22c55e', text: '#fff' },    // 2.5X
  { bg: '#16a34a', text: '#fff' },    // 3X
  { bg: '#15803d', text: '#fff' },    // 4X
  { bg: '#14532d', text: '#fff' },    // 6X
];
export function exposureToColor(value) {
  if (!value) return { bg: 'transparent', text: '#888' };
  const key = String(value).trim().toUpperCase().replace('X', 'X');
  const idx = EXPOSURE_ORDER[key] ?? EXPOSURE_ORDER[String(value).trim()];
  if (idx == null) return { bg: '#e5e7eb', text: '#555' };
  return EXPOSURE_COLORS[idx];
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
