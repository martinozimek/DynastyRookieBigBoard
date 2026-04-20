import { useState } from 'react';

const DEFAULT_TEAMS = Array.from({ length: 12 }, (_, i) => `Team ${i + 1}`);

export default function LeagueSetup({ existing, onSave, onClose }) {
  const [name, setName] = useState(existing?.name || '');
  const [teams, setTeams] = useState(
    existing?.teams?.length === 12 ? [...existing.teams] : [...DEFAULT_TEAMS]
  );
  const [myTeam, setMyTeam] = useState(existing?.myTeam || teams[0]);

  function updateTeam(i, val) {
    const next = [...teams];
    const wasMyTeam = teams[i] === myTeam;
    next[i] = val;
    setTeams(next);
    if (wasMyTeam) setMyTeam(val);
  }

  function handleSave() {
    if (!name.trim()) { alert('Enter a league name.'); return; }
    if (!myTeam) { alert('Select your team.'); return; }
    onSave({ name: name.trim(), myTeam, teams });
  }

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
    zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
  const modal = {
    background: '#fff', borderRadius: 10, padding: '28px 32px',
    width: 480, maxHeight: '90vh', overflowY: 'auto',
    boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 18px', fontSize: 18, fontWeight: 800 }}>
          {existing ? 'Edit League' : 'New League'}
        </h2>

        <label style={labelStyle}>League Name</label>
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="e.g. Main League"
          style={inputStyle} />

        <label style={{ ...labelStyle, marginTop: 18 }}>My Team</label>
        <select value={myTeam} onChange={e => setMyTeam(e.target.value)} style={inputStyle}>
          {teams.map((t, i) => <option key={i} value={t}>{t || `Team ${i + 1}`}</option>)}
        </select>

        <div style={{ marginTop: 18, marginBottom: 8, fontWeight: 700, fontSize: 12, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Team Names (12-team)
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
          {teams.map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#999', width: 22, textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
              <input value={t} onChange={e => updateTeam(i, e.target.value)}
                placeholder={`Team ${i + 1}`}
                style={{ ...inputStyle, margin: 0, flex: 1, padding: '5px 8px' }} />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid #ddd', background: '#f5f5f5', cursor: 'pointer', fontSize: 13 }}>
            Cancel
          </button>
          <button onClick={handleSave}
            style={{ padding: '8px 20px', borderRadius: 6, border: 'none', background: '#1a6fc4', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            {existing ? 'Save Changes' : 'Create League'}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle = { display: 'block', fontWeight: 700, fontSize: 12, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 };
const inputStyle = { display: 'block', width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, outline: 'none', margin: 0 };
