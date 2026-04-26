"""
Extract post-draft LateRound data from LateRoundProspectGuide26_PostDraft.pdf.

Extracts:
  - Superflex Top-48 rankings (page 173) → sf_rank, overall_tier, pos_rank
  - ZAP Model Rankings (page 176) → zap_score, zap_tier_label
  - Player profiles (pages 36-133) → nfl_team, zap_score, zap_tier_label, profile text

Outputs scripts/output/zap_postdraft.json
"""
import json, re, os
import pdfplumber

PDF_PATH = os.path.join(os.path.dirname(__file__), '..', 'src', 'LateRoundProspectGuide26_PostDraft.pdf')
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), 'output', 'zap_postdraft.json')

RISK_FONT = 'DharmaGothicE'
RISK_WORDS = {'Low', 'Neutral', 'High', 'Risk'}
GRAY_SC = (0.14, 0.12, 0.13)


def parse_risk(page) -> str | None:
    """
    Read the Draft Capital Delta risk indicator from a profile page.
    The ACTIVE risk level is rendered in gray stroke; inactive labels are black.
    Use x-position to distinguish 'Risk' appearing in both 'Low Risk' and 'High Risk'.

    Color mapping (gray stroke = selected):
      only Neutral gray (x≈476)          → 'Neutral'
      only High+Risk gray (x≈513,534)    → 'High Risk'
      only Low+Risk gray (x≈430,449)     → 'Low Risk'
      nothing gray                        → None  (UDFA / no indicator)
    """
    words = page.extract_words(extra_attrs=['stroking_color', 'fontname'])
    risk_row = [
        w for w in words
        if RISK_FONT in (w.get('fontname') or '')
        and w['text'] in RISK_WORDS
        and w['top'] < 200 and w['x0'] > 400
    ]

    low_gray    = any(w['x0'] < 470 and w.get('stroking_color') == GRAY_SC for w in risk_row)
    neutral_gray = any(470 <= w['x0'] < 507 and w.get('stroking_color') == GRAY_SC for w in risk_row)
    high_gray   = any(w['x0'] >= 507 and w.get('stroking_color') == GRAY_SC for w in risk_row)

    if neutral_gray and not low_gray and not high_gray:
        return 'Neutral'
    if high_gray and not low_gray and not neutral_gray:
        return 'High Risk'
    if low_gray and not neutral_gray and not high_gray:
        return 'Low Risk'
    return None


UNICODE_FIXES = str.maketrans({
    '‘': "'", '’': "'",
    '“': '"', '”': '"',
    '–': '-', '—': '-',
    '•': '•', '…': '...',
    'Δ': 'D',  # Delta
})

ZAP_TIER_LABELS = [
    'LEGENDARY PERFORMER', 'ELITE PRODUCER', 'WEEKLY STARTER',
    'FLEX PLAY', 'BENCHWARMER', 'WAIVER WIRE ADD', 'DART THROW',
]
ZAP_TIER_NUMS = {
    'LEGENDARY PERFORMER': 1, 'ELITE PRODUCER': 2, 'WEEKLY STARTER': 2,
    'FLEX PLAY': 3, 'BENCHWARMER': 4, 'WAIVER WIRE ADD': 5, 'DART THROW': 6,
}

TIER_RE = re.compile(
    r'\b(LEGENDARY PERFORMER|ELITE PRODUCER|WEEKLY STARTER|'
    r'FLEX PLAY|BENCHWARMER|WAIVER WIRE ADD|DART THROW)\b'
)

# ── Superflex rankings page ───────────────────────────────────────────────────

def parse_superflex(text):
    """
    Parse Superflex Top-48 table.
    Each row: {rank} {Name} {Pos} {PosRank} {Tier}
    Page has two columns side by side; text extraction interleaves them line by line.
    """
    results = {}
    entry_re = re.compile(
        r'\b(\d{1,2})\s+([A-Z][a-zA-Z\'\-\.]+(?:\s+[A-Z][a-zA-Z\'\-\.]+){0,3})'
        r'\s+(RB|WR|TE|QB)\s+(\d{1,2})\s+(\d{1,2})\b'
    )
    for m in entry_re.finditer(text):
        rank, name, pos, pos_rank, tier = m.groups()
        results[name.strip()] = {
            'lateround_sf_rank': int(rank),
            'lateround_overall_tier': int(tier),
            'pos_rank': int(pos_rank),
        }
    return results


