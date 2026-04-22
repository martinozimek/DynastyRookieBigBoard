"""
Extract Waldman RSP data from 2026_Rookie_Scouting_Portfolio.pdf.
Uses pdfminer.six for memory-efficient page-by-page streaming.
Tracks state across pages to capture multi-page sections.
Outputs scripts/output/waldman.json with:
  waldman_dot_score, waldman_position, waldman_rsp_rank,
  elevator_pitch, pre_draft_advice
"""
import json, re, os

PDF_PATH = os.path.join(os.path.dirname(__file__), '..', 'src',
                        '2026_Rookie_Scouting_Portfolio.pdf')
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), 'output', 'waldman.json')

# Standard DOT: "Depth of Talent Score: 85.575"
DOT_PATTERN     = re.compile(r'Depth of Talent Score:\s*([\d.]+)')
# Alternate TE format: "In-Line Depth of Talent Ranking: TE16 (77.5)" — score is in parens
DOT_PATTERN_ALT = re.compile(r'(?:In-Line|Overall)\s+Depth of Talent[^\(]*\(([\d.]+)\)')

# Allow optional comma before suffix words (handles "Omar Cooper, Jr." and "Mike Washington, Jr.")
# Also handles unicode-normalized text (curly quotes replaced with straight before matching)
NAME_PATTERN = re.compile(
    r'([A-Z][a-zA-Z\'.]+(?:,?\s+[A-Z][a-zA-Z\'.]*)+)\s+RSP\s+(?:Scouting\s+)?Profile'
)
RSP_RANK_PATTERN = re.compile(r'RSP Ranking:\s*([A-Z]+)(\d+)')
PITCH_PATTERN    = re.compile(r'Elevator Pitch:\s*(.+?)(?=\nBoiler/Film Room|\nPre-NFL Draft|\nDurability:|\nRSP Ranking|\Z)', re.DOTALL)
ADVICE_PATTERN   = re.compile(r'Pre-NFL Draft Fantasy Advice:\s*(.+?)(?=\nBoiler/Film Room|\nDurability:|\nRSP Ranking|\Z)', re.DOTALL)

NEW_SECTION_PATTERN = re.compile(
    r'[A-Z][a-zA-Z\'.]+(?:,?\s+[A-Z][a-zA-Z\'.]*)+\s+RSP\s+(?:Scouting\s+)?Profile'
)

# Unicode quote/dash normalization — curly quotes break the name regex
UNICODE_FIXES = str.maketrans({
    '\u2018': "'", '\u2019': "'",  # left/right single quotes → straight apostrophe
    '\u201c': '"', '\u201d': '"',  # left/right double quotes
    '\u2013': '-', '\u2014': '-',  # en/em dash
    '\u2026': '...',               # ellipsis
})


def clean(text):
    """Collapse excessive whitespace while keeping paragraph breaks."""
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = re.sub(r' {2,}', ' ', text)
    return text.strip()


