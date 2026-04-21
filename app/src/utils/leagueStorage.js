const KEY = 'dynasty_leagues';

export function loadLeagueState() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : { leagues: {}, activeId: null };
  } catch {
    return { leagues: {}, activeId: null };
  }
}

export function saveLeagueState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

// picks: { playerId: 'mine' | 'drafted' }
export function makeLeague(name) {
  return { id: Date.now().toString(), name, picks: {} };
}
