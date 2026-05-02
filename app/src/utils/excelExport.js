/**
 * Export the current board to a styled .xlsx file using ExcelJS.
 * Column order and colors mirror the BigBoard web app exactly.
 */
import ExcelJS from 'exceljs';

// ── Fill helpers (mirror colors.js) ────────────────────────────────────────

function rankFill(rank, total = 74) {
  if (rank == null || rank === '') return null;
  const t = Math.max(0, Math.min(1, (rank - 1) / (total - 1)));
  let r, g, b;
  if (t < 0.5) {
    const u = t / 0.5;
    r = Math.round(34 + u * (255 - 34));
    g = Math.round(139 + u * (193 - 139));
    b = Math.round(34 * (1 - u));
  } else {
    const u = (t - 0.5) / 0.5;
    r = 255; g = Math.round(193 * (1 - u)); b = 0;
  }
  const hex = v => v.toString(16).padStart(2, '0').toUpperCase();
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex(r)}${hex(g)}${hex(b)}` } };
}

function deltaFill(delta) {
  if (delta == null || delta === '') return null;
  if (delta < -3) return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF28A745' } };
  if (delta < 0)  return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7BC67E' } };
  if (delta === 0) return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F9FA' } };
  if (delta <= 3) return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC107' } };
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC3545' } };
}

function zapScoreFill(score) {
  if (score == null || score === '') return null;
  const t = Math.max(0, Math.min(1, 1 - score / 100));
  return rankFill(Math.round(t * 63) + 1, 64);
}

function zapTierFill(label) {
  if (!label) return null;
  const ORDER = ['LEGENDARY PERFORMER','ELITE PRODUCER','WEEKLY STARTER','FLEX PLAY','DART THROW','WAIVER WIRE ADD','BENCHWARMER'];
  const ARGB  = ['FF15803D','FF22C55E','FF86EFAC','FFFDE68A','FFFB923C','FFF87171','FFDC2626'];
  const idx = ORDER.indexOf(String(label).toUpperCase());
  return idx === -1 ? null : { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB[idx] } };
}

function riskFill(value) {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  if (v === 'low risk')  return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF22C55E' } };
  if (v === 'neutral')   return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBBF24' } };
  if (v === 'high risk') return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
  return null;
}

function breakoutFill(score) {
  if (score == null || score === '') return null;
  const t = Math.max(0, Math.min(1, 1 - Math.min(score, 80) / 70));
  return rankFill(Math.round(t * 63) + 1, 64);
}

function draftCapitalFill(value) {
  if (!value || value === '—') return null;
  const s = String(value).trim().toUpperCase();
  if (s === 'UDFA') return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
  const round = parseInt(s.split('.')[0], 10);
  return isNaN(round) ? null : rankFill(round, 7);
}

function exposureFill(value) {
  if (!value) return null;
  const ORDER = { 'FADE':0,'0.25X':1,'0.5X':2,'0.75X':3,'1X':4,'1.25X':5,'1.5X':6,'2X':7,'2.5X':8,'3X':9,'4X':10,'6X':11 };
  const ARGB  = ['FFDC2626','FFF87171','FFFCA5A5','FFFDE68A','FFF3F4F6','FFD1FAE5','FF86EFAC','FF4ADE80','FF22C55E','FF16A34A','FF15803D','FF14532D'];
  const idx = ORDER[String(value).trim().toUpperCase()];
  return idx == null ? null : { type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB[idx] } };
}

const POS_ARGB = { RB: 'FFD4EDDA', WR: 'FFCCE5FF', QB: 'FFFFF3CD', TE: 'FFE2D9F3' };
function posFill(pos) {
  const argb = POS_ARGB[pos];
  return argb ? { type: 'pattern', pattern: 'solid', fgColor: { argb } } : null;
}

// ── Column definitions — order matches COLUMNS in BigBoard.jsx ──────────────
// Each col: { key, label, w (width), ownerOnly?, get(p, ctx), fill?(value)→ExcelFill }
// ctx = { myRank, tier, isTarget, isAvoid }

function makeColumns(isOwner) {
  const cols = [
    // Identity
    { key: 'my_rank',   label: 'My Rank', w: 8,  get: (p, c) => c.myRank },
    { key: 'pos_rank',  label: 'Pos Rk',  w: 7,  get: (p, c) => p.pos_rank ?? '' },
    { key: 'tier',      label: 'Tier',    w: 6,  get: (p, c) => c.tier },
    { key: 'target',    label: 'Tgt',     w: 5,  get: (p, c) => c.isTarget ? '★' : (c.isAvoid ? '▽' : '') },
    { key: 'name',      label: 'Player',  w: 22, get: (p, c) => p.name },
    { key: 'team',      label: 'Team',    w: 12, get: (p, c) => p.nfl_team || p.team || '' },
    { key: 'age',       label: 'Age',     w: 6,  get: (p, c) => p.age ?? '' },
    { key: 'pick',      label: 'Pick',    w: 8,  get: (p, c) => p.draft_capital ?? '',            fill: draftCapitalFill },
    { key: 'pos',       label: 'Pos',     w: 6,  get: (p, c) => p.position || '',                 fill: posFill },
    // Market
    { key: 'adp',       label: 'ADP',     w: 7,  get: (p, c) => p.adp ?? '' },
    { key: 'adp_delta', label: 'ADP Δ',   w: 7,  get: (p, c) => p.adp_delta ?? '',               fill: deltaFill },
    // Scores & Grades
    { key: 'zap',       label: 'ZAP',     w: 7,  get: (p, c) => p.zap_score ?? '',               fill: zapScoreFill },
    { key: 'zap_cat',   label: 'ZAP Cat.',w: 16, get: (p, c) => p.lateround_zap_tier_label ?? '', fill: zapTierFill },
    { key: 'lr_risk',   label: 'LR Risk', w: 9,  get: (p, c) => p.lateround_risk ?? '',          fill: riskFill },
    { key: 'brkout',    label: 'Brkout',  w: 8,  get: (p, c) => p.breakout_score ?? '',          fill: breakoutFill },
    { key: 'orbit',     label: 'ORBIT*',  w: 8,  get: (p, c) => p.orbit_score ?? '',             fill: zapScoreFill },
    { key: 'wdot',      label: 'W.DOT',   w: 8,  get: (p, c) => p.waldman_dot ?? '',             fill: zapScoreFill },
    { key: 'sand_val',  label: 'S.Val',   w: 14, ownerOnly: true, get: (p, c) => p.sanderson_tier_label ?? '' },
    { key: 'sand_exp',  label: 'S.Exp',   w: 8,  ownerOnly: true, get: (p, c) => p.sanderson_exposure ?? '', fill: exposureFill },
    // Expert Ranks
    { key: 'sand_rank', label: 'Sand',    w: 7,  ownerOnly: true, get: (p, c) => p.sanderson_rank ?? '',    fill: rankFill },
    { key: 'lr_rk',     label: 'LR Rk',   w: 7,  get: (p, c) => p.lateround_sf_rank ?? '',      fill: rankFill },
    { key: 'dlf',       label: 'DLF',     w: 7,  get: (p, c) => p.dlf_rank ?? '',               fill: rankFill },
    { key: 'leg_rk',    label: 'Leg Rk',  w: 7,  get: (p, c) => p.legendary_rank ?? '',         fill: rankFill },
    { key: 'etr',       label: 'ETR',     w: 7,  get: (p, c) => p.etr_rank ?? '',               fill: rankFill },
    { key: 'larky',     label: 'Larky',   w: 7,  get: (p, c) => p.larky_rank ?? '',             fill: rankFill },
    { key: 'wld_rk',    label: 'Wld Rk',  w: 7,  get: (p, c) => p.waldman_rank ?? '',           fill: rankFill },
    // Expert Tiers
    { key: 'sand_tier', label: 'S.Tier',  w: 7,  ownerOnly: true, get: (p, c) => p.sanderson_tier ?? '' },
    { key: 'lr_tier',   label: 'LR Tier', w: 8,  get: (p, c) => p.lateround_overall_tier ?? '' },
    { key: 'd_tier',    label: 'D.Tier',  w: 7,  get: (p, c) => p.dlf_tier ?? '' },
    { key: 'leg_tier',  label: 'Leg Tier',w: 8,  get: (p, c) => p.legendary_tier ?? '' },
    // Consensus
    { key: 'avg_rk',    label: 'Avg Rk',  w: 7,  get: (p, c) => p.avg_rank ?? '',              fill: rankFill },
    { key: 'avg_delta', label: 'Avg Δ',   w: 7,  get: (p, c) => p.avg_rank_delta ?? '',         fill: deltaFill },
    // NFL Grade
    { key: 'brugler',   label: 'Brugler', w: 9,  get: (p, c) => p.brugler_grade ?? '' },
  ];
  return isOwner ? cols : cols.filter(c => !c.ownerOnly);
}

const TIER_FILLS = [
  'FF1A472A','FF155724','FF186A3B','FF1E8449',
  'FF239B56','FF27AE60','FF52BE80','FF82E0AA',
  'FFABEBC6','FFD5F5E3',
];

export async function exportToExcel(filteredItems, annotatedById, targets, avoids, tierLabels, isOwner) {
  const COLS = makeColumns(isOwner);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Dynasty Big Board 2026';
  const ws = wb.addWorksheet('Big Board', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  ws.columns = COLS.map(c => ({ header: c.label, key: c.key, width: c.w }));

  const headerRow = ws.getRow(1);
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };
    cell.font = { bold: true, color: { argb: 'FFCCCCCC' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFE94560' } } };
  });

  let currentTier = 1;

  for (const item of filteredItems) {
    if (item.type === 'tier') {
      currentTier = item.num;
      const label = tierLabels[item.num] || `Tier ${item.num}`;
      const tierRow = ws.addRow([]);
      ws.mergeCells(tierRow.number, 1, tierRow.number, COLS.length);
      const cell = tierRow.getCell(1);
      cell.value = `── ${label} ──`;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TIER_FILLS[Math.min(item.num - 1, TIER_FILLS.length - 1)] } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      tierRow.height = 16;
      continue;
    }

    const id = item.id;
    const p = annotatedById[id];
    if (!p) continue;

    const isTarget = targets.has(id);
    const isAvoid = avoids.has(id);
    const ctx = { myRank: item.displayRank, tier: currentTier, isTarget, isAvoid };

    const values = COLS.map(col => {
      const v = col.get(p, ctx);
      return v === '' ? null : v;
    });

    const row = ws.addRow(values);
    row.height = 15;

    // Base row fill
    const rowFill = isTarget
      ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } }
      : isAvoid
        ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } }
        : item.displayRank % 2 === 0
          ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } }
          : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };

    row.eachCell({ includeEmpty: true }, cell => {
      cell.fill = rowFill;
      cell.font = { size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE8E8E8' } },
      };
    });

    // Per-column color fills
    COLS.forEach((col, i) => {
      if (!col.fill) return;
      const v = values[i];
      if (v == null) return;
      const fill = col.fill(v);
      if (fill) row.getCell(i + 1).fill = fill;
    });

    // Player name: bold + left-aligned
    const nameColIdx = COLS.findIndex(c => c.key === 'name') + 1;
    if (nameColIdx > 0) {
      row.getCell(nameColIdx).font = { bold: true, size: 10 };
      row.getCell(nameColIdx).alignment = { horizontal: 'left', vertical: 'middle' };
    }

    // Target/Avoid icon: colored text
    const tgtColIdx = COLS.findIndex(c => c.key === 'target') + 1;
    if (tgtColIdx > 0) {
      if (isTarget) row.getCell(tgtColIdx).font = { color: { argb: 'FF155724' }, bold: true, size: 11 };
      else if (isAvoid) row.getCell(tgtColIdx).font = { color: { argb: 'FFDC2626' }, bold: true, size: 11 };
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BigBoard2026_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
