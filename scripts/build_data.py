"""
Master data pipeline: merges all sources into prospects.json for the React app.

Sources:
  - cfb-prospect-db (SQLite): player name, position, college team
  - Rookie Rankings.csv: ETR SF/TE Premium Rank, age
  - Dynasty Rookie Superflex Rankings CSV: DLF Rank
  - scripts/output/zap.json: ZAP Score, LateRound Overall Tier
  - scripts/output/sanderson.json: Jakob Sanderson Rank
  - scripts/output/waldman.json: Waldman DOT Score
  - scripts/output/adp.json: Dynasty Data Lab ADP

Output: app/src/data/prospects.json
"""
import json, re, os, sqlite3
import pandas as pd
from rapidfuzz import process, fuzz
from datetime import date, datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = r'C:\Users\Ozimek\Documents\Claude\FF\cfb-prospect-db\ff.db'
SRC = os.path.join(BASE, 'src')
OUT_DIR = os.path.join(BASE, 'scripts', 'output')
APP_DATA = os.path.join(BASE, 'app', 'src', 'data')

# ORBIT model — pre-draft: scores_2026_ridge.csv
# Post-draft: re-run score_class.py --year 2026 --post-draft to overwrite this file, then rebuild.
ORBIT_SCORES_PATH = r'C:\Users\Ozimek\Documents\Claude\FF\dynasty-prospect-model\output\scores\scores_2026_ridge.csv'

DRAFT_YEAR = 2026

# Name aliases: CSV/ranking name -> DB name
# Used when fuzzy matching fails due to nicknames, initials, or Jr./Sr. differences.
NAME_ALIASES = {
    'KC Concepcion': 'Kevin Concepcion',
    'Omar Cooper': 'Omar Cooper Jr.',
    'Omar Cooper Jr': 'Omar Cooper Jr.',
    'Nick Singleton': 'Nicholas Singleton',
    'Mike Washington': 'Michael Washington',
    'Mike Washington Jr': 'Michael Washington',
    'Mike Washington Jr.': 'Michael Washington',
    'Mike Washington Jr': 'Michael Washington',
    'Ja\'Kobi Lane': 'Jakobi Lane',
    'Chris Brazzell II': 'Chris Brazzell',
    'Chris Brazzell': 'Chris Brazzell',
    'Kevin Coleman Jr.': 'Kevin Coleman',
    'Kevin Coleman Jr': 'Kevin Coleman',
    'Robert Henry Jr.': 'Robert Henry Jr.',
    'J\'Mari Taylor': 'J\'Mari Taylor',
}

