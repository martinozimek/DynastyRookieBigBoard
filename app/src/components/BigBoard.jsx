import { useState, useCallback, useRef } from 'react';
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
import { exportToExcel } from '../utils/excelExport';

// items: array of {type:'player',id} | {type:'tier',id:'div-N',num:N}
// Tier num is derived from the last seen tier divider above each player.

// sortField: the prospect field used for sorting (null = not sortable)
// For Brugler grade, we sort by the embedded round number
const COLUMNS = [
  { key: 'drag',            label: '',         width: 32,  sortField: null },
  { key: 'my_rank',         label: 'Rk',       width: 38,  sortField: 'my_rank' },
  { key: 'pos_rank',        label: 'Pos Rk',   width: 52,  sortField: null },
  { key: 'tier',            label: 'Tier',     width: 40,  sortField: null },
  { key: 'target',          label: '★',        width: 34,  sortField: null },
  { key: 'name',            label: 'Player',   width: 160, sortField: 'name' },
  { key: 'team',            label: 'Team',     width: 90,  sortField: 'team' },
  { key: 'age',             label: 'Age',      width: 44,  sortField: 'age' },
  { key: 'draft_capital',   label: 'Pick',     width: 54,  sortField: 'draft_capital' },
  { key: 'position',        label: 'Pos',      width: 44,  sortField: 'position' },
  { key: 'adp',             label: 'ADP',      width: 52,  sortField: 'adp' },
  { key: 'adp_delta',       label: 'ADP Δ',    width: 56,  sortField: 'adp_delta' },
  { key: 'breakout_score',  label: 'Brkout',   width: 56,  sortField: 'breakout_score' },
  { key: 'zap_score',       label: 'ZAP',      width: 52,  sortField: 'zap_score' },
  { key: 'zap_tier_label',  label: 'ZAP Tier', width: 110, sortField: null },
  { key: 'lr_sf_rank',      label: 'LR Rk',    width: 50,  sortField: 'lateround_sf_rank' },
  { key: 'lr_tier',         label: 'LR Tier',  width: 56,  sortField: 'lateround_overall_tier' },
  { key: 'lr_risk',         label: 'LR Risk',  width: 58,  sortField: null },
  { key: 'etr_rank',        label: 'ETR',      width: 44,  sortField: 'etr_rank' },
  { key: 'dlf_rank',        label: 'DLF',      width: 44,  sortField: 'dlf_rank' },
  { key: 'sand_rank',       label: 'Sand',     width: 48,  sortField: 'sanderson_rank' },
  { key: 'sand_tier',       label: 'S.Tier',   width: 50,  sortField: 'sanderson_tier' },
  { key: 'sand_val',        label: 'S.Val',    width: 80,  sortField: null },
  { key: 'brugler_grade',   label: 'Brugler',  width: 64,  sortField: 'brugler_grade' },
  { key: 'waldman_dot',     label: 'W.DOT',    width: 54,  sortField: 'waldman_dot' },
  { key: 'larky_rank',      label: 'Larky',    width: 48,  sortField: 'larky_rank' },
  { key: 'waldman_rank',    label: 'Wld Rk',   width: 54,  sortField: 'waldman_rank' },
  { key: 'exposure',        label: 'Exp',      width: 44,  sortField: null },
  { key: 'avg_rank',        label: 'Avg Rk',   width: 54,  sortField: 'avg_rank' },
  { key: 'avg_delta',       label: 'Avg Δ',    width: 54,  sortField: 'avg_rank_delta' },
];

// Round grades for Brugler sort order
const BRUGLER_ORDER = {'1st':1,'1st-2nd':1.5,'2nd':2,'2nd-3rd':2.5,'3rd':3,'3rd-4th':3.5,'4th':4,'4th-5th':4.5,'5th':5,'5th-6th':5.5,'6th':6,'6th-7th':6.5,'7th':7,'7th-FA':7.5,'FA':8};

const POS_FILTERS = ['All', 'QB', 'RB', 'WR', 'TE'];

let dividerCounter = 100; // unique IDs for new dividers

