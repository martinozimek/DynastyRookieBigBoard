const POS_COLORS = { QB: '#f59e0b', RB: '#10b981', WR: '#3b82f6', TE: '#8b5cf6' };

export default function MyTeamPanel({ league, prospectsById, onClose, onUpdateNeeds, onUnmark }) {
  const myPlayers = Object.entries(league.picks)
    .filter(([, team]) => team === league.myTeam)
    .map(([id]) => prospectsById[id])
    .filter(Boolean)
    .sort((a, b) => {
      const order = ['QB', 'RB', 'WR', 'TE'];
      return (order.indexOf(a.position) - order.indexOf(b.position)) || a.name.localeCompare(b.name);
    });

  const myNeeds = league.teamNeeds?.[league.myTeam] || '';

  const byPos = {};
  for (const p of myPlayers) {
    (byPos[p.position] = byPos[p.position] || []).push(p);
  }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 150, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 380, background: '#fff', height: '100%', overflowY: 'auto', boxShadow: '-4px 0 24px rgba(0,0,0,0.2)', padding: '20px 22px 40px' }}>

        <button onClick={onClose}
          style={{ float: 'right', background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9ca3af' }}>×</button>

        <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
          {league.name}
        </div>
        <h2 style={{ margin: '0 0 18px', fontSize: 20, fontWeight: 800 }}>My Roster</h2>
        <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
          {myPlayers.length} player{myPlayers.length !== 1 ? 's' : ''} drafted · 12-team SF/TEP
        </div>

        {myPlayers.length === 0 && (
          <div style={{ color: '#9ca3af', fontSize: 13, fontStyle: 'italic', marginBottom: 20 }}>
            No picks yet. Mark players as "My Pick" on the board.
          </div>
        )}

        {['QB', 'RB', 'WR', 'TE'].map(pos => {
          const players = byPos[pos];
          if (!players?.length) return null;
          const pc = POS_COLORS[pos];
          return (
            <div key={pos} style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: '#fff', background: pc, borderRadius: 4, padding: '2px 8px', display: 'inline-block', marginBottom: 6 }}>
                {pos}
              </div>
              {players.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 6 }}>{p.team}</span>
                    {p.draft_capital && <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 6 }}>({p.draft_capital})</span>}
                  </div>
                  <button onClick={() => onUnmark(p.id)} title="Remove from my team"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: 16, lineHeight: 1, padding: '0 4px' }}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          );
        })}

        <div style={{ marginTop: 24 }}>
          <div style={{ fontWeight: 700, fontSize: 12, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Team Needs
          </div>
          <textarea
            value={myNeeds}
            onChange={e => onUpdateNeeds(league.myTeam, e.target.value)}
            placeholder="e.g. Need WR1, backup QB..."
            rows={4}
            style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 10px', fontSize: 13, resize: 'vertical', outline: 'none' }}
          />
        </div>

        {Object.keys(league.teamNeeds || {}).filter(t => t !== league.myTeam && league.teamNeeds[t]).length > 0 && (
          <div style={{ marginTop: 22 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
              Other Team Needs
            </div>
            {league.teams.filter(t => t !== league.myTeam && league.teamNeeds?.[t]).map(t => (
              <div key={t} style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: '#374151', marginBottom: 2 }}>{t}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{league.teamNeeds[t]}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
