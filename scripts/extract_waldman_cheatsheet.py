"""
Waldman 2026 RSP Post-Draft Cheat Sheet ranks.
Source: WaldmanCheatSheet.png (overall pick slot) + user-provided TEP adjustments
for lower TEs (Michael Trigg → 20, Sam Roush → 21, Will Kacmarek → 22).

Tiers inferred from image color blocks:
  Tier I  : slots 1-13  (green)
  Tier II : slots 14-46 (blue/teal)
  Tier III: slots 47+   (noted by Waldman: "Tier III begins at 47")

Output: scripts/output/waldman_cheatsheet.json
"""
import json, os

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), 'output', 'waldman_cheatsheet.json')

# slot → Tier label
def tier(slot):
    if slot <= 13: return 'I'
    if slot <= 46: return 'II'
    return 'III'

# Full name → slot (TEP-adjusted where user provided text corrections)
RANKS = {
    # QB
    'Fernando Mendoza':    2,
    'Ty Simpson':         15,
    'Carson Beck':        21,
    'Taylen Green':       22,
    'Garrett Nussmeier':  47,
    'Cade Klubnik':       48,
    # RB
    'Jeremiyah Love':      3,
    'Jadarian Price':      7,
    'Demond Claiborne':   16,
    'Emmett Johnson':     17,
    'Nick Singleton':     18,
    'Kaelon Black':       31,
    'Michael Washington': 32,
    'Kaytron Allen':      34,
    'Adam Randall':       35,
    'Jonah Coleman':      36,
    # WR
    'Carnell Tate':        1,
    'Makai Lemon':         4,
    'KC Concepcion':       5,
    'Jordyn Tyson':        6,
    'Skyler Bell':         8,
    'Malachi Fields':      9,
    'Denzel Boston':      10,
    'Antonio Williams':   11,
    'Chris Brazzell':     12,
    'Omar Cooper':        13,
    'Germie Bernard':     19,
    'Chris Bell':         20,
    'Ja\'Kobi Lane':      20,   # TEP-adjusted (was 40 non-TEP)
    'Zachariah Branch':   23,
    'Bryce Lance':        24,
    'Ted Hurst':          25,
    'De\'Zhaun Stribling': 26,
    'Elijah Sarratt':     27,
    'Kevin Coleman':      29,
    'Deion Burks':        30,
    'Malik Benson':       21,
    'Josh Cameron':       21,
    'Cyrus Allen':        21,
    # TE
    'Eli Stowers':        14,
    'Kenyon Sadiq':       28,
    'Oscar Delp':         38,
    'Justin Joly':        39,
    'Michael Trigg':      20,   # TEP-adjusted (was 41 non-TEP)
    'Sam Roush':          21,   # TEP-adjusted (was 45 non-TEP)
    'Will Kacmarek':      22,   # TEP-adjusted (was 46 non-TEP)
}

def extract():
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    result = {}
    for name, slot in RANKS.items():
        result[name] = {
            'waldman_cheat_rank': slot,
            'waldman_cheat_tier': tier(slot),
        }

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(f"Wrote {len(result)} entries to {OUTPUT_PATH}")
    for name, d in sorted(result.items(), key=lambda x: x[1]['waldman_cheat_rank']):
        print(f"  {d['waldman_cheat_rank']:2d}. {name:<28} T{d['waldman_cheat_tier']}")
    return result


if __name__ == '__main__':
    extract()
