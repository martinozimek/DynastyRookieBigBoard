/**
 * Export the current board to a styled .xlsx file using ExcelJS.
 * Runs entirely in the browser via the bundled ExcelJS package.
 */
import ExcelJS from 'exceljs';

const POS_FILLS = {
  RB: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } },
  WR: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCE5FF' } },
  QB: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } },
  TE: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2D9F3' } },
};

const TIER_FILLS = [
  'FF1A472A','FF155724','FF186A3B','FF1E8449',
  'FF239B56','FF27AE60','FF52BE80','FF82E0AA',
  'FFABEBC6','FFD5F5E3',
];

function rankFill(rank, total = 74) {
  if (rank == null) return null;
  const t = Math.max(0, Math.min(1, (rank - 1) / (total - 1)));
  let r, g, b;
  if (t < 0.5) {
    const u = t / 0.5;
    r = Math.round(34 + u * (255 - 34));
    g = Math.round(139 + u * (193 - 139));
    b = Math.round(34 * (1 - u));
  } else {
    const u = (t - 0.5) / 0.5;
    r = 255;
    g = Math.round(193 * (1 - u));
    b = 0;
  }
  const hex = (v) => v.toString(16).padStart(2, '0').toUpperCase();
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex(r)}${hex(g)}${hex(b)}` } };
}

function deltaFill(delta) {
  if (delta == null) return null;
  if (delta < -3) return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF28A745' } };
  if (delta < 0)  return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7BC67E' } };
  if (delta === 0) return null;
  if (delta <= 3) return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC107' } };
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC3545' } };
}

const HEADERS = [
  'My Rank','Pos Rk','Tier','Target','Player','Team','Age','Position',
  'ADP','ADP Δ','Breakout','ZAP','ZAP Tier','LR Tier','LR Risk',
  'ETR','DLF','Sanderson','Sand Tier','Brugler',
  'Wld DOT','Larky','Wld Rank','Exposure','Avg Rank','Avg Δ',
];

const COL_WIDTHS = [
  8,7,6,7,22,12,6,7,
  7,7,9,7,16,8,8,
  7,7,10,9,9,
  8,7,8,9,9,7,
];

export async function exportToExcel(items, prospectsById, targets, playerEdits, tierLabels) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Dynasty Big Board 2026';
  const ws = wb.addWorksheet('Big Board', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // Column widths
  ws.columns = HEADERS.map((h, i) => ({ header: h, key: h, width: COL_WIDTHS[i] }));

  // Header row styling
  const headerRow = ws.getRow(1);
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };
    cell.font = { bold: true, color: { argb: 'FFCCCCCC' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFE94560' } } };
  });

  let currentTier = 1;
  let myRank = 0;
  const posCounters = {};

  for (const item of items) {
    if (item.type === 'tier') {
      currentTier = item.num;
      const label = tierLabels[item.num] || `Tier ${item.num}`;
      const tierRow = ws.addRow([]);
      ws.mergeCells(tierRow.number, 1, tierRow.number, HEADERS.length);
      const cell = tierRow.getCell(1);
      cell.value = `── ${label} ──`;
      const fillArgb = TIER_FILLS[Math.min(item.num - 1, TIER_FILLS.length - 1)];
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      tierRow.height = 16;
      continue;
    }

    // Player row
    myRank++;
    const id = item.id;
    const base = prospectsById[id] || { id, name: id };
    const edits = playerEdits[id] || {};
    const p = { ...base, ...edits };
    const pos = p.position || '';
    posCounters[pos] = (posCounters[pos] || 0) + 1;
    const posRank = pos ? `${pos}${posCounters[pos]}` : '';

    const isTarget = targets.has(id);
    const avgRank = p.avg_rank;
    const adpDelta = (myRank != null && p.adp != null) ? Math.round((myRank - p.adp) * 10) / 10 : null;
    const avgDelta = (myRank != null && avgRank != null) ? Math.round((myRank - avgRank) * 10) / 10 : null;

    const values = [
      myRank, posRank, currentTier,
      isTarget ? '★' : '',
      p.name, p.team || '', p.age ?? '', p.position || '',
      p.adp ?? '', adpDelta ?? '', p.breakout_score ?? '',
      p.zap_score ?? '', p.lateround_zap_tier_label ?? '', p.lateround_overall_tier ?? '', p.lateround_risk ?? '',
      p.etr_rank ?? '', p.dlf_rank ?? '', p.sanderson_rank ?? '',
      p.sanderson_tier ?? '', p.brugler_grade ?? '',
      p.waldman_dot ?? '', p.larky_rank ?? '', p.waldman_rank ?? '', p.exposure ?? '',
      avgRank ?? '', avgDelta ?? '',
    ];

    const row = ws.addRow(values);
    row.height = 15;

    // Row background
    const rowFill = isTarget
      ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4EDDA' } }
      : (myRank % 2 === 0
          ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9F9F9' } }
          : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } });

    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.fill = rowFill;
      cell.font = { size: 10 };
      cell.alignment = { horizontal: colNum <= 3 || colNum === 5 ? 'center' : colNum === 4 ? 'left' : 'center', vertical: 'middle' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE8E8E8' } },
      };
    });

    // Color rank cells: ETR=col16, DLF=17, Sand=18, AvgRank=25
    const rankCols = { 16: p.etr_rank, 17: p.dlf_rank, 18: p.sanderson_rank, 25: avgRank };
    for (const [col, val] of Object.entries(rankCols)) {
      const fill = rankFill(val);
      if (fill) row.getCell(Number(col)).fill = fill;
    }
    // Delta cols: ADP Δ = col 10, Avg Δ = col 26
    for (const [col, val] of [[10, adpDelta], [26, avgDelta]]) {
      const fill = deltaFill(val);
      if (fill) row.getCell(col).fill = fill;
    }
    // Position badge fill on col 8
    const posFill = POS_FILLS[p.position];
    if (posFill) row.getCell(8).fill = posFill;

    // Bold player name
    row.getCell(5).font = { bold: true, size: 10 };

    // Target star
    if (isTarget) row.getCell(4).font = { color: { argb: 'FF155724' }, bold: true, size: 11 };
  }

  // Write to buffer and trigger download
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `BigBoard2026_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
