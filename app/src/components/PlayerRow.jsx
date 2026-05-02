import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState, Fragment } from 'react';
import { rankToColor, zapToColor, breakoutToColor, zapTierToColor, deltaToColor, positionColors, draftCapitalToColor, riskToColor, exposureToColor } from '../utils/colors';

const TOTAL = 74;

// Drives the Expert Ranks cell loop; order must match COLUMNS order in BigBoard.
const EXPERT_RANK_CELLS = [
  { key: 'sand_rank',    field: 'sanderson_rank',    ownerOnly: true,  editable: false },
  { key: 'lr_sf_rank',   field: 'lateround_sf_rank', ownerOnly: false, editable: false },
  { key: 'dlf_rank',     field: 'dlf_rank',          ownerOnly: false, editable: false },
  { key: 'leg_rank',     field: 'legendary_rank',    ownerOnly: false, editable: false },
  { key: 'etr_rank',     field: 'etr_rank',          ownerOnly: false, editable: false },
  { key: 'larky_rank',   field: 'larky_rank',        ownerOnly: false, editable: true  },
  { key: 'waldman_rank', field: 'waldman_rank',      ownerOnly: false, editable: true  },
];

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

// Colorized + editable rank cell: shows rankToColor gradient when a value is present.
function ColoredEditableCell({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  function commit() {
    setEditing(false);
    const parsed = draft === '' ? null : parseFloat(draft);
    onChange(parsed);
  }

  const { bg, text } = value != null ? rankToColor(value, TOTAL) : { bg: 'transparent', text: '#ccc' };

  if (editing) {
    return (
      <td style={{ padding: '1px 3px', textAlign: 'center' }}>
        <input autoFocus type="number" value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit} onKeyDown={e => e.key === 'Enter' && commit()}
          style={{ width: 50, fontSize: 11, textAlign: 'center', border: '1px solid #999' }} />
      </td>
    );
  }
  return (
    <td onClick={() => { setDraft(value ?? ''); setEditing(true); }} title="Click to edit"
      style={{ background: bg, color: text, textAlign: 'center', padding: '2px 4px', cursor: 'text', fontWeight: value != null ? 600 : 400, fontSize: 12 }}>
      {value ?? '—'}
    </td>
  );
}