function getItemTiers(items) {
  const tiers = {};
  let cur = 1;
  for (const item of items) {
    if (item.type === 'tier') { cur = item.num; }
    else { tiers[item.id] = cur; }
  }
  return tiers;
}

export default function BigBoard({
  initialState, prospectsData, onPlayerClick,
  league, allLeagues, onSelectLeague, onNewLeague, onEditLeague,
  onMarkDrafted, onClearDrafted,
}) {
  const [items, setItems] = useState(initialState.items);
  const [tierLabels, setTierLabels] = useState(initialState.tierLabels || {});
  const [targets, setTargets] = useState(new Set(initialState.targets));
  const [playerEdits, setPlayerEdits] = useState(initialState.playerEdits || {});
  const [posFilter, setPosFilter] = useState('All');
  const [showTargetsOnly, setShowTargetsOnly] = useState(false);
  const [sortConfig, setSortConfig] = useState(null); // {field, dir:'asc'|'desc'}
  const [showAvailableOnly, setShowAvailableOnly] = useState(false);
  const toolbarRef = useRef(null);

  const prospectsById = Object.fromEntries(prospectsData.map(p => [p.id, p]));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function persist(newItems, newLabels, newTargets, newEdits) {
    saveBoardState({
      items: newItems ?? items,
      tierLabels: newLabels ?? tierLabels,
      targets: [...(newTargets ?? targets)],
      playerEdits: newEdits ?? playerEdits,
    });
  }

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    const oldIdx = items.findIndex(i => i.id === active.id);
    const newIdx = items.findIndex(i => i.id === over.id);
    // Don't allow tier divider to move before position 1 (keep at least one player visible at top if desired)
    const newItems = arrayMove(items, oldIdx, newIdx);
    setItems(newItems);
    persist(newItems, null, null, null);
  }

  function handleToggleTarget(id) {
    const next = new Set(targets);
    next.has(id) ? next.delete(id) : next.add(id);
    setTargets(next);
    persist(null, null, next, null);
  }

  function handleTierLabelChange(num, label) {
    const newLabels = { ...tierLabels, [num]: label };
    setTierLabels(newLabels);
    persist(null, newLabels, null, null);
  }

  function handleAddTier() {
    // Add a new tier divider at the end, num = max existing tier + 1
    const maxNum = items.filter(i => i.type === 'tier').reduce((m, i) => Math.max(m, i.num), 1);
    const newNum = maxNum + 1;
    const newDiv = { type: 'tier', id: `div-${++dividerCounter}`, num: newNum };
    const newItems = [...items, newDiv];
    setItems(newItems);
    persist(newItems, null, null, null);
  }

  function handleRemoveTier(divId) {
    const newItems = items.filter(i => i.id !== divId);
    setItems(newItems);
    persist(newItems, null, null, null);
  }

  function handleFieldChange(id, field, value) {
    const newEdits = { ...playerEdits, [id]: { ...(playerEdits[id] || {}), [field]: value } };
    setPlayerEdits(newEdits);
    persist(null, null, null, newEdits);
  }

  function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    importBoardState(file).then(state => {
      setItems(state.items);
      setTierLabels(state.tierLabels || {});
      setTargets(new Set(state.targets));
      setPlayerEdits(state.playerEdits || {});
      persist(state.items, state.tierLabels, new Set(state.targets), state.playerEdits);
    }).catch(err => alert('Import failed: ' + err.message));
  }

  function handleExcelExport() {
    // Build a filtered-off list so Excel gets same view as screen
    const playerTiers = getItemTiers(items);
    const annotated = buildAnnotated(items, prospectsById, playerEdits);
    const filteredItems = buildFilteredItems(items, annotated, posFilter, showTargetsOnly, targets);
    exportToExcel(filteredItems, prospectsById, targets, playerEdits, tierLabels);
  }

  // Build annotated players (with live calcs)
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
      return null; // third click clears sort
    });
  }

  function getSortValue(p, field) {
    if (field === 'brugler_grade') return BRUGLER_ORDER[p.brugler_grade] ?? 999;
    if (field === 'draft_capital') {
      const v = p[field];
      if (!v) return 999;
      // Parse "2.14" → 2*100+14 = 214 for numeric sort
      const parts = String(v).split('.');
      return (parseInt(parts[0]) || 99) * 100 + (parseInt(parts[1]) || 99);
    }
    const v = p[field];
    if (v == null || v === '') return 999;
    return typeof v === 'string' ? v.toLowerCase() : v;
  }

  // Build filtered item list preserving tier dividers
  function buildFilteredItems(itemList, annotatedById, posF, targetsOnly, targetSet, sort) {
    // First collect player items that pass filters
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

    // When sorted, return flat player list without tier dividers
    if (sort) {
      const sorted = [...playerItems].sort((a, b) => {
        const pa = annotatedById[a.id];
        const pb = annotatedById[b.id];
        const va = getSortValue(pa, sort.field);
        const vb = getSortValue(pb, sort.field);
        if (va === vb) return 0;
        const cmp = va < vb ? -1 : 1;
        return sort.dir === 'asc' ? cmp : -cmp;
      });
      return sorted.map((item, i) => ({ ...item, displayRank: i + 1 }));
    }

    // Unsorted: rebuild with tier dividers in original order
    const result = [];
    let pendingTier = null;
    rankCounter = 0;
    for (const item of itemList) {
      if (item.type === 'tier') {
        pendingTier = item;
        continue;
      }
      const p = annotatedById[item.id];
      if (!p) continue;
      if (posF !== 'All' && p.position !== posF) continue;
      if (targetsOnly && !targetSet.has(item.id)) continue;
      if (pendingTier) { result.push(pendingTier); pendingTier = null; }
      rankCounter++;
      result.push({ ...item, displayRank: rankCounter });
    }
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

        {/* League section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, borderLeft: '1px solid #333', paddingLeft: 10 }}>
          <select
            value={league?.id || ''}
            onChange={e => onSelectLeague(e.target.value || null)}
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
      </div>

      {/* Table — flex-grow fills remaining height; overflow in both axes */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#1a1a2e', color: '#ccc' }}>
              {league && (
                <th style={{ padding: '6px 6px', minWidth: 44, fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap', borderBottom: '2px solid #e94560', position: 'sticky', top: 0, background: '#1a1a2e', zIndex: 10, textAlign: 'center', color: '#a78bfa' }}>
                  Pick
                </th>
              )}
              {COLUMNS.map(col => {
                const isActive = sortConfig && sortConfig.field === col.sortField;
                const indicator = isActive ? (sortConfig.dir === 'asc' ? ' ▲' : ' ▼') : (col.sortField ? ' ⇅' : '');
                return (
                  <th key={col.key}
                    onClick={col.sortField ? () => handleSort(col.sortField) : undefined}
                    style={{
                      padding: '6px 6px', textAlign: col.key === 'name' ? 'left' : 'center',
                      minWidth: col.width, fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap',
                      borderBottom: '2px solid #e94560', position: 'sticky', top: 0, background: '#1a1a2e', zIndex: 10,
                      cursor: col.sortField ? 'pointer' : 'default',
                      color: isActive ? '#e94560' : '#ccc',
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
                        extraCol={!!league} />
                    );
                  }
                  const p = annotatedById[item.id];
                  if (!p) return null;
                  const draftedBy = picks[p.id] || null;
                  return (
                    <PlayerRow key={p.id} player={p} myRank={item.displayRank}
                      tier={item._tier ?? playerTiersMap[p.id] ?? 1}
                      isTarget={targets.has(p.id)}
                      onToggleTarget={() => handleToggleTarget(p.id)}
                      onFieldChange={(field, val) => handleFieldChange(p.id, field, val)}
                      onClick={() => onPlayerClick?.(p)}
                      league={league}
                      draftedBy={draftedBy}
                      onMarkDrafted={team => onMarkDrafted(p.id, team)}
                      onClearDrafted={() => onClearDrafted(p.id)}
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
