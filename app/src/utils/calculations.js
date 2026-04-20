// Live calculations for ADP delta, avg rank, avg rank delta

const RANK_FIELDS = ['etr_rank', 'dlf_rank', 'sanderson_rank', 'larky_rank', 'waldman_rank'];

export function calcAvgRank(player) {
  const vals = RANK_FIELDS.map(f => player[f]).filter(v => v != null && !isNaN(v));
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

export function calcADPDelta(myRank, adp) {
  if (myRank == null || adp == null) return null;
  return Math.round((myRank - adp) * 10) / 10;
}

export function calcAvgRankDelta(myRank, avgRank) {
  if (myRank == null || avgRank == null) return null;
  return Math.round((myRank - avgRank) * 10) / 10;
}

// Annotate each player with live-calculated fields given current order
export function annotateWithCalcs(players) {
  // First pass: positional rank counters
  const posCounters = {};
  const withRanks = players.map((p, idx) => {
    const myRank = idx + 1;
    const pos = p.position || '';
    posCounters[pos] = (posCounters[pos] || 0) + 1;
    const pos_rank = pos ? `${pos}${posCounters[pos]}` : null;
    const avg_rank = calcAvgRank(p);
    return {
      ...p,
      my_rank: myRank,
      pos_rank,
      avg_rank,
      adp_delta: calcADPDelta(myRank, p.adp),
      avg_rank_delta: calcAvgRankDelta(myRank, avg_rank),
    };
  });
  return withRanks;
}
