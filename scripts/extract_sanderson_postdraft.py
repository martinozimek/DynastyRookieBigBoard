"""
Extract Jakob Sanderson post-draft rookie rankings from PDF.
Format: "{slot}: {Name} ({Pos}{N}) — {NFL_TEAM} [{DraftPick}]"
Outputs scripts/output/sanderson_postdraft.json
"""
import json, re, os
import pdfplumber

PDF_PATH = os.path.join(os.path.dirname(__file__), '..', 'src',
                        'Post-Draft Rookie Rankings V1.0 - by Jakob Sanderson.pdf')
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), 'output', 'sanderson_postdraft.json')

UNICODE_FIXES = str.maketrans({
    '’': "'", '‘': "'",
    '–': '-', '—': '-',
    '•': '-', '…': '...',
})

# e.g. "TIER 1: 2 Base 1s"  or  "TIER 7: Late 2"
TIER_PATTERN = re.compile(r'TIER\s+(\d+)[:\s]+(.+)', re.IGNORECASE)

# e.g. "1.01: Jeremiyah Love (RB1) — AZ [1.03]"
#      "2.04: Germie Bernard (WR7) — PIT [2.47]"
#      "5.03: Desmond Reid (RB13) — BUF [UDFA]"
ENTRY_PATTERN = re.compile(
    r'(\d+\.\d+):\s+'                          # slot  "1.01:"
    r'([A-Z][a-zA-Z\'\.\- ]+?)\s+'             # name
    r'\(([A-Z]+\d*)\)\s+'                       # (RB1)
    r'[—\-]+\s+'                                # em-dash separator
    r'([A-Z]{2,4}|[A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\s+'  # NFL team abbrev
    r'\[([^\]\n]+)\]?'                          # [draft pick or UDFA] — closing ] optional (PDF line-wrap)
)

# Tier label canonicalization (matches SANDERSON_VAL_ORDER in BigBoard.jsx)
TIER_LABEL_MAP = {
    '2 base 1s': '2+ BASE 1s',
    '1.25 base 1s': '1.25 BASE 1s',
    'late 1': 'LATE 1',
    'base 1': 'BASE 1',
    'early 2': 'EARLY 2',
    'base 2': 'BASE 2',
    'late 2': 'LATE 2',
    'early 3': '3RD ROUND',
    'base 3': '3RD ROUND',
    '3rd round': '3RD ROUND',
    '4th round': '4TH ROUND',
    'round 4': '4TH ROUND',
    'priority waiver add': 'WAIVER WIRE',
    'waiver wire': 'WAIVER WIRE',
}


def canonicalize_tier_label(raw: str) -> str:
    key = raw.strip().lower()
    return TIER_LABEL_MAP.get(key, raw.strip().upper())


def extract():
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    players = []
    current_tier = None
    current_tier_label = None

    with pdfplumber.open(PDF_PATH) as pdf:
        for page in pdf.pages:
            text = (page.extract_text() or '').translate(UNICODE_FIXES)
            for line in text.split('\n'):
                line = line.strip()

                # Tier header
                t = TIER_PATTERN.search(line)
                if t and 'TIER' in line[:10]:
                    raw_label = t.group(2).strip()
                    # Drop trailing noise (e.g. "2 Base 1s\nSome text")
                    raw_label = raw_label.split('\n')[0].strip()
                    current_tier = int(t.group(1))
                    current_tier_label = canonicalize_tier_label(raw_label)
                    continue

                # Player entry
                m = ENTRY_PATTERN.search(line)
                if m:
                    slot, name, pos_slot, nfl_team, pick_val = m.groups()
                    players.append({
                        'slot': slot,
                        'name': name.strip(),
                        'position_slot': pos_slot.strip(),
                        'nfl_team': nfl_team.strip(),
                        'sanderson_pick_value': pick_val.strip(),
                        'sanderson_tier': current_tier,
                        'sanderson_tier_label': current_tier_label,
                    })

    # Assign linear ranks by order of appearance
    results = {}
    for rank, p in enumerate(players, start=1):
        p['sanderson_rank'] = rank
        results[p['name']] = p

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"Wrote {len(results)} Sanderson post-draft entries to {OUTPUT_PATH}")
    return results


if __name__ == '__main__':
    data = extract()
    for name, d in list(data.items())[:20]:
        print(f"  {d['sanderson_rank']:3d}. {name:<30} {d['position_slot']:<5} "
              f"Tier {d['sanderson_tier']} ({d['sanderson_tier_label']}) [{d['sanderson_pick_value']}]")
