import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import { rankToColor, zapToColor, breakoutToColor, zapTierToColor, deltaToColor, positionColors } from '../utils/colors';

const TOTAL = 74;

function RankCell({ value }) {
  const { bg, text } = rankToColor(value, TOTAL);
  return (
    <td style={{ background: bg, color: text, textAlign: 'center', padding: '2px 4px', fontWeight: 600, fontSize: 12 }}>
      {value ?? '—'}
    </td>
  );
}

function DeltaCell({ value }) {
  const { bg, text } = deltaToColor(value);
  const label = value == null ? '—' : value > 0 ? `+${value}` : `${value}`;
  return (
    <td style={{ background: bg, color: text, textAlign: 'center', padding: '2px 4px', fontWeight: 600, fontSize: 12 }}>
      {label}
    </td>
  );
}

function ZapCell({ value }) {
  const { bg, text } = zapToColor(value);
  return (
    <td style={{ background: bg, color: text, textAlign: 'center', padding: '2px 4px', fontWeight: 600, fontSize: 12 }}>
      {value ?? '—'}
    </td>
  );
}

function EditableCell({ value, onChange, type = 'number', placeholder = '—' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  function commit() {
    setEditing(false);
    const parsed = type === 'number' ? (draft === '' ? null : parseFloat(draft)) : (draft.trim() || null);
    onChange(parsed);
  }

  if (editing) {
    return (
      <td style={{ padding: '1px 3px', textAlign: 'center' }}>
        <input autoFocus type={type === 'number' ? 'number' : 'text'} value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit} onKeyDown={e => e.key === 'Enter' && commit()}
          style={{ width: 50, fontSize: 11, textAlign: 'center', border: '1px solid #999' }} />
      </td>
    );
  }
  return (
    <td onClick={() => { setDraft(value ?? ''); setEditing(true); }} title="Click to edit"
      style={{ textAlign: 'center', padding: '2px 4px', cursor: 'text', fontSize: 12, color: value == null ? '#ccc' : '#333' }}>
      {value ?? placeholder}
    </td>
  );
}

