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

export function makeLeague(name, myTeam, teamNames) {
  return {
    id: Date.now().toString(),
    name,
    myTeam,           // which of the 12 team names is mine
    teams: teamNames, // array of 12 names
    teamNeeds: {},    // { teamName: string }
    picks: {},        // { playerId: teamName }
  };
}
