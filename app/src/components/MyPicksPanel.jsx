const POS_ORDER = ['QB', 'RB', 'WR', 'TE'];
const POS_COLORS = { QB: '#f59e0b', RB: '#10b981', WR: '#3b82f6', TE: '#8b5cf6' };

export default function MyPicksPanel({ league, prospectsById, onUnmark }) {
  if (!league) return null;

  const myPlayers = Object.entries(league.picks)
    .filter(([, status]) => status === 'mine')
    .map(([id]) => prospectsById[id])
    .filter(Boolean);

  const byPos = {};
  for (const p of myPlayers) {
    (byPos[p.position] = byPos[p.position] || []).push(p);
  }

  const totalDrafted = Object.values(league.picks).filter(s => s === 'drafted').length;

  return (
    <div style={{
      width: 190, flexShrink: 0, background: '#1a1a2e', borderLeft: '1px solid #2d2d4e',
      display: 'flex', flexDirection: 'column', overflowY: 'auto',
    }}>
      <div style={{ padding: '10px 12px 6px', borderBottom: '1px solid #2d2d4e' }}>
        <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>
          {league.name}
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>My Picks</div>
        <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
          {myPlayers.length} picked · {totalDrafted} off board
        </div>
      </div>

      <div style={{ flex: 1, padding: '8px 10px', overflowY: 'auto' }}>
        {myPlayers.length === 0 && (
          <div style={{ fontSize: 11, color: '#4b5563', fontStyle: 'italic', marginTop: 8 }}>
            Click ⭐ on a player to add them here.
          </div>
        )}

        {POS_ORDER.map(pos => {
          const players = byPos[pos];
          if (!players?.length) return null;
          const color = POS_COLORS[pos];
          return (
            <div key={pos} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                {pos} ({players.length})
              </div>
              {players.map(p => (
                <div key={p.id}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid #2d2d4e' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#e5e7eb', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {p.name}
                    </div>
                    {p.draft_capital && (
                      <div style={{ fontSize: 9, color: '#6b7280' }}>{p.draft_capital}</div>
                    )}
                  </div>
                  <button onClick={() => onUnmark(p.id)} title="Remove"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4b5563', fontSize: 13, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