def extract():
    from pdfminer.high_level import extract_pages
    from pdfminer.layout import LTTextContainer

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    results = {}
    current_player = None
    current_data = {}
    pending_pitch = ''
    pending_advice = ''
    pitch_open = False
    advice_open = False

    print(f"Scanning {PDF_PATH} ...")

    for page_num, page_layout in enumerate(extract_pages(PDF_PATH)):
        if page_num % 200 == 0:
            print(f"  Page {page_num + 1}...", flush=True)

        raw_text = ''
        for element in page_layout:
            if isinstance(element, LTTextContainer):
                raw_text += element.get_text()

        # Normalize unicode so curly apostrophes don't break name matching
        page_text = raw_text.translate(UNICODE_FIXES)

        # Detect new player header
        name_match = NAME_PATTERN.search(page_text)
        if name_match:
            incoming = name_match.group(1).strip()

            # Flush outgoing player (skip flush if same player appears twice in PDF)
            if current_player and incoming != current_player:
                if pending_pitch and 'elevator_pitch' not in current_data:
                    current_data['elevator_pitch'] = clean(pending_pitch)
                if pending_advice and 'pre_draft_advice' not in current_data:
                    current_data['pre_draft_advice'] = clean(pending_advice)
                # Merge into results (don't overwrite a richer earlier entry)
                existing = results.get(current_player, {})
                merged = {**current_data, **{k: v for k, v in existing.items() if v is not None}}
                results[current_player] = merged

            if incoming != current_player:
                # Genuine new player
                current_player = incoming
                current_data = {}
                pending_pitch = ''
                pending_advice = ''
                pitch_open = False
                advice_open = False
            # If same player repeats, keep accumulating without reset

        if not current_player:
            continue

        # DOT score — try standard format first, then TE alternate
        if 'waldman_dot_score' not in current_data:
            dot = DOT_PATTERN.search(page_text)
            if dot:
                current_data['waldman_dot_score'] = float(dot.group(1))
            else:
                dot_alt = DOT_PATTERN_ALT.search(page_text)
                if dot_alt:
                    current_data['waldman_dot_score'] = float(dot_alt.group(1))

        # RSP Rank
        if 'waldman_position' not in current_data:
            rank = RSP_RANK_PATTERN.search(page_text)
            if rank:
                current_data['waldman_position'] = rank.group(1)
                current_data['waldman_rsp_rank'] = int(rank.group(2))

        # Elevator Pitch
        if 'elevator_pitch' not in current_data:
            pm = PITCH_PATTERN.search(page_text)
            if pm:
                current_data['elevator_pitch'] = clean(pm.group(1))
                pitch_open = False
                pending_pitch = ''
            elif 'Elevator Pitch:' in page_text:
                idx = page_text.find('Elevator Pitch:') + len('Elevator Pitch:')
                pending_pitch = page_text[idx:]
                pitch_open = True
            elif pitch_open:
                if NEW_SECTION_PATTERN.search(page_text):
                    current_data['elevator_pitch'] = clean(pending_pitch)
                    pending_pitch = ''
                    pitch_open = False
                else:
                    pending_pitch += '\n' + page_text

        # Pre-NFL Draft Fantasy Advice
        if 'pre_draft_advice' not in current_data:
            am = ADVICE_PATTERN.search(page_text)
            if am:
                current_data['pre_draft_advice'] = clean(am.group(1))
                advice_open = False
                pending_advice = ''
            elif 'Pre-NFL Draft Fantasy Advice:' in page_text:
                idx = page_text.find('Pre-NFL Draft Fantasy Advice:') + len('Pre-NFL Draft Fantasy Advice:')
                pending_advice = page_text[idx:]
                advice_open = True
            elif advice_open:
                if NEW_SECTION_PATTERN.search(page_text):
                    current_data['pre_draft_advice'] = clean(pending_advice)
                    pending_advice = ''
                    advice_open = False
                else:
                    pending_advice += '\n' + page_text

    # Flush last player
    if current_player:
        if pending_pitch and 'elevator_pitch' not in current_data:
            current_data['elevator_pitch'] = clean(pending_pitch)
        if pending_advice and 'pre_draft_advice' not in current_data:
            current_data['pre_draft_advice'] = clean(pending_advice)
        existing = results.get(current_player, {})
        merged = {**current_data, **{k: v for k, v in existing.items() if v is not None}}
        results[current_player] = merged

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"Wrote {len(results)} Waldman entries to {OUTPUT_PATH}")

    for name, d in list(results.items())[:5]:
        rank_str = f"{d.get('waldman_position','?')}{d.get('waldman_rsp_rank','?')}"
        pitch = (d.get('elevator_pitch') or '')[:80]
        print(f"  {rank_str}. {name}: DOT={d.get('waldman_dot_score')} pitch={pitch!r}")
    return results


if __name__ == '__main__':
    extract()
