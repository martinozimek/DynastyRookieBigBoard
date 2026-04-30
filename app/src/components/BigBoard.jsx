import { useState, useRef } from 'react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis, restrictToWindowEdges } from '@dnd-kit/modifiers';
import PlayerRow from './PlayerRow';
import TierDivider from './TierDivider';
import { annotateWithCalcs } from '../utils/calculations';
import { saveBoardState, exportBoardState, importBoardState } from '../utils/storage';
import { saveCloudStateNow } from '../utils/firebaseSync';
import { exportToExcel } from '../utils/excelExport';

const OWNER_EMAIL = 'mtozimek@gmail.com';
const SANDERSON_KEYS = new Set(['sand_rank', 'sand_exp', 'sand_tier', 'sand_val']);

// frozen: sticky to left pane. left: cumulative pixel offset from table edge (non-league).
// lastFrozen: draws the freeze-boundary separator line.
const COLUMNS = [
  // ── Identity (frozen pane) ─────────────────────────────────────────────────
  { key: 'drag',           label: '',         width: 32,  sortField: null,                frozen: true, left: 0 },
  { key: 'my_rank',        label: 'Rk',       width: 38,  sortField: 'my_rank',           frozen: true, left: 32 },
  { key: 'pos_rank',       label: 'Pos Rk',   width: 52,  sortField: null,                frozen: true, left: 70 },
  { key: 'tier',           label: 'Tier',     width: 40,  sortField: null,                frozen: true, left: 122 },
  { key: 'target',         label: '★▽',       width: 34,  sortField: null,                frozen: true, left: 162 },
  { key: 'name',           label: 'Player',   width: 160, sortField: 'name',              frozen: true, left: 196 },
  { key: 'team',           label: 'Team',     width: 90,  sortField: 'team',              frozen: true, left: 356 },
  { key: 'age',            label: 'Age',      width: 44,  sortField: 'age',               frozen: true, left: 446 },
  { key: 'draft_capital',  label: 'Pick',     width: 54,  sortField: 'draft_capital',     frozen: true, left: 490 },
  { key: 'position',       label: 'Pos',      width: 44,  sortField: 'position',          frozen: true, left: 544, lastFrozen: true },
  // ── Market ─────────────────────────────────────────────────────────────────
  { key: 'adp',            label: 'ADP',      width: 52,  sortField: 'adp' },
  { key: 'adp_delta',      label: 'ADP Δ',    width: 56,  sortField: 'adp_delta' },
  // ── Dynasty Scores ─────────────────────────────────────────────────────────
  { key: 'zap_score',      label: 'ZAP',      width: 52,  sortField: 'zap_score' },
  { key: 'zap_tier_label', label: 'ZAP Tier', width: 110, sortField: null },
  { key: 'lr_risk',        label: 'LR Risk',  width: 58,  sortField: null },
  { key: 'breakout_score', label: 'Brkout',   width: 56,  sortField: 'breakout_score' },
  { key: 'orbit_score',    label: 'ORBIT*',   width: 54,  sortField: 'orbit_score', tooltip: 'Experimental in-progress prospect model. Predicts Best Two Seasons PPR PPG from college/combine data. Pre-draft: uses projected draft capital.' },
  { key: 'waldman_dot',    label: 'W.DOT',    width: 54,  sortField: 'waldman_dot' },
  // ── Expert Ranks ───────────────────────────────────────────────────────────
  { key: 'sand_rank',      label: 'Sand',     width: 48,  sortField: 'sanderson_rank' },
  { key: 'lr_sf_rank',     label: 'LR Rk',    width: 50,  sortField: 'lateround_sf_rank' },
  { key: 'dlf_rank',       label: 'DLF',      width: 44,  sortField: 'dlf_rank' },
  { key: 'leg_rank',       label: 'Leg Rk',   width: 52,  sortField: 'legendary_rank' },
  { key: 'etr_rank',       label: 'ETR',      width: 44,  sortField: 'etr_rank' },
  { key: 'larky_rank',     label: 'Larky',    width: 48,  sortField: 'larky_rank' },
  { key: 'waldman_rank',   label: 'Wld Rk',   width: 54,  sortField: 'waldman_rank' },
  // ── Expert Tiers ───────────────────────────────────────────────────────────
  { key: 'sand_exp',       label: 'S.Exp',    width: 58,  sortField: null },
  { key: 'sand_tier',      label: 'S.Tier',   width: 50,  sortField: 'sanderson_tier' },
  { key: 'sand_val',       label: 'S.Val',    width: 80,  sortField: 'sanderson_tier_label' },
  { key: 'lr_tier',        label: 'LR Tier',  width: 56,  sortField: 'lateround_overall_tier' },
  { key: 'dlf_tier',       label: 'D.Tier',   width: 50,  sortField: 'dlf_tier' },
  { key: 'leg_tier',       label: 'Leg Tier', width: 52,  sortField: 'legendary_tier' },
  // ── Consensus ──────────────────────────────────────────────────────────────
  { key: 'avg_rank',       label: 'Avg Rk',   width: 54,  sortField: 'avg_rank' },
  { key: 'avg_delta',      label: 'Avg Δ',    width: 54,  sortField: 'avg_rank_delta' },
  // ── NFL Grade ──────────────────────────────────────────────────────────────
  { key: 'brugler_grade',  label: 'Brugler',  width: 64,  sortField: 'brugler_grade' },
];

