import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { tierToColor } from '../utils/colors';

export default function TierDivider({ id, tier, label, onLabelChange, onRemove, extraCol }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);
  const color = tierToColor(tier);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function commit() {
    setEditing(false);
    onLabelChange?.(draft.trim() || `Tier ${tier}`);
  }

  return (
    <tr ref={setNodeRef} style={style}>
      <td colSpan={extraCol ? 32 : 31}
        style={{ background: color, borderTop: '3px solid rgba(0,0,0,0.25)', padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '3px 6px', gap: 6 }}>
          {/* Drag handle */}
          <span {...attributes} {...listeners}
            style={{ cursor: 'grab', color: 'rgba(255,255,255,0.6)', fontSize: 16, lineHeight: 1, userSelect: 'none', flexShrink: 0 }}>
            ⠿
          </span>

          {/* Label */}
          {editing ? (
            <input autoFocus value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => e.key === 'Enter' && commit()}
              style={{ background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.7)',
                color: '#fff', fontWeight: 700, fontSize: 12, outline: 'none', flexGrow: 1, minWidth: 0 }} />
          ) : (
            <span onClick={() => { setDraft(label); setEditing(true); }}
              title="Click to rename"
              style={{ color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', flexGrow: 1 }}>
              ── {label} ──
            </span>
          )}

          {/* Remove button */}
          <button onClick={onRemove} title="Remove this tier break"
            style={{ background: 'rgba(0,0,0,0.2)', border: 'none', color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer', borderRadius: 3, padding: '0 5px', fontSize: 14, lineHeight: '18px',
              flexShrink: 0 }}>
            ×
          </button>
        </div>
      </td>
    </tr>
  );
}