# ── ZAP Model Rankings page ───────────────────────────────────────────────────

COL_BOUNDS = [0, 215, 415, 9999]  # RB | WR | TE x-boundaries

def parse_zap_page(page):
    """Coordinate-based parse of the 3-column ZAP rankings page."""
    words = page.extract_words(extra_attrs=['fontname', 'size'])
    columns = [[], [], []]
    for w in words:
        x = w['x0']
        if x < COL_BOUNDS[1]:
            col = 0
        elif x < COL_BOUNDS[2]:
            col = 1
        else:
            col = 2
        columns[col].append(w)

    for col in columns:
        col.sort(key=lambda w: w['top'])

    def words_to_lines(col_words):
        if not col_words:
            return []
        lines, current, prev_top = [], [], col_words[0]['top']
        for w in col_words:
            if abs(w['top'] - prev_top) > 4:
                lines.append(' '.join(c['text'] for c in current))
                current = []
            current.append(w)
            prev_top = w['top']
        if current:
            lines.append(' '.join(c['text'] for c in current))
        return lines

    entry_re = re.compile(
        r'\b(\d{1,2})\s+([A-Z][a-zA-Z\']+(?:\s+[A-Z][a-zA-Z\']+){0,3})\s+([\d.]+)\b'
    )

    results = {}
    for col_words in columns:
        lines = words_to_lines(col_words)
        current_tier_label = None
        for line in lines:
            t = TIER_RE.search(line)
            if t:
                current_tier_label = t.group(1)
            for rank, name, zap in entry_re.findall(line):
                zap_f = float(zap)
                if zap_f > 0 and len(name.split()) >= 2:
                    results[name.strip()] = {
                        'zap_score': zap_f,
                        'lateround_zap_tier_label': current_tier_label,
                        'lateround_zap_tier': ZAP_TIER_NUMS.get(current_tier_label, 6),
                    }
    return results


# ── Player profile pages ──────────────────────────────────────────────────────

# Matches the player header line: "Name • POS" or "Name - POS"
PLAYER_HEADER_RE = re.compile(
    r'^([A-Z][a-zA-Z\'\.\-]+(?:\s+[A-Z][a-zA-Z\'\.\-]+){0,4})\s+[•\-]\s+(WR|RB|TE|QB)\s*$',
    re.MULTILINE,
)
NFL_TEAM_RE = re.compile(r'NFL\s+Team:\s*([A-Za-z ]+?)(?:\s{2,}|$|\n)', re.IGNORECASE)
ZAP_SCORE_RE = re.compile(r'^(\d{1,3}\.\d)\s*$', re.MULTILINE)

SKIP_LINE_RE = re.compile(
    r'^(Written By:|ZAP Score|Y2 Score|Draft Capital|Statistical Comps?:|'
    r'Height:|Weight:|NFL Team:|Journey Comps?:|Low Risk|Neutral|High Risk|'
    r'Jump To:|Late-Round|aattee|RRoouunndd|\d+\.\d+$)',
    re.IGNORECASE,
)
NARRATIVE_START_RE = re.compile(r'^[A-Z][a-z]')


def extract_profile_text(raw):
    """Extract clean narrative from a profile page (the 'Update:' section)."""
    # Find "Update:" marker and take everything after it
    update_idx = raw.find('Update:')
    if update_idx != -1:
        narrative_raw = raw[update_idx + len('Update:'):].strip()
    else:
        # Fallback: strip header lines manually
        lines = raw.split('\n')
        narrative_lines = []
        past_header = False
        for line in lines:
            s = line.strip()
            if not s:
                if past_header:
                    narrative_lines.append('')
                continue
            if SKIP_LINE_RE.match(s):
                continue
            if PLAYER_HEADER_RE.search(s):
                past_header = True
                continue
            if not past_header:
                if NARRATIVE_START_RE.match(s) and len(s) > 45:
                    past_header = True
                else:
                    continue
            narrative_lines.append(s)
        narrative_raw = '\n'.join(narrative_lines)

    # Rebuild paragraphs
    lines = narrative_raw.split('\n')
    paragraphs, current = [], []
    for ln in lines:
        s = ln.strip()
        if not s:
            if current:
                paragraphs.append(' '.join(current))
                current = []
        else:
            current.append(s)
    if current:
        paragraphs.append(' '.join(current))

    paragraphs = [p for p in paragraphs if len(p) > 40]
    return '\n\n'.join(paragraphs) or None