// Thematic groups for the meta header row
const GROUPS = [
  { label: '',               color: null,      frozen: true, keys: ['drag','my_rank','pos_rank','tier','target','name','team','age','draft_capital','position'] },
  { label: 'Market',         color: '#0e7490',              keys: ['adp','adp_delta'] },
  { label: 'Dynasty Scores', color: '#6d28d9',              keys: ['zap_score','zap_tier_label','lr_risk','breakout_score','orbit_score','waldman_dot'] },
  { label: 'Expert Ranks',   color: '#b45309',              keys: ['sand_rank','lr_sf_rank','dlf_rank','leg_rank','etr_rank','larky_rank','waldman_rank'] },
  { label: 'Expert Tiers',   color: '#92400e',              keys: ['sand_exp','sand_tier','sand_val','lr_tier','dlf_tier','leg_tier'] },
  { label: 'Consensus',      color: '#166534',              keys: ['avg_rank','avg_delta'] },
  { label: 'NFL Grade',      color: '#374151',              keys: ['brugler_grade'] },
];

const BRUGLER_ORDER = {'1st':1,'1st-2nd':1.5,'2nd':2,'2nd-3rd':2.5,'3rd':3,'3rd-4th':3.5,'4th':4,'4th-5th':4.5,'5th':5,'5th-6th':5.5,'6th':6,'6th-7th':6.5,'7th':7,'7th-FA':7.5,'FA':8};

const SANDERSON_VAL_ORDER = {
  '2+ BASE 1s': 1, '1.25 BASE 1s': 2, 'BASE 1': 3, 'LATE 1': 4,
  'EARLY 2': 5, 'BASE 2': 6, 'LATE 2': 7, '3RD ROUND': 8, '4TH ROUND': 9, 'WAIVER WIRE': 10,
};

const POS_FILTERS = ['All', 'QB', 'RB', 'WR', 'TE'];
const META_ROW_HEIGHT = 22; // px — used to offset the column-label row's sticky top

let dividerCounter = Date.now();

function getItemTiers(items) {
  const tiers = {};
  let cur = 1;
  for (const item of items) {
    if (item.type === 'tier') cur = item.num;
    else tiers[item.id] = cur;
  }
  return tiers;
}

// Renumber all tier dividers 1, 2, 3… by their top-to-bottom position in items.
// Tier labels follow their divider (remapped by old→new num).
function renumberTiers(items, tierLabels) {
  let count = 0;
  const remap = {};
  const newItems = items.map(item => {
    if (item.type !== 'tier') return item;
    count++;
    remap[item.num] = count;
    return { ...item, num: count };
  });
  const newLabels = {};
  for (const [k, v] of Object.entries(tierLabels)) {
    const n = remap[parseInt(k)];
    if (n != null) newLabels[n] = v;
  }
  return { newItems, newLabels };
}

