import { useState, useEffect } from 'react';
import BigBoard from './components/BigBoard';
import LeagueSetup from './components/LeagueSetup';
import MyTeamPanel from './components/MyTeamPanel';
import { loadBoardState, saveBoardState, migrateState } from './utils/storage';
import { loadLeagueState, saveLeagueState, makeLeague } from './utils/leagueStorage';
import prospectsRaw from './data/prospects.json';

function buildDefaultItems(players) {
  const items = [];
  let lastTier = null;
  let divCounter = 1;

  players.forEach((p, i) => {
    const rank = i + 1;
    let tier;
    if (rank <= 6)       tier = 1;
    else if (rank <= 12) tier = 2;
    else if (rank <= 24) tier = 3;
    else if (rank <= 36) tier = 4;
    else if (rank <= 48) tier = 5;
    else                 tier = 6;

    if (tier !== lastTier) {
      if (lastTier !== null) {
        items.push({ type: 'tier', id: `div-${divCounter++}`, num: tier });
      }
      lastTier = tier;
    }
    items.push({ type: 'player', id: p.id });
  });

  return items;
}

const POS_COLORS = { QB: '#f59e0b', RB: '#10b981', WR: '#3b82f6', TE: '#8b5cf6' };

function fmtHeight(inches) {
  if (!inches) return '—';
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

function StatSection({ title, children }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontWeight: 700, fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #e5e7eb', paddingBottom: 4, marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function KVTable({ rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <tbody>
        {rows.filter(([, v]) => v != null && v !== '').map(([label, val]) => (
          <tr key={label} style={{ borderBottom: '1px solid #f3f4f6' }}>
            <td style={{ padding: '5px 4px', color: '#6b7280', fontWeight: 500, width: '45%' }}>{label}</td>
            <td style={{ padding: '5px 4px', color: '#111' }}>{val ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function fmt1(v) { return v != null ? Number(v).toFixed(1) : null; }
function fmt2(v) { return v != null ? Number(v).toFixed(2) : null; }
function ypc(rush_yards, rush_attempts) {
  return rush_attempts ? fmt2(rush_yards / rush_attempts) : null;
}
function ypr(rec_yards, receptions) {
  return receptions ? fmt2(rec_yards / receptions) : null;
}

function SeasonStats({ player }) {
  const seasons = player.seasons;
  if (!seasons || seasons.length === 0) return <div style={{ color: '#999', fontSize: 13 }}>No season data</div>;
  const pos = player.position;

  return (
    <div style={{ overflowX: 'auto' }}>
      {seasons.map(s => {
        const pff = s.pff || {};
        let headers = [];
        let cells = [];

        if (pos === 'RB') {
          headers = ['Att', 'Yds', 'YPC', 'TD', 'Rec', 'RecYds', 'RecTD', 'PFF', 'Rush'];
          cells = [
            s.rush_attempts, s.rush_yards, ypc(s.rush_yards, s.rush_attempts),
            s.rush_tds, s.receptions, s.rec_yards, s.rec_tds,
            pff.offense_grade ? fmt1(pff.offense_grade) : null,
            pff.rush_grade ? fmt1(pff.rush_grade) : null,
          ];
        } else if (pos === 'WR' || pos === 'TE') {
          headers = ['Tgt', 'Rec', 'Yds', 'TD', 'Y/R', 'Ctch%', 'PFF', 'YPRR', 'aDOT'];
          const catchPct = s.targets ? `${((s.receptions / s.targets) * 100).toFixed(0)}%` : null;
          cells = [
            s.targets, s.receptions, s.rec_yards, s.rec_tds,
            ypr(s.rec_yards, s.receptions), catchPct,
            pff.receiving_grade ? fmt1(pff.receiving_grade) : null,
            pff.yprr ? fmt2(pff.yprr) : null,
            pff.avg_depth_of_target ? fmt1(pff.avg_depth_of_target) : null,
          ];
        } else if (pos === 'QB') {
          headers = ['Att', 'Cmp', 'Yds', 'TD', 'INT', 'RuYds', 'RuTD', 'PFF', 'YPA'];
          cells = [
            s.pass_attempts, s.pass_completions, s.pass_yards, s.pass_tds, s.interceptions,
            s.rush_yards, s.rush_tds,
            pff.passing_grade ? fmt1(pff.passing_grade) : null,
            pff.ypa ? fmt2(pff.ypa) : null,
          ];
        }

        const hasData = cells.some(v => v != null && v !== 0);
        if (!hasData) return null;

        return (
          <div key={s.year} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4 }}>
              {s.year} — {s.team || ''}{s.games ? ` (${s.games}g)` : ''}
            </div>
            <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
              <thead>
                <tr style={{ background: '#f3f4f6' }}>
                  {headers.map(h => (
                    <th key={h} style={{ padding: '3px 5px', textAlign: 'center', fontWeight: 600, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {cells.map((v, i) => (
                    <td key={i} style={{ padding: '3px 5px', textAlign: 'center', color: v != null ? '#111' : '#d1d5db', borderBottom: '1px solid #f3f4f6' }}>
                      {v ?? '—'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function PlayerPanel({ player, onClose }) {
  const posColor = POS_COLORS[player.position] || '#6b7280';
  const c = player.combine || {};

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 460, background: '#fff', height: '100%', overflowY: 'auto', boxShadow: '-4px 0 24px rgba(0,0,0,0.25)', padding: '20px 24px 40px' }}>

        <button onClick={onClose}
          style={{ float: 'right', background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>×</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ background: posColor, color: '#fff', fontWeight: 700, fontSize: 12, padding: '2px 8px', borderRadius: 4 }}>
            {player.position}
          </span>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{player.name}</h2>
        </div>
        <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>
          {player.team}{player.age ? ` · Age ${player.age}` : ''}
          {player.height_inches || player.weight_lbs
            ? ` · ${fmtHeight(player.height_inches)}${player.weight_lbs ? ` / ${player.weight_lbs} lbs` : ''}`
            : ''}
        </div>

        <StatSection title="Rankings">
          <KVTable rows={[
            ['Draft Pick', player.draft_capital],
            ['ADP', player.adp],
            ['ETR Rank', player.etr_rank],
            ['DLF Rank', player.dlf_rank],
            ['Sanderson Rank', player.sanderson_rank],
            ['Sanderson Tier', player.sanderson_tier ? `Tier ${player.sanderson_tier}${player.sanderson_tier_label ? ` — ${player.sanderson_tier_label}` : ''}` : null],
            ['ZAP Score', player.zap_score],
            ['ZAP Tier', player.lateround_zap_tier_label],
            ['LateRound Tier', player.lateround_overall_tier],
            ['Brugler Grade', player.brugler_grade],
            ['Waldman DOT', player.waldman_dot],
            ['Avg Rank', player.avg_rank],
          ]} />
        </StatSection>

        {(c.forty_time || c.vertical_jump || c.broad_jump || c.three_cone || c.shuttle || c.speed_score) && (
          <StatSection title="Athletic Testing">
            <KVTable rows={[
              ['40-yd Dash', c.forty_time],
              ['Vertical', c.vertical_jump ? `${c.vertical_jump}"` : null],
              ['Broad Jump', c.broad_jump ? `${c.broad_jump}"` : null],
              ['3-Cone', c.three_cone],
              ['Shuttle', c.shuttle],
              ['Speed Score', c.speed_score?.toFixed(1)],
              ['Bench Press', c.bench_press],
            ]} />
          </StatSection>
        )}

        {player.seasons && player.seasons.length > 0 && (
          <StatSection title="College Stats">
            <SeasonStats player={player} />
          </StatSection>
        )}

        {player.brugler_summary && (
          <StatSection title="The Beast Summary">
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, fontStyle: 'italic' }}>
              {player.brugler_summary}
            </div>
          </StatSection>
        )}

        {player.elevator_pitch && (
          <StatSection title="Waldman — Elevator Pitch">
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
              {player.elevator_pitch}
            </div>
          </StatSection>
        )}

        {player.pre_draft_advice && (
          <StatSection title="Waldman — Pre-Draft Fantasy Advice">
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
              {player.pre_draft_advice}
            </div>
          </StatSection>
        )}

        {player.lateround_profile && (
          <StatSection title="LateRound Analysis">
            {player.lateround_profile.split('\n\n').map((para, i) => (
              <p key={i} style={{ fontSize: 13, color: '#374151', lineHeight: 1.65, margin: '0 0 10px' }}>
                {para}
              </p>
            ))}
          </StatSection>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const players = prospectsRaw.players;
  const prospectsById = Object.fromEntries(players.map(p => [p.id, p]));

  const [boardState, setBoardState] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  // League state
  const [leagueState, setLeagueState] = useState(() => loadLeagueState());
  const [showLeagueSetup, setShowLeagueSetup] = useState(false);
  const [editingLeague, setEditingLeague] = useState(null);
  const [showMyTeam, setShowMyTeam] = useState(false);

  const activeLeague = leagueState.activeId ? leagueState.leagues[leagueState.activeId] : null;

  function updateLeagueState(next) {
    setLeagueState(next);
    saveLeagueState(next);
  }

  function handleCreateLeague({ name, myTeam, teams }) {
    const league = makeLeague(name, myTeam, teams);
    const next = {
      leagues: { ...leagueState.leagues, [league.id]: league },
      activeId: league.id,
    };
    updateLeagueState(next);
    setShowLeagueSetup(false);
    setEditingLeague(null);
  }

  function handleEditLeague({ name, myTeam, teams }) {
    const league = { ...editingLeague, name, myTeam, teams };
    const next = {
      ...leagueState,
      leagues: { ...leagueState.leagues, [league.id]: league },
    };
    updateLeagueState(next);
    setShowLeagueSetup(false);
    setEditingLeague(null);
  }

  function handleSelectLeague(id) {
    updateLeagueState({ ...leagueState, activeId: id || null });
  }

  function handleDeleteLeague(id) {
    const { [id]: _, ...rest } = leagueState.leagues;
    const nextActive = Object.keys(rest)[0] || null;
    updateLeagueState({ leagues: rest, activeId: nextActive });
  }

  function handleMarkDrafted(playerId, teamName) {
    if (!activeLeague) return;
    const league = { ...activeLeague, picks: { ...activeLeague.picks, [playerId]: teamName } };
    updateLeagueState({ ...leagueState, leagues: { ...leagueState.leagues, [league.id]: league } });
  }

  function handleClearDrafted(playerId) {
    if (!activeLeague) return;
    const { [playerId]: _, ...rest } = activeLeague.picks;
    const league = { ...activeLeague, picks: rest };
    updateLeagueState({ ...leagueState, leagues: { ...leagueState.leagues, [league.id]: league } });
  }

  function handleUpdateNeeds(teamName, needs) {
    if (!activeLeague) return;
    const league = { ...activeLeague, teamNeeds: { ...activeLeague.teamNeeds, [teamName]: needs } };
    updateLeagueState({ ...leagueState, leagues: { ...leagueState.leagues, [league.id]: league } });
  }

  useEffect(() => {
    let saved = loadBoardState();
    if (saved) {
      saved = migrateState(saved, players);
    }

    if (saved && saved.items && saved.items.length > 0) {
      // Add any new players from prospects.json not yet in saved state
      const savedPlayerIds = new Set(saved.items.filter(i => i.type === 'player').map(i => i.id));
      const newPlayers = players.filter(p => !savedPlayerIds.has(p.id));
      const newItems = newPlayers.map(p => ({ type: 'player', id: p.id }));
      const merged = { ...saved, items: [...saved.items, ...newItems] };
      setBoardState(merged);
    } else {
      const items = buildDefaultItems(players);
      const def = { items, tierLabels: {}, targets: [], playerEdits: {} };
      setBoardState(def);
      saveBoardState(def);
    }
  }, []);

  if (!boardState) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1a1a2e', color: '#fff', fontSize: 18 }}>
        Loading Big Board...
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: '#f4f5f7', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <BigBoard
        initialState={boardState}
        prospectsData={players}
        onPlayerClick={setSelectedPlayer}
        league={activeLeague}
        allLeagues={leagueState.leagues}
        onSelectLeague={handleSelectLeague}
        onNewLeague={() => { setEditingLeague(null); setShowLeagueSetup(true); }}
        onEditLeague={() => { setEditingLeague(activeLeague); setShowLeagueSetup(true); }}
        onDeleteLeague={activeLeague ? () => handleDeleteLeague(activeLeague.id) : null}
        onMarkDrafted={handleMarkDrafted}
        onClearDrafted={handleClearDrafted}
        onShowMyTeam={() => setShowMyTeam(true)}
      />

      {selectedPlayer && (
        <PlayerPanel player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
      )}

      {showLeagueSetup && (
        <LeagueSetup
          existing={editingLeague}
          onSave={editingLeague ? handleEditLeague : handleCreateLeague}
          onClose={() => { setShowLeagueSetup(false); setEditingLeague(null); }}
        />
      )}

      {showMyTeam && activeLeague && (
        <MyTeamPanel
          league={activeLeague}
          prospectsById={prospectsById}
          onClose={() => setShowMyTeam(false)}
          onUpdateNeeds={handleUpdateNeeds}
          onUnmark={handleClearDrafted}
        />
      )}
    </div>
  );
}