export default function PlayerRow({ player, myRank, tier, isTarget, onToggleTarget, onFieldChange, onClick, league, draftedBy, onMarkDrafted, onClearDrafted }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: player.id });

  const isMyPick = draftedBy === 'mine';
  const isDrafted = draftedBy === 'drafted';

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : (isDrafted ? 0.5 : 1),
    background: isMyPick ? '#dcfce7'
      : isDrafted ? '#ffe4e6'
      : isTarget ? '#d4edda'
      : (myRank % 2 === 0 ? '#f9f9f9' : '#ffffff'),
    cursor: 'default',
  };

  const pc = positionColors(player.position);

  return (
    <tr ref={setNodeRef} style={style}>
      {/* Draft status cell — click cycles: available → mine → drafted → available */}
      {league && (
        <td
          onClick={() => {
            if (!draftedBy) onMarkDrafted('mine');
            else if (draftedBy === 'mine') onMarkDrafted('drafted');
            else onClearDrafted();
          }}
          title={!draftedBy ? 'Click: mark as my pick' : draftedBy === 'mine' ? 'Click: mark as drafted' : 'Click: clear'}
          style={{ textAlign: 'center', padding: '2px 6px', cursor: 'pointer', fontSize: 14, userSelect: 'none', fontWeight: 700,
            color: isMyPick ? '#16a34a' : isDrafted ? '#dc2626' : '#d1d5db' }}>
          {isMyPick ? '✔' : isDrafted ? '✗' : '·'}
        </td>
      )}

      {/* Drag handle */}
      <td {...attributes} {...listeners}
        style={{ cursor: 'grab', textAlign: 'center', padding: '4px 6px', color: '#bbb', fontSize: 16, userSelect: 'none' }}>
        ≡
      </td>

      {/* My Rank */}
      <td style={{ textAlign: 'center', padding: '2px 4px', fontWeight: 700, fontSize: 13 }}>{myRank}</td>

      {/* Positional Rank */}
      <td style={{ textAlign: 'center', padding: '2px 4px', fontSize: 11, color: '#555', fontWeight: 600 }}>
        {player.pos_rank ?? '—'}
      </td>

      {/* Tier (read-only display) */}
      <td style={{ textAlign: 'center', padding: '2px 4px', fontSize: 11, color: '#777', fontWeight: 600 }}>{tier}</td>

      {/* Target */}
      <td onClick={onToggleTarget} title={isTarget ? 'Remove target' : 'Mark as target'}
        style={{ textAlign: 'center', cursor: 'pointer', fontSize: 15, padding: '2px 3px', color: isTarget ? '#155724' : '#ccc' }}>
        {isTarget ? '★' : '☆'}
      </td>

      {/* Player name — clickable for detail panel */}
      <td onClick={onClick}
        style={{ padding: '3px 8px', fontWeight: 600, fontSize: 13, minWidth: 150, whiteSpace: 'nowrap',
          cursor: onClick ? 'pointer' : 'default',
          color: onClick ? '#1a6fc4' : '#111',
          textDecoration: onClick ? 'underline dotted' : 'none' }}>
        {player.name}
      </td>

      {/* Team */}
      <td style={{ padding: '2px 6px', fontSize: 12, color: '#555', whiteSpace: 'nowrap' }}>
        {player.team || '—'}
      </td>

      {/* Age */}
      <td style={{ textAlign: 'center', padding: '2px 4px', fontSize: 12 }}>{player.age ?? '—'}</td>

      {/* Draft Capital (editable) */}
      <EditableCell value={player.draft_capital} onChange={v => onFieldChange('draft_capital', v)} type="text" placeholder="—" />

      {/* Position */}
      <td style={{ textAlign: 'center', padding: '2px 4px' }}>
        <span style={{ background: pc.bg, color: pc.text, border: `1px solid ${pc.border}`,
          padding: '1px 5px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
          {player.position || '—'}
        </span>
      </td>

      {/* ADP */}
      <td style={{ textAlign: 'center', padding: '2px 4px', fontSize: 12 }}>{player.adp ?? '—'}</td>

      {/* ADP Delta */}
      <DeltaCell value={player.adp_delta} />

      {/* ZAP Score */}
      <ZapCell value={player.zap_score} />

      {/* ZAP Tier Label */}
      {(() => {
        const { bg, text } = zapTierToColor(player.lateround_zap_tier_label);
        return (
          <td style={{ padding: '2px 5px', fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'center', background: bg, color: text }}>
            {player.lateround_zap_tier_label ?? '—'}
          </td>
        );
      })()}

      {/* Breakout Score */}
      {(() => {
        const { bg, text } = breakoutToColor(player.breakout_score);
        return (
          <td style={{ background: bg, color: text, textAlign: 'center', padding: '2px 4px', fontWeight: 600, fontSize: 12 }}>
            {player.breakout_score ?? '—'}
          </td>
        );
      })()}

      {/* ORBIT Score */}
      <ZapCell value={player.orbit_score} />

      {/* LateRound SF Rank */}
      <RankCell value={player.lateround_sf_rank} />

      {/* LateRound Overall Tier */}
      <RankCell value={player.lateround_overall_tier} />

      {/* LateRound Risk */}
      <EditableCell value={player.lateround_risk} onChange={v => onFieldChange('lateround_risk', v)} type="text" />

      {/* ETR Rank */}
      <RankCell value={player.etr_rank} />

      {/* DLF Rank */}
      <RankCell value={player.dlf_rank} />

      {/* Sanderson Rank */}
      <RankCell value={player.sanderson_rank} />

      {/* Sanderson Tier */}
      <td style={{ textAlign: 'center', padding: '2px 4px', fontSize: 12, color: '#555' }}>
        {player.sanderson_tier ?? '—'}
      </td>

      {/* Sanderson Value Label */}
      <td style={{ textAlign: 'center', padding: '2px 5px', fontSize: 10, color: '#444', whiteSpace: 'nowrap', fontWeight: 600 }}>
        {player.sanderson_tier_label ?? '—'}
      </td>

      {/* Brugler Grade */}
      <td style={{ textAlign: 'center', padding: '2px 4px', fontSize: 11, fontWeight: 600, color: '#444' }}>
        {player.brugler_grade ?? '—'}
      </td>

      {/* Waldman DOT */}
      <ZapCell value={player.waldman_dot} />

      {/* Josh Larky Rank */}
      <EditableCell value={player.larky_rank} onChange={v => onFieldChange('larky_rank', v)} />

      {/* Waldman Rank */}
      <EditableCell value={player.waldman_rank} onChange={v => onFieldChange('waldman_rank', v)} />

      {/* Exposure */}
      <EditableCell value={player.exposure} onChange={v => onFieldChange('exposure', v)} type="text" />

      {/* Avg Rank */}
      <RankCell value={player.avg_rank} />

      {/* Avg Rank Delta */}
      <DeltaCell value={player.avg_rank_delta} />
    </tr>
  );
}
