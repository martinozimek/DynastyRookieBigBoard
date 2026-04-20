"""
Extract Jakob Sanderson pre-draft rookie rankings from PDF.
Rankings use slot notation (1.01, 1.02 ...) — linear rank is sequential order.
Outputs scripts/output/sanderson.json
"""
import json, re, os
import pdfplumber

PDF_PATH = os.path.join(os.path.dirname(__file__), '..', 'src',
                        'Final Pre-Draft Rookie Rankings - by Jakob Sanderson.pdf')
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), 'output', 'sanderson.json')

# Slot format: "1.01. Player Name (College) – POSn"
ENTRY_PATTERN = re.compile(
    r'(\d+\.\d+)\.\s+([A-Z][a-zA-Z\'.]+(?:\s+[A-Za-z.\']+)+)\s*\(([^)]+)\)\s*[^\w]+\s*((?:QB|RB|WR|TE)\d*)'
)
TIER_PATTERN = re.compile(r'TIER\s+(\d+)\s*[^\w]+\s*VALUE:\s*(.+)')


def extract():
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    players = []  # list of {slot, name, college, position_slot, tier}
    current_tier = None
    current_tier_label = None

    with pdfplumber.open(PDF_PATH) as pdf:
        for page in pdf.pages:
            text = (page.extract_text() or '').replace('\u2019', "'").replace('\u2013', '-').replace('\u2022', '-')
            for line in text.split('\n'):
                line = line.strip()
                # Detect tier header
                t = TIER_PATTERN.search(line)
                if t:
                    current_tier = int(t.group(1))
                    current_tier_label = t.group(2).strip()
                    continue
                # Detect player entry
                m = ENTRY_PATTERN.search(line)
                if m:
                    slot_str, name, college, pos_slot = m.groups()
                    players.append({
                        'slot': slot_str,
                        'name': name.strip(),
                        'college': college.strip(),
                        'position_slot': pos_slot.strip(),
                        'sanderson_tier': current_tier,
                        'sanderson_tier_label': current_tier_label,
                    })

    # Assign linear ranks by order of appearance
    results = {}
    for rank, p in enumerate(players, start=1):
        p['sanderson_rank'] = rank
        results[p['name']] = p

    with open(OUTPUT_PATH, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"Wrote {len(results)} Sanderson entries to {OUTPUT_PATH}")
    return results


if __name__ == '__main__':
    data = extract()
    for name, d in list(data.items())[:15]:
        print(f"  {d['sanderson_rank']:3d}. {name} ({d['position_slot']}) - Tier {d['sanderson_tier']}")