export default function PlayerRow({ player, myRank, tier, isTarget, isAvoid, onToggleMark, onFieldChange, onClick, league, draftedBy, onMarkDrafted, onClearDrafted, isOwner, compareExpert }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: player.id });

  const isMyPick = draftedBy === 'mine';
  const isDrafted = draftedBy === 'drafted';
  const pickOffset = league ? 44 : 0;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : (isDrafted ? 0.5 : 1),
    background: isMyPick ? '#dcfce7'
      : isDrafted ? '#ffe4e6'
      : isTarget ? '#d4edda'
      : isAvoid ? '#fff7ed'
      : (myRank % 2 === 0 ? '#f9f9f9' : '#ffffff'),
    cursor: 'default',
  };

  const pc = positionColors(player.position);

  // Returns base sticky styles for frozen identity cells.
  // background: 'inherit' lets sticky cells cover scrolled content while showing row highlight colors.
  const frozen = (left, isLast = false) => ({
    position: 'sticky',
    left: left + pickOffset,
    zIndex: 11,
    background: 'inherit',
    ...(isLast ? { borderRight: '2px solid #e94560' } : {}),
  });

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
          style={{ position: 'sticky', left: 0, zIndex: 11, background: 'inherit',
            textAlign: 'center', padding: '2px 6px', cursor: 'pointer', fontSize: 14, userSelect: 'none', fontWeight: 700,
            color: isMyPick ? '#16a34a' : isDrafted ? '#dc2626' : '#d1d5db' }}>
          {isMyPick ? '✔' : isDrafted ? '✗' : '·'}
        </td>
      )}

      {/* Drag handle */}
      <td {...attributes} {...listeners}
        style={{ ...frozen(0), cursor: 'grab', textAlign: 'center', padding: '4px 6px', color: '#bbb', fontSize: 16, userSelect: 'none' }}>
        ≡
      </td>

      {/* My Rank */}
      <td style={{ ...frozen(32), textAlign: 'center', padding: '2px 4px', fontWeight: 700, fontSize: 13 }}>{myRank}</td>

      {/* Positional Rank */}
      <td style={{ ...frozen(70), textAlign: 'center', padding: '2px 4px', fontSize: 11, color: '#555', fontWeight: 600 }}>
        {player.pos_rank ?? '—'}
      </td>

      {/* Tier */}
      <td style={{ ...frozen(122), textAlign: 'center', padding: '2px 4px', fontSize: 11, color: '#777', fontWeight: 600 }}>{tier}</td>

      {/* Target / Avoid — cycles ☆ → ★ → ▽ → ☆ */}
      <td onClick={onToggleMark}
        title={isTarget ? 'Target (click → avoid)' : isAvoid ? 'Avoid (click → clear)' : 'Click: mark as target'}
        style={{ ...frozen(162), textAlign: 'center', cursor: 'pointer', fontSize: 15, padding: '2px 3px',
          color: isTarget ? '#16a34a' : isAvoid ? '#dc2626' : '#94a3b8',
          fontWeight: isTarget || isAvoid ? 700 : 400 }}>
        {isTarget ? '★' : isAvoid ? '▽' : '☆'}
      </td>

      {/* Player name — clickable for detail panel */}
      <td onClick={onClick}
        style={{ ...frozen(196), padding: '3px 8px', fontWeight: 600, fontSize: 13,
          width: 160, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          cursor: onClick ? 'pointer' : 'default',
          color: onClick ? '#1a6fc4' : '#111',
          textDecoration: onClick ? 'underline dotted' : 'none' }}>
        {player.name}
      </td>

      {/* Team */}
      <td style={{ ...frozen(356), padding: '2px 6px', fontSize: 12, color: '#555', whiteSpace: 'nowrap' }}>
        {player.nfl_team || player.team || '—'}
      </td>

      {/* Age */}
      <td style={{ ...frozen(446), textAlign: 'center', padding: '2px 4px', fontSize: 12 }}>{player.age ?? '—'}</td>

      {/* Draft Capital — colorized but still frozen */}
      {(() => {
        const { bg, text } = draftCapitalToColor(player.draft_capital);
        return (
          <td style={{ position: 'sticky', left: 490 + pickOffset, zIndex: 11,
            background: bg || 'inherit', color: text,
            textAlign: 'center', padding: '2px 4px', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>
            {player.draft_capital ?? '—'}
          </td>
        );
      })()}

      {/* Position — LAST FROZEN; freeze boundary separator on right */}
      <td style={{ ...frozen(544, true), textAlign: 'center', padding: '2px 4px' }}>
        <span style={{ background: pc.bg, color: pc.text, border: `1px solid ${pc.border}`,
          padding: '1px 5px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
          {player.position || '—'}
        </span>
      </td>

      {/* ── Market ───────────────────────────────────────────────── */}
      <td style={{ textAlign: 'center', padding: '2px 4px', fontSize: 12 }}>{player.adp ?? '—'}</td>
      <DeltaCell value={player.adp_delta} />

      {/* ── Dynasty Scores ────────────────────────────────────────── */}
      <ZapCell value={player.zap_score} />

      {(() => {
        const { bg, text } = zapTierToColor(player.lateround_zap_tier_label);
        return (
          <td style={{ padding: '2px 5px', fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap', textAlign: 'center', background: bg, color: text }}>
            {player.lateround_zap_tier_label ?? '—'}
          </td>
        );
      })()}

      {/* LR Risk — grouped with ZAP for context */}
      {(() => {
        const { bg, text } = riskToColor(player.lateround_risk);
        return (
          <td style={{ background: bg, color: text, textAlign: 'center', padding: '2px 4px', fontWeight: 700, fontSize: 10, whiteSpace: 'nowrap' }}>
            {player.lateround_risk ?? '—'}
          </td>
        );
      })()}

      {(() => {
        const { bg, text } = breakoutToColor(player.breakout_score);
        return (
          <td style={{ background: bg, color: text, textAlign: 'center', padding: '2px 4px', fontWeight: 600, fontSize: 12 }}>
            {player.breakout_score ?? '—'}
          </td>
        );
      })()}

      <ZapCell value={player.orbit_score} />
      <ZapCell value={player.waldman_dot} />

      {/* S.Val and S.Exp — owner-only grade signals, grouped with scores */}
      {isOwner && (
        <td style={{ textAlign: 'center', padding: '2px 5px', fontSize: 10, color: '#444', whiteSpace: 'nowrap', fontWeight: 600 }}>
          {player.sanderson_tier_label ?? '—'}
        </td>
      )}
      {isOwner && (() => {
        const { bg, text } = exposureToColor(player.sanderson_exposure);
        return (
          <td style={{ background: bg, color: text, textAlign: 'center', padding: '2px 4px', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>
            {player.sanderson_exposure ?? '—'}
          </td>
        );
      })()}

      {/* ── Expert Ranks ──────────────────────────────────────────── */}
      {EXPERT_RANK_CELLS.filter(o => !o.ownerOnly || isOwner).map(o => (
        <Fragment key={o.key}>
          {o.editable
            ? <ColoredEditableCell value={player[o.field]} onChange={v => onFieldChange(o.field, v)} />
            : <RankCell value={player[o.field]} />
          }
          {compareExpert?.key === o.key && (
            <DeltaCell value={player.compare_delta ?? null} />
          )}
        </Fragment>
      ))}

      {/* ── Expert Tiers ──────────────────────────────────────────── */}
      {isOwner && (
        <td style={{ textAlign: 'center', padding: '2px 4px', fontSize: 12, color: '#555' }}>
          {player.sanderson_tier ?? '—'}
        </td>
      )}
      <td style={{ textAlign: 'center', padding: '2px 4px', fontSize: 12, color: '#555', fontWeight: 600 }}>
        {player.lateround_overall_tier ?? '—'}
      </td>
      <td style={{ textAlign: 'center', padding: '2px 4px', fontSize: 12, color: '#555', fontWeight: 600 }}>
        {player.dlf_tier ?? '—'}
      </td>
      <td style={{ textAlign: 'center', padding: '2px 4px', fontSize: 12, color: '#555', fontWeight: 600 }}>
        {player.legendary_tier ?? '—'}
      </td>

      {/* ── Consensus ─────────────────────────────────────────────── */}
      <RankCell value={player.avg_rank} />
      <DeltaCell value={player.avg_rank_delta} />

      {/* ── NFL Grade ─────────────────────────────────────────────── */}
      <td style={{ textAlign: 'center', padding: '2px 4px', fontSize: 11, fontWeight: 600, color: '#444' }}>
        {player.brugler_grade ?? '—'}
      </td>

    </tr>
  );
}