def extract_profiles(pdf, start_page=35, end_page=132):
    """
    Extract per-player data from profile pages (0-indexed).
    Pages 35-132 = 2026 rookie profiles.
    """
    results = {}
    current_name = None
    current_data = {}
    current_text_lines = []

    def flush():
        nonlocal current_name, current_data, current_text_lines
        if current_name:
            raw = '\n'.join(current_text_lines)
            profile = extract_profile_text(raw)
            if profile:
                current_data['lateround_profile'] = profile
            if current_name in results:
                existing = results[current_name]
                merged = {**current_data, **{k: v for k, v in existing.items() if v is not None}}
                results[current_name] = merged
            else:
                results[current_name] = current_data
        current_name = None
        current_data = {}
        current_text_lines = []

    for i in range(start_page, end_page + 1):
        page = pdf.pages[i]
        raw = (page.extract_text() or '').translate(UNICODE_FIXES)

        m = PLAYER_HEADER_RE.search(raw)
        if m:
            flush()
            current_name = m.group(1).strip()
            current_data = {}
            current_text_lines = [raw]

            # ZAP score: first float on the page before player header
            pre = raw[:m.start()]
            zap_m = ZAP_SCORE_RE.search(pre)
            if zap_m:
                current_data['zap_score'] = float(zap_m.group(1))

            # ZAP tier label
            tier_m = TIER_RE.search(raw)
            if tier_m:
                current_data['lateround_zap_tier_label'] = tier_m.group(1)
                current_data['lateround_zap_tier'] = ZAP_TIER_NUMS.get(tier_m.group(1), 6)

            # NFL team
            nfl_m = NFL_TEAM_RE.search(raw)
            if nfl_m:
                current_data['nfl_team'] = nfl_m.group(1).strip()

            # Risk indicator (color-based)
            current_data['lateround_risk'] = parse_risk(page)
        elif current_name:
            current_text_lines.append(raw)

    flush()
    return results


# ── Master extract ────────────────────────────────────────────────────────────

def extract():
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    with pdfplumber.open(PDF_PATH) as pdf:
        total = len(pdf.pages)
        print(f"PDF has {total} pages")

        # Superflex rankings (page 173, 0-indexed 172)
        sf_text = (pdf.pages[172].extract_text() or '').translate(UNICODE_FIXES)
        sf_data = parse_superflex(sf_text)
        print(f"Superflex: {len(sf_data)} players")

        # ZAP Model Rankings (page 176, 0-indexed 175)
        zap_data = parse_zap_page(pdf.pages[175])
        print(f"ZAP Rankings: {len(zap_data)} players")

        # Player profiles (pages 36-133, 0-indexed 35-132)
        profiles = extract_profiles(pdf, start_page=35, end_page=132)
        print(f"Profiles: {len(profiles)} players")

    # Merge: sf_data + zap_data + profiles
    all_names = set(sf_data) | set(zap_data) | set(profiles)
    merged = {}
    for name in all_names:
        entry = {}
        if name in profiles:
            entry.update(profiles[name])
        if name in zap_data:
            entry.update(zap_data[name])     # ZAP page is authoritative for scores
        if name in sf_data:
            entry.update(sf_data[name])      # Rankings page is authoritative for ranks
        merged[name] = entry

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(merged, f, indent=2, ensure_ascii=False)
    print(f"\nWrote {len(merged)} entries to {OUTPUT_PATH}")

    print("\nSample (first 10):")
    for name, d in list(merged.items())[:10]:
        print(f"  {name}: sf_rank={d.get('lateround_sf_rank')}, zap={d.get('zap_score')}, "
              f"tier={d.get('lateround_zap_tier_label')}, nfl={d.get('nfl_team')}, "
              f"profile={'yes' if d.get('lateround_profile') else 'no'}")

    return merged


if __name__ == '__main__':
    extract()
