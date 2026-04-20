"""
Extract ZAP scores and LateRound tiers from LateRoundProspectGuide26_PreDraft.pdf.
Outputs scripts/output/zap.json
"""
import json, re, os
import pdfplumber

PDF_PATH = os.path.join(os.path.dirname(__file__), '..', 'src', 'LateRoundProspectGuide26_PreDraft.pdf')
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), 'output', 'zap.json')

# Tier label -> numeric tier mapping
ZAP_TIERS = {
    'LEGENDARY PERFORMER': 1,
    'ELITE PRODUCER': 2,
    'WEEKLY STARTER': 2,
    'FLEX PLAY': 3,
    'BENCHWARMER': 4,
    'WAIVER WIRE ADD': 5,
    'DART THROW': 6,
}


TIER_LABELS = [
    'LEGENDARY PERFORMER', 'ELITE PRODUCER', 'WEEKLY STARTER',
    'FLEX PLAY', 'BENCHWARMER', 'WAIVER WIRE ADD', 'DART THROW',
]

# Column x-boundaries for page 172 (RB | WR | TE)
# Determined from word x0 coordinates in the PDF
COL_BOUNDS = [0, 215, 380, 9999]  # [RB_start, WR_start, TE_start, end]


def parse_zap_page_words(page):
    """
    Coordinate-based parse of page 172 (3 columns).
    Assigns each word to its column by x0 position, then processes
    each column independently to correctly track tier labels.
    """
    words = page.extract_words(extra_attrs=['fontname', 'size'])
    # Group into 3 columns by x0
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

    # Sort each column by vertical position (top)
    for col in columns:
        col.sort(key=lambda w: w['top'])

    # Within each column, reconstruct lines by grouping words at similar y-positions
    def words_to_lines(col_words):
        if not col_words:
            return []
        lines = []
        current_line = []
        prev_top = col_words[0]['top']
        for w in col_words:
            if abs(w['top'] - prev_top) > 4:
                lines.append(' '.join(c['text'] for c in current_line))
                current_line = []
            current_line.append(w)
            prev_top = w['top']
        if current_line:
            lines.append(' '.join(c['text'] for c in current_line))
        return lines

    tier_re = re.compile(
        r'\b(LEGENDARY PERFORMER|ELITE PRODUCER|WEEKLY STARTER|'
        r'FLEX PLAY|BENCHWARMER|WAIVER WIRE ADD|DART THROW)\b'
    )
    entry_re = re.compile(
        r'\b(\d{1,2})\s+([A-Z][a-zA-Z\']+(?:\s+[A-Z][a-zA-Z\']+){0,3})\s+([\d.]+)\b'
    )

    results = {}
    for col_words in columns:
        lines = words_to_lines(col_words)
        current_tier_label = None
        for line in lines:
            t = tier_re.search(line)
            if t:
                current_tier_label = t.group(1)
            for rank, name, zap in entry_re.findall(line):
                zap = float(zap)
                if zap > 5 and len(name.split()) >= 2:
                    tier_num = ZAP_TIERS.get(current_tier_label, 6)
                    results[name.strip()] = {
                        'zap_score': zap,
                        'lateround_zap_tier': tier_num,
                        'lateround_zap_tier_label': current_tier_label,
                    }

    return results


def parse_zap_page(text):
    """Fallback text-based parser (unused if page object available)."""
    return {}


def parse_superflex_page(text):
    """
    Parse page 171 (Superflex Top-48) for LateRound Overall Tier.
    Format: {rank} {Player} {Pos} {Pos_Rank} {Tier}
    """
    results = {}
    # Pattern: number, name (words), position (2-3 chars), pos rank (number), tier (number)
    entry_pattern = re.compile(
        r'\b(\d{1,2})\s+([A-Z][a-zA-Z\']+(?:[\s][A-Z][a-zA-Z\']+){0,3})\s+(RB|WR|TE|QB)\s+(\d{1,2})\s+(\d{1,2})\b'
    )
    for match in entry_pattern.finditer(text):
        rank, name, pos, pos_rank, tier = match.groups()
        results[name.strip()] = {
            'lateround_sf_rank': int(rank),
            'lateround_overall_tier': int(tier),
            'position': pos,
        }
    return results


