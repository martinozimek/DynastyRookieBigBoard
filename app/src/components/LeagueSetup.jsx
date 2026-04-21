import { useState } from 'react';

export default function LeagueSetup({ existing, onSave, onClose }) {
  const [name, setName] = useState(existing?.name || '');

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { alert('Enter a league name.'); return; }
    onSave(trimmed);
  }

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
    zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 10, padding: '28px 32px', width: 360, boxShadow: '0 8px 40px rgba(0,0,0,0.3)' }}>
        <h2 style={{ margin: '0 0 18px', fontSize: 18, fontWeight: 800 }}>
          {existing ? 'Rename League' : 'New League'}
        </h2>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          placeholder="e.g. Main League, Bestball 2026..."
          style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '9px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 14, outline: 'none', marginBottom: 20 }}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid #ddd', background: '#f5f5f5', cursor: 'pointer', fontSize: 13 }}>
            Cancel
          </button>
          <button onClick={handleSave}
            style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: '#1a6fc4', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            {existing ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
