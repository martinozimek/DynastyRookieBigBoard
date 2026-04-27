"""
Extract Legendary Upside superflex/TEP rookie rankings from
LegendaryUpsideRankings_Rookie2026.pdf.

PDF is a Gmail print-out. Table columns:
  Player  Team  Pos  P Rank  Age  SF/TEP  SF Tier

Some names wrap to the next line (e.g. "Fernando\nMendoza LV QB QB1 22.6 5 3").
We stop at the "1 QB" section header.

Output: scripts/output/legendary.json
"""
import json, re, os
import pdfplumber

PDF_PATH = os.path.join(os.path.dirname(__file__), '..', 'src',
                        'LegendaryUpsideRankings_Rookie2026.pdf')
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), 'output', 'legendary.json')

UNICODE_FIXES = str.maketrans({
    '‘': "'", '’': "'",
    '–': '-', '—': '-',
})

# Matches the trailing data columns: Team Pos PosRank Age SF/TEP Tier
SUFFIX_RE = re.compile(
    r'([A-Z]{2,4})\s+'           # NFL team
    r'(RB|WR|TE|QB)\s+'          # position
    r'(RB|WR|TE|QB)(\d+)\s+'     # pos rank  e.g. WR5
    r'(\d+\.\d+)\s+'              # age
    r'(\d+)\s+'                   # SF/TEP rank (linear 1-50)
    r'(\d+)\s*$'                  # SF Tier
)

STOP_PATTERN = re.compile(r'1\s*QB\s*/\s*PPR', re.IGNORECASE)


def extract():
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    players = []
    pending_prefix = ''

    with pdfplumber.open(PDF_PATH) as pdf:
        for page in pdf.pages:
            text = (page.extract_text() or '').translate(UNICODE_FIXES)
            for line in text.split('\n'):
                line = line.strip()

                # Stop at 1QB section
                if STOP_PATTERN.search(line):
                    pending_prefix = ''
                    break

                m = SUFFIX_RE.search(line)
                if m:
                    # Name = pending prefix + everything before the suffix match
                    name_part = line[:m.start()].strip()
                    full_name = (pending_prefix + ' ' + name_part).strip() if pending_prefix else name_part
                    full_name = re.sub(r'\s+', ' ', full_name).strip()
                    pending_prefix = ''

                    team, pos, pos_label, pos_num, age, sf_rank, tier = m.groups()
                    players.append({
                        'name': full_name,
                        'nfl_team': team,
                        'position': pos,
                        'legendary_pos_rank': f"{pos_label}{pos_num}",
                        'legendary_sf_rank': int(sf_rank),   # linear rank 1-50
                        'legendary_tier': int(tier),
                    })
                else:
                    # Might be first part of a wrapped name — keep if it looks like a name
                    if line and re.match(r"^[A-Z][a-zA-Z'\.]+", line) and len(line) < 30:
                        pending_prefix = line
                    else:
                        pending_prefix = ''

    # Deduplicate: keep first occurrence (SF/TEP section only, before 1QB)
    seen = set()
    unique = []
    for p in players:
        if p['name'] not in seen:
            seen.add(p['name'])
            unique.append(p)

    result = {}
    for p in unique:
        result[p['name']] = p

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(f"Wrote {len(result)} entries to {OUTPUT_PATH}")
    for name, d in list(result.items())[:15]:
        print(f"  {d['legendary_sf_rank']:2d}. {name:<30} T{d['legendary_tier']} {d['legendary_pos_rank']}")
    return result


if __name__ == '__main__':
    extract()