PLAYER_HEADER = re.compile(
    r'^([A-Z][a-zA-Z\'.]+(?:\s+[A-Z][a-zA-Z\']+)*)\s+[•·]\s+(WR|RB|TE|QB)',
    re.MULTILINE,
)
# Lines to skip before narrative text starts
# Patterns that identify non-narrative header lines
HEADER_LINE = re.compile(
    r'^(Written By:|ZAP Score|Draft Capital|Statistical Comps?:|Height:|Weight:|NFL Team:'
    r'|Y2 Score|Journey Comps?:|Late-Round Fantasy|Jump To:|LL|aattee|RRoouunndd'
    r'|\d+\.\d+$)',
)
# A line containing a tier label keyword — used to skip the "[COLLEGE] [TIER] [Risk]" line
TIER_KEYWORD = re.compile(
    r'\b(LEGENDARY PERFORMER|ELITE PRODUCER|WEEKLY STARTER|FLEX PLAY|'
    r'BENCHWARMER|WAIVER WIRE ADD|DART THROW)\b'
)
# A narrative line: starts with an uppercase letter, has enough lowercase content
NARRATIVE_LINE = re.compile(r'^[A-Z][a-z]')


def extract_profile_text(raw):
    """
    Return clean narrative text from a player profile page.
    - Strips header lines (college, tier, comps, height, etc.)
    - Joins soft line-breaks (mid-sentence wraps) back into full sentences
    - Preserves paragraph breaks (blank lines between paragraphs)
    - Strips footer artifacts (page number, repeated title)
    """
    lines = raw.split('\n')
    narrative = []
    past_header = False

    for line in lines:
        s = line.strip()
        if not s:
            if past_header and narrative and narrative[-1] != '':
                narrative.append('')
            continue

        # Always skip known header/footer patterns
        if HEADER_LINE.match(s):
            continue
        # Skip the "[COLLEGE] [TIER_LABEL] [Risk]" combined line
        if TIER_KEYWORD.search(s):
            continue
        # Skip the player name+position line
        if PLAYER_HEADER.search(s):
            past_header = True
            continue
        # Skip short non-sentence lines before narrative starts
        if not past_header:
            if NARRATIVE_LINE.match(s) and len(s) > 45:
                past_header = True
            else:
                continue

        narrative.append(s)

    # Rebuild: join consecutive non-blank lines (PDF soft wraps) into paragraphs
    paragraphs = []
    current = []
    for ln in narrative:
        if ln == '':
            if current:
                paragraphs.append(' '.join(current))
                current = []
        else:
            current.append(ln)
    if current:
        paragraphs.append(' '.join(current))

    # Filter out short footer-like paragraphs (page numbers, repeated title)
    paragraphs = [p for p in paragraphs if len(p) > 60 or (p and p[0].isupper() and '.' in p)]

    return '\n\n'.join(paragraphs) or None


def extract_profiles(pdf):
    """Extract narrative profile text for each player (pages 34-169)."""
    profiles = {}
    current_name = None
    current_text = []

    def flush():
        if current_name and current_text:
            full = '\n'.join(current_text)
            profiles[current_name] = extract_profile_text(full)

    for i in range(33, 170):  # pages 34-170 (0-indexed 33-169)
        text = pdf.pages[i].extract_text() or ''
        m = PLAYER_HEADER.search(text)
        if m:
            flush()
            current_name = m.group(1).strip()
            current_text = [text]
        elif current_name:
            current_text.append(text)

    flush()
    return {k: v for k, v in profiles.items() if v}


def extract():
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    with pdfplumber.open(PDF_PATH) as pdf:
        total = len(pdf.pages)
        print(f"PDF has {total} pages")

        # Page 171 = Superflex rankings (tiers)
        sf_text = pdf.pages[170].extract_text() or ''
        sf_data = parse_superflex_page(sf_text)
        print(f"Superflex: {len(sf_data)} players")

        # Page 172 = ZAP Model Rankings (coordinate-based to handle 3-column layout)
        zap_data = parse_zap_page_words(pdf.pages[171])
        print(f"ZAP: {len(zap_data)} players")

        # Player profile narratives (pages 34-170)
        profiles = extract_profiles(pdf)
        print(f"Profiles: {len(profiles)} players")

    # Merge: prefer zap_data, add tier from sf_data, add profile
    merged = {}
    all_names = set(sf_data) | set(zap_data) | set(profiles)
    for name in all_names:
        entry = {}
        if name in sf_data:
            entry.update(sf_data[name])
        if name in zap_data:
            entry.update(zap_data[name])
        if name in profiles and profiles[name]:
            entry['lateround_profile'] = profiles[name]
        merged[name] = entry

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(merged, f, indent=2, ensure_ascii=False)
    print(f"Wrote {len(merged)} entries to {OUTPUT_PATH}")
    return merged


if __name__ == '__main__':
    data = extract()
    for name, d in list(data.items())[:10]:
        print(f"  {name}: {d}")