# DLF tier assignments derived from their PDF tier markers (tiers 1-7).
# Keyed by the DLF CSV display name. Preserved here so build_data.py rebuilds don't wipe them.
DLF_TIERS = {
    'Jeremiyah Love': 1,
    'Jordyn Tyson': 2, 'Carnell Tate': 2, 'Fernando Mendoza': 2, 'Makai Lemon': 2,
    'KC Concepcion': 3, 'Jadarian Price': 3, 'Kenyon Sadiq': 3, 'Omar Cooper Jr': 3, 'Ty Simpson': 3,
    'Denzel Boston': 4, 'Eli Stowers': 4, 'Germie Bernard': 4,
    'Jonah Coleman': 5, 'Chris Bell': 5, 'Antonio Williams': 5, "De'Zhaun Stribling": 5,
    'Zachariah Branch': 5, 'Chris Brazzell II': 5, 'Elijah Sarratt': 5, 'Ted Hurst': 5,
    'Carson Beck': 5, 'Max Klare': 5, 'Kaelon Black': 5, 'Drew Allar': 5, 'Malachi Fields': 5,
    'Nicholas Singleton': 6, "Ja'Kobi Lane": 6, 'Emmett Johnson': 6, 'Kaytron Allen': 6,
    'Mike Washington Jr': 6, 'Skyler Bell': 6, 'Demond Claiborne': 6, 'Bryce Lance': 6,
    'Adam Randall': 6, 'Brenen Thompson': 6, 'Taylen Green': 6, 'Justin Joly': 6,
    'Kevin Coleman Jr': 6,
    'Eli Raridon': 7, 'Oscar Delp': 7, 'Caleb Douglas': 7, 'Cade Klubnik': 7,
    'Zavion Thomas': 7, 'Seth McGowan': 7, 'Jack Endries': 7, 'Cyrus Allen': 7,
    'Deion Burks': 7, 'Jam Miller': 7, 'Garrett Nussmeier': 7,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def slugify(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def canonicalize(name: str) -> str:
    """Resolve any name alias to its canonical form for comparison purposes only."""
    return NAME_ALIASES.get(name, NAME_ALIASES.get(name.rstrip('.'), name))


def fuzzy_match(name: str, candidates: dict, threshold: int = 80):
    """Return the best matching key from candidates dict, or None."""
    if not candidates:
        return None
    keys = list(candidates.keys())
    result = process.extractOne(name, keys, scorer=fuzz.token_sort_ratio)
    if result and result[1] >= threshold:
        return result[0]
    return None


_ABBR_SUFFIXES = {'Jr', 'Jr.', 'II', 'III', 'IV', 'Sr', 'Sr.'}

def match_abbr_name(abbr: str, full_names: list) -> str | None:
    """Match an abbreviated name like 'J. Love' or 'O. Cooper Jr.' to a full name.
    Uses first initial + last name matching.
    """
    abbr = abbr.strip()
    dot_idx = abbr.find('.')
    if dot_idx < 0:
        return None
    initial = abbr[:dot_idx].strip().upper()
    rest = abbr[dot_idx + 1:].strip()
    rest_words = rest.split()
    last_words = [w.rstrip('.') for w in rest_words if w.rstrip('.') not in _ABBR_SUFFIXES]
    last_name = last_words[0].lower() if last_words else ''
    if not last_name:
        return None
    for full_name in full_names:
        parts = full_name.split()
        if not parts or parts[0][0].upper() != initial:
            continue
        nonsuffix = [p.rstrip('.') for p in parts if p.rstrip('.') not in _ABBR_SUFFIXES]
        fn_last = nonsuffix[-1].lower() if nonsuffix else parts[-1].lower()
        if fn_last == last_name:
            return full_name
    return None


def load_orbit() -> dict:
    """Load ORBIT scores from the dynasty-prospect-model CSV.
    Keys are DB canonical player names (same as players.full_name).
    Pre-draft: uses projected draft capital. Post-draft: re-run score_class.py --post-draft.
    """
    if not os.path.exists(ORBIT_SCORES_PATH):
        print(f"  WARNING: ORBIT scores not found at {ORBIT_SCORES_PATH}")
        return {}
    df = pd.read_csv(ORBIT_SCORES_PATH)
    result = {}
    for _, row in df.iterrows():
        result[str(row['player_name'])] = {
            'orbit_score': row.get('orbit_score') if not pd.isna(row.get('orbit_score', float('nan'))) else None,
            'projected_b2s': round(float(row['projected_b2s']), 2) if not pd.isna(row.get('projected_b2s', float('nan'))) else None,
            'b2s_lo80': round(float(row['b2s_lo80']), 2) if 'b2s_lo80' in row and not pd.isna(row.get('b2s_lo80', float('nan'))) else None,
            'b2s_hi80': round(float(row['b2s_hi80']), 2) if 'b2s_hi80' in row and not pd.isna(row.get('b2s_hi80', float('nan'))) else None,
            'post_draft': bool(row.get('post_draft', False)),
        }
    return result


def load_json(path: str) -> dict:
    if not os.path.exists(path):
        print(f"  WARNING: {path} not found — skipping")
        return {}
    with open(path, encoding='utf-8') as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Data loaders
# ---------------------------------------------------------------------------

def load_etr() -> pd.DataFrame:
    path = os.path.join(SRC, 'RookieRankingsETR_PostDraft.csv')
    df = pd.read_csv(path)
    df = df[['Player', 'Age', 'SF/TE Premium Rank', 'Notes']].dropna(subset=['Player'])
    df.columns = ['name', 'age', 'etr_rank', 'etr_notes']
    df['etr_rank'] = pd.to_numeric(df['etr_rank'], errors='coerce')
    df['etr_notes'] = df['etr_notes'].where(df['etr_notes'].notna(), None)
    return df


def load_dlf() -> pd.DataFrame:
    path = os.path.join(SRC, 'Dynasty Rookie Superflex Rankings-3-27-2026-2111.csv')
    df = pd.read_csv(path)
    df = df[['Name', 'Rank', 'Age']].dropna(subset=['Name'])
    df.columns = ['name', 'dlf_rank', 'dlf_age']
    df['dlf_rank'] = pd.to_numeric(df['dlf_rank'], errors='coerce')
    return df


def load_db_players() -> dict:
    """Returns dict: {full_name: {position, team, height_inches, weight_lbs, combine, seasons}}"""
    conn = sqlite3.connect(DB_PATH)

    # Base player info
    query = """
        SELECT p.full_name, p.position, p.height_inches, p.weight_lbs,
               s.team, s.season_year
        FROM players p
        JOIN cfb_player_seasons s ON p.id = s.player_id
        WHERE p.position IN ('QB','RB','WR','TE')
          AND s.season_year >= 2024
        ORDER BY s.season_year DESC
    """
    rows = conn.execute(query).fetchall()

    players = {}
    for name, pos, team, yr, *_ in [(r[0],r[1],r[4],r[5],r[2],r[3]) for r in rows]:
        if name not in players:
            players[name] = {'position': pos, 'team': team or ''}
    for name, pos, height_in, weight_lb, team, yr in [(r[0],r[1],r[2],r[3],r[4],r[5]) for r in rows]:
        if name in players and 'height_inches' not in players[name]:
            players[name]['height_inches'] = height_in
            players[name]['weight_lbs'] = weight_lb

    # NFL draft picks (populated after draft day; empty pre-draft)
    draft_pick_rows = conn.execute(f"""
        SELECT p.full_name, d.draft_round, d.pick_within_round, d.overall_pick, d.nfl_team
        FROM players p
        JOIN nfl_draft_picks d ON p.id = d.player_id
        WHERE d.draft_year = {DRAFT_YEAR}
    """).fetchall()
    for name, rnd, within_rnd, overall_pick, nfl_team in draft_pick_rows:
        if name in players:
            pick_num = within_rnd if within_rnd is not None else overall_pick
            players[name]['draft_capital'] = f"{rnd}.{pick_num:02d}"
            players[name]['nfl_team'] = nfl_team

    # Combine results
    combine_rows = conn.execute("""
        SELECT p.full_name, c.forty_time, c.vertical_jump, c.broad_jump,
               c.three_cone, c.shuttle, c.bench_press, c.speed_score
        FROM players p
        JOIN nfl_combine_results c ON p.id = c.player_id
        WHERE p.position IN ('QB','RB','WR','TE')
    """).fetchall()
    for name, forty, vert, broad, cone, shuttle, bench, speed in combine_rows:
        if name in players:
            players[name]['combine'] = {
                'forty_time': forty, 'vertical_jump': vert,
                'broad_jump': broad, 'three_cone': cone,
                'shuttle': shuttle, 'bench_press': bench,
                'speed_score': round(speed, 1) if speed else None,
            }

    # College seasons (last 3 for stats context)
    season_rows = conn.execute("""
        SELECT p.full_name, s.season_year, s.team, s.games_played,
               s.pass_completions, s.pass_attempts, s.pass_yards, s.pass_tds, s.interceptions,
               s.rush_attempts, s.rush_yards, s.rush_tds,
               s.targets, s.receptions, s.rec_yards, s.rec_tds,
               s.dominator_rating, s.reception_share
        FROM players p
        JOIN cfb_player_seasons s ON p.id = s.player_id
        WHERE p.position IN ('QB','RB','WR','TE')
          AND s.season_year >= 2023
        ORDER BY p.full_name, s.season_year DESC
    """).fetchall()
    # PFF seasons
    pff_rows = conn.execute("""
        SELECT p.full_name, pf.season_year, pf.receiving_grade, pf.route_grade,
               pf.yprr, pf.catch_rate, pf.avg_depth_of_target, pf.drop_rate,
               pf.offense_grade, pf.rush_grade, pf.elusive_rating,
               pf.targets, pf.receptions, pf.rec_yards, pf.yards_after_catch
        FROM players p
        JOIN pff_player_seasons pf ON p.id = pf.player_id
        WHERE p.position IN ('RB','WR','TE')
          AND pf.season_year >= 2023
        ORDER BY p.full_name, pf.season_year DESC
    """).fetchall()
    pff_qb_rows = conn.execute("""
        SELECT pq.player_name, pq.season_year, pq.passing_grade, pq.completion_percent,
               pq.btt_rate, pq.twp_rate, pq.avg_depth_of_target, pq.avg_time_to_throw, pq.ypa
        FROM pff_qb_seasons pq
        WHERE pq.season_year >= 2023
        ORDER BY pq.player_name, pq.season_year DESC
    """).fetchall()
    conn.close()

    # Build seasons dict: {name: [{year, stats...}]}
    seasons_by_name = {}
    for row in season_rows:
        name, yr, team, gp, pc, pa, py, ptd, ints, ra, ry, rtd, tgt, rec, recy, rectd, dom, rec_share = row
        entry = {'year': yr, 'team': team, 'games': gp,
                 'pass_completions': pc, 'pass_attempts': pa, 'pass_yards': py,
                 'pass_tds': ptd, 'interceptions': ints,
                 'rush_attempts': ra, 'rush_yards': ry, 'rush_tds': rtd,
                 'targets': tgt, 'receptions': rec, 'rec_yards': recy, 'rec_tds': rectd,
                 'dominator_rating': round(dom * 100, 1) if dom else None,
                 'reception_share': round(rec_share * 100, 1) if rec_share else None}
        seasons_by_name.setdefault(name, []).append(entry)

    # Merge PFF into seasons
    pff_by_name = {}
    for row in pff_rows:
        name, yr, recv_g, route_g, yprr, catch_r, adot, drop_r, off_g, rush_g, elusive, tgt, rec, recy, yac = row
        pff_by_name.setdefault(name, {})[yr] = {
            'receiving_grade': recv_g, 'route_grade': route_g, 'yprr': yprr,
            'catch_rate': round(catch_r * 100, 1) if catch_r else None,
            'avg_depth_of_target': adot, 'drop_rate': round(drop_r * 100, 1) if drop_r else None,
            'offense_grade': off_g, 'rush_grade': rush_g, 'elusive_rating': elusive,
        }
    pff_qb_by_name = {}
    for row in pff_qb_rows:
        name, yr, pass_g, cmp_pct, btt, twp, adot, ttt, ypa = row
        pff_qb_by_name.setdefault(name, {})[yr] = {
            'passing_grade': pass_g, 'completion_percent': round(cmp_pct * 100, 1) if cmp_pct else None,
            'btt_rate': round(btt * 100, 1) if btt else None,
            'twp_rate': round(twp * 100, 1) if twp else None,
            'avg_depth_of_target': adot, 'avg_time_to_throw': ttt, 'ypa': ypa,
        }

    for name in players:
        if name in seasons_by_name:
            seasons = seasons_by_name[name]
            for s in seasons:
                yr = s['year']
                if name in pff_by_name and yr in pff_by_name[name]:
                    s['pff'] = pff_by_name[name][yr]
                elif name in pff_qb_by_name and yr in pff_qb_by_name[name]:
                    s['pff'] = pff_qb_by_name[name][yr]
            players[name]['seasons'] = seasons[:3]  # most recent 3

    return players


# ---------------------------------------------------------------------------
# Main build
# ---------------------------------------------------------------------------

def build():
    os.makedirs(APP_DATA, exist_ok=True)

    print("Loading data sources...")
    etr_df = load_etr()
    dlf_df = load_dlf()
    db_players = load_db_players()
    zap_data = load_json(os.path.join(OUT_DIR, 'zap_postdraft.json'))
    sanderson_data = load_json(os.path.join(OUT_DIR, 'sanderson_postdraft.json'))
    sanderson_xlsx_data = load_json(os.path.join(OUT_DIR, 'sanderson_xlsx.json'))
    legendary_data = load_json(os.path.join(OUT_DIR, 'legendary.json'))
    waldman_data = load_json(os.path.join(OUT_DIR, 'waldman.json'))
    waldman_cheat_data = load_json(os.path.join(OUT_DIR, 'waldman_cheatsheet.json'))
    adp_data = load_json(os.path.join(OUT_DIR, 'adp.json'))
    beast_data = load_json(os.path.join(OUT_DIR, 'beast.json'))
    breakout_raw = load_json(os.path.join(SRC, 'breakout_scores.json'))
    orbit_data = load_orbit()
    # Flatten WR/RB dicts into single lookup
    breakout_flat = {**breakout_raw.get('WR', {}), **breakout_raw.get('RB', {})}

    print(f"  ETR: {len(etr_df)} players")
    print(f"  DLF: {len(dlf_df)} players")
    print(f"  DB:  {len(db_players)} players")
    print(f"  ZAP: {len(zap_data)} players")
    print(f"  Sanderson PDF: {len(sanderson_data)} players")
    print(f"  Sanderson XLSX: {len(sanderson_xlsx_data)} players")
    print(f"  Legendary: {len(legendary_data)} players")
    print(f"  Waldman: {len(waldman_data)} players")
    print(f"  Waldman Cheat: {len(waldman_cheat_data)} players")
    print(f"  ADP: {len(adp_data)} players")
    print(f"  Beast: {len(beast_data)} players")
    print(f"  Breakout: {len(breakout_flat)} players")
    print(f"  ORBIT: {len(orbit_data)} players (post_draft={any(v['post_draft'] for v in orbit_data.values())})")

    # Use ETR as the primary name list (most complete for SF).
    # Dedup against DLF by comparing canonical forms (via NAME_ALIASES) so that
    # "KC Concepcion"/"Kevin Concepcion", "Nick Singleton"/"Nicholas Singleton", etc.
    # are treated as the same player without changing any display names or slug IDs.
    base_names = list(etr_df['name'])
    canonical_set = {canonicalize(n) for n in base_names}
    etr_name_lookup = {n: n for n in base_names}
    for n in dlf_df['name']:
        if canonicalize(n) in canonical_set:
            continue  # already covered by canonical equivalence
        match = fuzzy_match(n, etr_name_lookup, threshold=85)
        if not match:
            base_names.append(n)
            canonical_set.add(canonicalize(n))
            etr_name_lookup[n] = n

    print(f"\nBuilding prospect list ({len(base_names)} base names)...")

    # Pre-compute candidate lists for fuzzy matching
    breakout_keys = list(breakout_flat.keys())
    zap_keys = list(zap_data.keys())
    sanderson_keys = list(sanderson_data.keys())
    legendary_keys = list(legendary_data.keys())
    waldman_keys = list(waldman_data.keys())
    waldman_cheat_keys = list(waldman_cheat_data.keys())
    adp_keys = list(adp_data.keys())
    beast_keys = list(beast_data.keys())
    db_keys = list(db_players.keys())

    # Pre-resolve Sanderson XLSX abbreviated names → full prospect names
    # e.g. "J. Love" → "Jeremiyah Love", "O. Cooper Jr." → "Omar Cooper Jr."
    sanderson_xlsx_by_fullname = {}
    for abbr, entry in sanderson_xlsx_data.items():
        full = match_abbr_name(abbr, base_names)
        if full:
            sanderson_xlsx_by_fullname[full] = entry
        else:
            # Fallback: try fuzzy match of abbreviated last name against base_names
            fm = fuzzy_match(abbr, {n: n for n in base_names}, threshold=70)
            if fm:
                sanderson_xlsx_by_fullname[fm] = entry

    # Canonical → original DLF name lookup so "KC Concepcion" finds "Kevin Concepcion" in DLF, etc.
    dlf_canonical_lookup = {canonicalize(n): n for n in dlf_df['name']}

    prospects = []

    for name in base_names:
        # --- ETR data ---
        etr_row = etr_df[etr_df['name'] == name]
        etr_rank = int(etr_row['etr_rank'].iloc[0]) if not etr_row.empty and not pd.isna(etr_row['etr_rank'].iloc[0]) else None
        age = float(etr_row['age'].iloc[0]) if not etr_row.empty and not pd.isna(etr_row['age'].iloc[0]) else None
        etr_notes = etr_row['etr_notes'].iloc[0] if not etr_row.empty and etr_row['etr_notes'].iloc[0] is not None else None

        # --- DLF data — try canonical alias first, fall back to fuzzy ---
        dlf_match = dlf_canonical_lookup.get(canonicalize(name)) or fuzzy_match(name, {n: n for n in dlf_df['name']}, threshold=85)
        dlf_rank = None
        dlf_tier = None
        if dlf_match:
            dlf_row = dlf_df[dlf_df['name'] == dlf_match]
            if not dlf_row.empty:
                dlf_rank = int(dlf_row['dlf_rank'].iloc[0]) if not pd.isna(dlf_row['dlf_rank'].iloc[0]) else None
                if age is None:
                    try:
                        age = float(dlf_row['dlf_age'].iloc[0])
                    except (ValueError, TypeError):
                        pass
            dlf_tier = DLF_TIERS.get(dlf_match)

        # --- DB data (position, team) ---
        db_lookup_name = NAME_ALIASES.get(name, name)
        db_match = db_lookup_name if db_lookup_name in db_players else fuzzy_match(name, {n: n for n in db_keys}, threshold=85)
        position = None
        team = None
        height_inches = None
        weight_lbs = None
        combine = None
        seasons = None
        if db_match:
            db = db_players[db_match]
            position = db['position']
            team = db['team']
            height_inches = db.get('height_inches')
            weight_lbs = db.get('weight_lbs')
            combine = db.get('combine')
            seasons = db.get('seasons')

        # --- ZAP data (post-draft) ---
        zap_match_key = fuzzy_match(name, {n: n for n in zap_keys}, threshold=80)
        zap_score = None
        lateround_overall_tier = None
        lateround_sf_rank = None
        lateround_zap_tier_label = None
        lateround_profile = None
        lateround_risk = None
        pos_rank = None
        nfl_team_lr = None  # NFL team from LateRound PDF
        if zap_match_key:
            zd = zap_data[zap_match_key]
            zap_score = zd.get('zap_score')
            lateround_overall_tier = zd.get('lateround_overall_tier') or zd.get('lateround_zap_tier')
            lateround_sf_rank = zd.get('lateround_sf_rank')
            lateround_zap_tier_label = zd.get('lateround_zap_tier_label')
            lateround_profile = zd.get('lateround_profile')
            lateround_risk = zd.get('lateround_risk')
            pos_rank = zd.get('pos_rank')
            nfl_team_lr = zd.get('nfl_team')
            if position is None:
                position = zd.get('position')

        # --- Sanderson data (PDF: tier + tier_label) ---
        sand_match_key = fuzzy_match(name, {n: n for n in sanderson_keys}, threshold=80)
        sanderson_rank = None
        sanderson_tier = None
        sanderson_tier_label = None
        if sand_match_key:
            sd = sanderson_data[sand_match_key]
            sanderson_rank = sd.get('sanderson_rank')   # PDF rank (fallback)
            sanderson_tier = sd.get('sanderson_tier')
            sanderson_tier_label = sd.get('sanderson_tier_label')
            if position is None:
                pos_slot = sd.get('position_slot', '')
                pos_letters = re.match(r'([A-Z]+)', pos_slot)
                if pos_letters:
                    position = pos_letters.group(1)

        # --- Sanderson XLSX market-adj rank + exposure (overrides PDF rank) ---
        sanderson_exposure = None
        xlsx_entry = sanderson_xlsx_by_fullname.get(name)
        if xlsx_entry:
            mkt_rank = xlsx_entry.get('sanderson_mkt_rank')
            if mkt_rank is not None:
                sanderson_rank = mkt_rank   # XLSX market-adj rank takes priority
            sanderson_exposure = xlsx_entry.get('sanderson_exposure')

        # --- Legendary Upside rank + tier ---
        leg_match_key = fuzzy_match(name, {n: n for n in legendary_keys}, threshold=80)
        legendary_rank = None
        legendary_tier = None
        legendary_pos_rank = None
        if leg_match_key:
            ld = legendary_data[leg_match_key]
            legendary_rank = ld.get('legendary_sf_rank')
            legendary_tier = ld.get('legendary_tier')
            legendary_pos_rank = ld.get('legendary_pos_rank')

        # --- Waldman data ---
        # Waldman keys are usually "POS Name" (e.g. "RB Nicholas Singleton").
        # Strip position prefix only when first word is a known position.
        _POS = {'RB', 'WR', 'QB', 'TE'}
        _waldman_name_map = {
            (' '.join(k.split()[1:]) if k.split()[0] in _POS else k): k
            for k in waldman_keys
        }
        _search_name = canonicalize(name)  # resolve nicknames (Nick → Nicholas)
        wald_name_hit = fuzzy_match(_search_name, _waldman_name_map, threshold=82) or \
                        fuzzy_match(name, _waldman_name_map, threshold=82)
        wald_match_key = _waldman_name_map.get(wald_name_hit) if wald_name_hit else None
        waldman_dot = None
        elevator_pitch = None
        pre_draft_advice = None
        if wald_match_key:
            wd = waldman_data[wald_match_key]
            waldman_dot = wd.get('waldman_dot_score')
            elevator_pitch = wd.get('elevator_pitch')
            pre_draft_advice = wd.get('pre_draft_advice')
            if position is None:
                position = wd.get('waldman_position')

        # --- Waldman Cheat Sheet rank + tier ---
        wc_match_key = fuzzy_match(name, {n: n for n in waldman_cheat_keys}, threshold=82)
        waldman_cheat_rank = None
        waldman_cheat_tier = None
        if wc_match_key:
            wcd = waldman_cheat_data[wc_match_key]
            waldman_cheat_rank = wcd.get('waldman_cheat_rank')
            waldman_cheat_tier = wcd.get('waldman_cheat_tier')

        # --- ADP data ---
        adp_match_key = fuzzy_match(name, {n: n for n in adp_keys}, threshold=80)
        adp = None
        if adp_match_key:
            adp = adp_data[adp_match_key].get('adp')

        # --- Beast (Brugler) data ---
        beast_match_key = fuzzy_match(name, {n: n for n in beast_keys}, threshold=80)
        brugler_grade = None
        brugler_summary = None
        if beast_match_key:
            bd = beast_data[beast_match_key]
            brugler_grade = bd.get('brugler_grade')
            brugler_summary = bd.get('brugler_summary')

        # --- Breakout Finder score (RB/WR only) ---
        breakout_score = None
        bo_match_key = fuzzy_match(name, {n: n for n in breakout_keys}, threshold=82)
        if bo_match_key:
            breakout_score = breakout_flat[bo_match_key]

        # --- ORBIT score (keyed by DB canonical name = db_match) ---
        orbit_score = None
        projected_b2s = None
        b2s_lo80 = None
        b2s_hi80 = None
        if db_match and db_match in orbit_data:
            od = orbit_data[db_match]
            orbit_score = od.get('orbit_score')
            projected_b2s = od.get('projected_b2s')
            b2s_lo80 = od.get('b2s_lo80')
            b2s_hi80 = od.get('b2s_hi80')

        # --- Position overrides (manual corrections for DB errors) ---
        POSITION_OVERRIDES = {
            'mike washington': 'RB', 'michael washington': 'RB',
            'jam miller': 'RB', 'eli heidenreich': 'RB',
        }
        import re as _re
        name_key = _re.sub(r'[^a-z ]', '', name.lower()).strip()
        if name_key in POSITION_OVERRIDES:
            position = POSITION_OVERRIDES[name_key]

        # --- Compute Avg Rank from available consensus ranks ---
        rank_sources = [r for r in [etr_rank, dlf_rank, sanderson_rank, lateround_sf_rank, legendary_rank] if r is not None]
        avg_rank = round(sum(rank_sources) / len(rank_sources), 2) if rank_sources else None

        # NFL team: prefer DB (most authoritative post-draft), fall back to LateRound PDF
        db_nfl_team = db_players[db_match].get('nfl_team') if db_match else None
        nfl_team = db_nfl_team or nfl_team_lr

        prospect = {
            'id': slugify(name),
            'name': name,
            'team': team or '',           # college team (unchanged)
            'nfl_team': nfl_team or '',   # NFL team (post-draft)
            'age': round(age, 1) if age is not None else None,
            'position': position or '',
            'pos_rank': pos_rank,
            'height_inches': height_inches,
            'weight_lbs': weight_lbs,
            'combine': combine,
            'seasons': seasons,
            'draft_capital': db_players[db_match].get('draft_capital') if db_match else None,
            'adp': adp,
            'adp_delta': None,  # calculated client-side
            'breakout_score': breakout_score,
            'orbit_score': round(orbit_score, 1) if orbit_score is not None else None,
            'projected_b2s': projected_b2s,
            'b2s_lo80': b2s_lo80,
            'b2s_hi80': b2s_hi80,
            'zap_score': zap_score,
            'lateround_sf_rank': lateround_sf_rank,
            'lateround_overall_tier': lateround_overall_tier,
            'lateround_zap_tier_label': lateround_zap_tier_label,
            'lateround_profile': lateround_profile,
            'lateround_risk': lateround_risk,
            'etr_rank': etr_rank,
            'etr_notes': etr_notes,
            'dlf_rank': dlf_rank,
            'dlf_tier': dlf_tier,
            'sanderson_rank': sanderson_rank,
            'sanderson_tier': sanderson_tier,
            'sanderson_tier_label': sanderson_tier_label,
            'sanderson_exposure': sanderson_exposure,
            'legendary_rank': legendary_rank,
            'legendary_tier': legendary_tier,
            'legendary_pos_rank': legendary_pos_rank,
            'waldman_dot': waldman_dot,
            'waldman_cheat_tier': waldman_cheat_tier,
            'elevator_pitch': elevator_pitch,
            'pre_draft_advice': pre_draft_advice,
            'brugler_grade': brugler_grade,
            'brugler_summary': brugler_summary,
            'larky_rank': None,
            'waldman_rank': waldman_cheat_rank,
            'exposure': None,
            'avg_rank': avg_rank,
            'avg_rank_delta': None,  # calculated client-side
        }
        prospects.append(prospect)

    # Sort by avg_rank (ascending), nulls last
    prospects.sort(key=lambda p: (p['avg_rank'] is None, p['avg_rank'] or 9999))

    output = {'players': prospects, 'generated_at': datetime.now().isoformat()}
    out_path = os.path.join(APP_DATA, 'prospects.json')
    with open(out_path, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\nWrote {len(prospects)} prospects to {out_path}")
    print("\nTop 10:")
    for i, p in enumerate(prospects[:10], 1):
        print(f"  {i:2d}. {p['name']:<25} {p['position']:<3} ETR={p['etr_rank']} DLF={p['dlf_rank']} Sand={p['sanderson_rank']} AvgRank={p['avg_rank']}")

    return prospects


if __name__ == '__main__':
    build()