export default function BigBoard({
  initialState, prospectsData, onPlayerClick,
  league, allLeagues, onSelectLeague, onNewLeague, onEditLeague,
  onMarkDrafted, onClearDrafted, user, onSignOut,
}) {
  const [items, setItems] = useState(initialState.items);
  const [tierLabels, setTierLabels] = useState(initialState.tierLabels || {});
  const [targets, setTargets] = useState(new Set(initialState.targets));
  const [avoids, setAvoids] = useState(new Set(initialState.avoids || []));
  const [playerEdits, setPlayerEdits] = useState(initialState.playerEdits || {});
  const [posFilter, setPosFilter] = useState('All');
  const [showTargetsOnly, setShowTargetsOnly] = useState(false);
  const [sortConfig, setSortConfig] = useState(null);
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);
  const toolbarRef = useRef(null);

  const isOwner = user?.email === OWNER_EMAIL;
  const visibleColumns = COLUMNS.filter(c => isOwner || !SANDERSON_KEYS.has(c.key));
  const visibleKeySet = new Set(visibleColumns.map(c => c.key));
  const pickOffset = league ? 44 : 0;

  const prospectsById = Object.fromEntries(prospectsData.map(p => [p.id, p]));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function persist(newItems, newLabels, newTargets, newEdits, newAvoids) {
    saveBoardState({
      items: newItems ?? items,
      tierLabels: newLabels ?? tierLabels,
      targets: [...(newTargets ?? targets)],
      avoids: [...(newAvoids ?? avoids)],
      playerEdits: newEdits ?? playerEdits,
    });
  }

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex(i => i.id === active.id);
    const newIdx = items.findIndex(i => i.id === over.id);
    const moved = arrayMove(items, oldIdx, newIdx);
    // Renumber tiers after every drag so position drives the number
    const { newItems, newLabels } = renumberTiers(moved, tierLabels);
    setItems(newItems);
    setTierLabels(newLabels);
    persist(newItems, newLabels, null, null, null);
  }

  function handleToggleMark(id) {
    const nextTargets = new Set(targets);
    const nextAvoids = new Set(avoids);
    if (nextTargets.has(id)) {
      nextTargets.delete(id);
      nextAvoids.add(id);
    } else if (nextAvoids.has(id)) {
      nextAvoids.delete(id);
    } else {
      nextTargets.add(id);
    }
    setTargets(nextTargets);
    setAvoids(nextAvoids);
    persist(null, null, nextTargets, null, nextAvoids);
  }

  function handleTierLabelChange(num, label) {
    const newLabels = { ...tierLabels, [num]: label };
    setTierLabels(newLabels);
    persist(null, newLabels, null, null, null);
  }

  function handleAddTier() {
    const tierCount = items.filter(i => i.type === 'tier').length;
    const newDiv = { type: 'tier', id: `div-${++dividerCounter}`, num: tierCount + 1 };
    const { newItems, newLabels } = renumberTiers([...items, newDiv], tierLabels);
    setItems(newItems);
    setTierLabels(newLabels);
    setSortConfig(null);
    persist(newItems, newLabels, null, null, null);
  }

  function handleRemoveTier(divId) {
    const filtered = items.filter(i => i.id !== divId);
    const { newItems, newLabels } = renumberTiers(filtered, tierLabels);
    setItems(newItems);
    setTierLabels(newLabels);
    persist(newItems, newLabels, null, null, null);
  }

  async function handleRepairTiers() {
    const { newItems, newLabels } = renumberTiers(items, tierLabels);
    const newState = {
      items: newItems,
      tierLabels: newLabels,
      targets: [...targets],
      avoids: [...avoids],
      playerEdits,
    };
    setItems(newItems);
    setTierLabels(newLabels);
    setSortConfig(null);
    saveBoardState(newState);
    await saveCloudStateNow(newState);
  }

  function handleFieldChange(id, field, value) {
    const newEdits = { ...playerEdits, [id]: { ...(playerEdits[id] || {}), [field]: value } };
    setPlayerEdits(newEdits);
    persist(null, null, null, newEdits, null);
  }

  function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    importBoardState(file).then(state => {
      setItems(state.items);
      setTierLabels(state.tierLabels || {});
      setTargets(new Set(state.targets));
      setPlayerEdits(state.playerEdits || {});
      persist(state.items, state.tierLabels, new Set(state.targets), state.playerEdits, new Set(state.avoids || []));
    }).catch(err => alert('Import failed: ' + err.message));
  }

  function handleExcelExport() {
    const annotated = buildAnnotated(items, prospectsById, playerEdits);
    const filteredItems = buildFilteredItems(items, annotated, posFilter, showTargetsOnly, targets);
    exportToExcel(filteredItems, prospectsById, targets, playerEdits, tierLabels);
  }

  function buildAnnotated(itemList, byId, edits) {
    const playerIds = itemList.filter(i => i.type === 'player').map(i => i.id);
    const players = playerIds.map(id => {
      const base = byId[id] || { id, name: id };
      return { ...base, ...(edits[id] || {}) };
    });
    return Object.fromEntries(annotateWithCalcs(players).map(p => [p.id, p]));
  }

  function handleSort(field) {
    setSortConfig(prev => {
      if (!prev || prev.field !== field) return { field, dir: 'asc' };
      if (prev.dir === 'asc') return { field, dir: 'desc' };
      return null;
    });
  }

  function getSortValue(p, field) {
    if (field === 'brugler_grade') return BRUGLER_ORDER[p.brugler_grade] ?? 999;
    if (field === 'sanderson_tier_label') return SANDERSON_VAL_ORDER[p.sanderson_tier_label] ?? 999;
    if (field === 'draft_capital') {
      const v = p[field];
      if (!v) return 999;
      const parts = String(v).split('.');
      return (parseInt(parts[0]) || 99) * 100 + (parseInt(parts[1]) || 99);
    }
    const v = p[field];
    if (v == null || v === '') return 999;
    return typeof v === 'string' ? v.toLowerCase() : v;
  }

  function buildFilteredItems(itemList, annotatedById, posF, targetsOnly, targetSet, sort) {
    let playerItems = [];
    let rankCounter = 0;
    const tierMap = getItemTiers(itemList);

    for (const item of itemList) {
      if (item.type === 'tier') continue;
      const p = annotatedById[item.id];
      if (!p) continue;
      if (posF !== 'All' && p.position !== posF) continue;
      if (targetsOnly && !targetSet.has(item.id)) continue;
      rankCounter++;
      playerItems.push({ ...item, displayRank: rankCounter, _tier: tierMap[item.id] ?? 1 });
    }

    if (sort) {
      return [...playerItems].sort((a, b) => {
        if (sort.field === 'my_rank') {
          return sort.dir === 'asc' ? a.displayRank - b.displayRank : b.displayRank - a.displayRank;
        }
        const pa = annotatedById[a.id];
        const pb = annotatedById[b.id];
        const va = getSortValue(pa, sort.field);
        const vb = getSortValue(pb, sort.field);
        if (va === vb) return 0;
        const cmp = va < vb ? -1 : 1;
        return sort.dir === 'asc' ? cmp : -cmp;
      });
    }

    const result = [];
    let pendingTier = null;
    rankCounter = 0;
    for (const item of itemList) {
      if (item.type === 'tier') { pendingTier = item; continue; }
      const p = annotatedById[item.id];
      if (!p) continue;
      if (posF !== 'All' && p.position !== posF) continue;
      if (targetsOnly && !targetSet.has(item.id)) continue;
      if (pendingTier) { result.push(pendingTier); pendingTier = null; }
      rankCounter++;
      result.push({ ...item, displayRank: rankCounter });
    }
    if (pendingTier) result.push(pendingTier);
    return result;
  }

  const annotatedById = buildAnnotated(items, prospectsById, playerEdits);
  const picks = league?.picks || {};
  let filteredItems = buildFilteredItems(items, annotatedById, posFilter, showTargetsOnly, targets, sortConfig);
  if (showAvailableOnly && league) {
    filteredItems = filteredItems.filter(item => item.type === 'tier' || !picks[item.id]);
  }
  const sortableIds = items.map(i => i.id);
  const playerCount = filteredItems.filter(i => i.type === 'player').length;
  const playerTiersMap = getItemTiers(items);

  // Group colSpans — computed dynamically so Sanderson cols shrink cleanly for non-owners
  const groupRows = GROUPS.map(g => ({
    ...g,
    colSpan: g.keys.filter(k => visibleKeySet.has(k)).length + (g.frozen && league ? 1 : 0),
  })).filter(g => g.colSpan > 0);

  const colTop = `${META_ROW_HEIGHT}px`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, height: '100%' }}>
      {/* Toolbar */}
      <div ref={toolbarRef} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 16px', background: '#1a1a2e', color: '#eee', flexWrap: 'wrap', flexShrink: 0, zIndex: 20 }}>
        <span style={{ fontWeight: 700, fontSize: 17, color: '#fff', marginRight: 8 }}>
          2026 Dynasty Rookie Big Board
        </span>

        <div style={{ display: 'flex', gap: 3 }}>
          {POS_FILTERS.map(f => (
            <button key={f} onClick={() => setPosFilter(f)}
              style={{ padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12,
                background: posFilter === f ? '#e94560' : '#16213e',
                color: posFilter === f ? '#fff' : '#aaa',
                fontWeight: posFilter === f ? 700 : 400 }}>
              {f}
            </button>
          ))}
        </div>

        <button onClick={() => setShowTargetsOnly(v => !v)}
          style={{ padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 12,
            background: showTargetsOnly ? '#28a745' : '#16213e',
            color: showTargetsOnly ? '#fff' : '#aaa' }}>
          ★ Targets
        </button>

        <button onClick={handleAddTier}
          style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid #444', cursor: 'pointer', fontSize: 12, background: '#16213e', color: '#ccc' }}>
          + Add Tier
        </button>

        <button onClick={handleRepairTiers}
          title="Renumber and deduplicate tier breaks"
          style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid #7c3aed', cursor: 'pointer', fontSize: 12, background: '#16213e', color: '#a78bfa' }}>
          ⚙ Repair Tiers
        </button>

        {sortConfig && (
          <button onClick={() => setSortConfig(null)}
            title="Tier bars are hidden while sorting — click to restore"
            style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid #e94560', cursor: 'pointer', fontSize: 12, background: '#2a0a0f', color: '#e94560', fontWeight: 600 }}>
            ✕ Clear Sort (tier bars hidden)
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 5, borderLeft: '1px solid #333', paddingLeft: 10 }}>
          <select value={league?.id || ''} onChange={e => onSelectLeague(e.target.value || null)}
            style={{ fontSize: 11, padding: '3px 6px', borderRadius: 4, border: '1px solid #444', background: '#16213e', color: '#ccc', cursor: 'pointer' }}>
            <option value="">— League —</option>
            {Object.values(allLeagues || {}).map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <button onClick={onNewLeague}
            style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid #444', background: '#16213e', color: '#ccc', fontSize: 12, cursor: 'pointer' }} title="New league">
            +
          </button>
          {league && <>
            <button onClick={onEditLeague}
              style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid #444', background: '#16213e', color: '#aaa', fontSize: 11, cursor: 'pointer' }}>
              Rename
            </button>
            <button onClick={() => setShowAvailableOnly(v => !v)}
              style={{ padding: '3px 10px', borderRadius: 4, border: 'none', background: showAvailableOnly ? '#e94560' : '#16213e', color: showAvailableOnly ? '#fff' : '#aaa', fontSize: 12, cursor: 'pointer' }}>
              Available Only
            </button>
          </>}
        </div>

        <div style={{ flex: 1 }} />

        <button onClick={handleExcelExport}
          style={{ padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', background: '#1d7a3b', color: '#fff', fontSize: 12, fontWeight: 600 }}>
          Export Excel
        </button>
        <button onClick={() => exportBoardState({ items, tierLabels, targets: [...targets], playerEdits })}
          style={{ padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', background: '#0f3460', color: '#fff', fontSize: 12 }}>
          Export JSON
        </button>
        <label style={{ padding: '3px 10px', borderRadius: 4, background: '#0f3460', color: '#fff', fontSize: 12, cursor: 'pointer' }}>
          Import JSON
          <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
        </label>
        <span style={{ fontSize: 11, color: '#666' }}>{playerCount} players</span>

        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderLeft: '1px solid #333', paddingLeft: 10 }}>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>{user.displayName || user.email}</span>
            <button onClick={onSignOut}
              style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid #444', background: '#16213e', color: '#aaa', fontSize: 11, cursor: 'pointer' }}>
              Sign out
            </button>
          </div>
        )}
      </div>

      {/* Table — flex-grow fills remaining height; overflow in both axes */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            {/* Row 1: Meta group labels */}
            <tr style={{ background: '#0d0d1f' }}>
              {groupRows.map(g => (
                <th key={g.label || '__id'} colSpan={g.colSpan}
                  style={{
                    height: META_ROW_HEIGHT, padding: '0 6px',
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.08em', textAlign: 'center',
                    color: g.color || 'transparent',
                    borderBottom: '1px solid #2a2a3e',
                    borderLeft: g.color ? `3px solid ${g.color}` : 'none',
                    position: 'sticky', top: 0,
                    background: '#0d0d1f',
                    zIndex: g.frozen ? 13 : 11,
                    left: g.frozen ? 0 : undefined,
                  }}>
                  {g.label}
                </th>
              ))}
            </tr>
            {/* Row 2: Column labels */}
            <tr style={{ background: '#1a1a2e', color: '#ccc' }}>
              {league && (
                <th style={{
                  padding: '6px 6px', minWidth: 44, fontWeight: 600, fontSize: 11,
                  whiteSpace: 'nowrap', textAlign: 'center', color: '#a78bfa',
                  borderBottom: '2px solid #e94560',
                  position: 'sticky', top: colTop, left: 0,
                  background: '#1a1a2e', zIndex: 12,
                }}>
                  Pick
                </th>
              )}
              {visibleColumns.map(col => {
                const isActive = sortConfig && sortConfig.field === col.sortField;
                const indicator = isActive ? (sortConfig.dir === 'asc' ? ' ▲' : ' ▼') : (col.sortField ? ' ⇅' : '');
                return (
                  <th key={col.key}
                    onClick={col.sortField ? () => handleSort(col.sortField) : undefined}
                    title={col.tooltip || undefined}
                    style={{
                      padding: '6px 6px',
                      textAlign: col.key === 'name' ? 'left' : 'center',
                      minWidth: col.width,
                      fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap',
                      borderBottom: '2px solid #e94560',
                      borderRight: col.lastFrozen ? '2px solid #374151' : undefined,
                      position: 'sticky',
                      top: colTop,
                      left: col.frozen ? col.left + pickOffset : undefined,
                      background: '#1a1a2e',
                      zIndex: col.frozen ? 12 : 10,
                      cursor: col.sortField ? 'pointer' : 'default',
                      color: isActive ? '#e94560' : (col.tooltip ? '#a78bfa' : '#ccc'),
                      userSelect: 'none',
                    }}>
                    {col.label}{indicator}
                  </th>
                );
              })}
            </tr>
          </thead>

          <DndContext sensors={sensors} collisionDetection={closestCenter}
            onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}>
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <tbody>
                {filteredItems.map(item => {
                  if (item.type === 'tier') {
                    return (
                      <TierDivider key={item.id} id={item.id} tier={item.num}
                        label={tierLabels[item.num] || `Tier ${item.num}`}
                        onLabelChange={label => handleTierLabelChange(item.num, label)}
                        onRemove={() => handleRemoveTier(item.id)}
                        colCount={visibleColumns.length + (league ? 1 : 0)} />
                    );
                  }
                  const p = annotatedById[item.id];
                  if (!p) return null;
                  const draftedBy = picks[p.id] || null;
                  return (
                    <PlayerRow key={p.id} player={p} myRank={item.displayRank}
                      tier={item._tier ?? playerTiersMap[p.id] ?? 1}
                      isTarget={targets.has(p.id)}
                      isAvoid={avoids.has(p.id)}
                      onToggleMark={() => handleToggleMark(p.id)}
                      onFieldChange={(field, val) => handleFieldChange(p.id, field, val)}
                      onClick={() => onPlayerClick?.(p, item.displayRank)}
                      league={league}
                      draftedBy={draftedBy}
                      onMarkDrafted={team => onMarkDrafted(p.id, team)}
                      onClearDrafted={() => onClearDrafted(p.id)}
                      isOwner={isOwner}
                    />
                  );
                })}
              </tbody>
            </SortableContext>
          </DndContext>
        </table>
      </div>
    </div>
  );
}
