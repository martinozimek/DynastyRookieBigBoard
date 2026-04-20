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

DOT_PATTERN    = re.compile(r'Depth of Talent Score:\s*([\d.]+)')
NAME_PATTERN   = re.compile(
    r'([A-Z][a-zA-Z\'.]+(?:\s+[A-Z][a-zA-Z\'.]*)+)\s+RSP\s+(?:Scouting\s+)?Profile'
)
RSP_RANK_PATTERN = re.compile(r'RSP Ranking:\s*([A-Z]+)(\d+)')
PITCH_PATTERN    = re.compile(r'Elevator Pitch:\s*(.+?)(?=\nBoiler/Film Room|\nPre-NFL Draft|\nDurability:|\nRSP Ranking|\Z)', re.DOTALL)
ADVICE_PATTERN   = re.compile(r'Pre-NFL Draft Fantasy Advice:\s*(.+?)(?=\nBoiler/Film Room|\nDurability:|\nRSP Ranking|\Z)', re.DOTALL)

# Text that signals a new player section (used to stop accumulating text)
NEW_SECTION_PATTERN = re.compile(
    r'[A-Z][a-zA-Z\'.]+(?:\s+[A-Z][a-zA-Z\'.]*)+\s+RSP\s+(?:Scouting\s+)?Profile'
)


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
    # Buffer to accumulate text across pages for long sections
    pending_pitch = ''
    pending_advice = ''
    pitch_open = False
    advice_open = False

    print(f"Scanning {PDF_PATH} ...")

    for page_num, page_layout in enumerate(extract_pages(PDF_PATH)):
        if page_num % 200 == 0:
            print(f"  Page {page_num + 1}...", flush=True)

        page_text = ''
        for element in page_layout:
            if isinstance(element, LTTextContainer):
                page_text += element.get_text()

        # Detect new player header → flush previous
        name_match = NAME_PATTERN.search(page_text)
        if name_match:
            # Flush pending sections for outgoing player
            if current_player:
                if pending_pitch:
                    current_data['elevator_pitch'] = clean(pending_pitch)
                if pending_advice:
                    current_data['pre_draft_advice'] = clean(pending_advice)
                results[current_player] = current_data

            current_player = name_match.group(1).strip()
            current_data = {}
            pending_pitch = ''
            pending_advice = ''
            pitch_open = False
            advice_open = False

        if not current_player:
            continue

        # DOT score
        if 'waldman_dot_score' not in current_data:
            dot = DOT_PATTERN.search(page_text)
            if dot:
                current_data['waldman_dot_score'] = float(dot.group(1))

        # RSP Rank
        if 'waldman_position' not in current_data:
            rank = RSP_RANK_PATTERN.search(page_text)
            if rank:
                current_data['waldman_position'] = rank.group(1)
                current_data['waldman_rsp_rank'] = int(rank.group(2))

        # Elevator Pitch — try full-page extraction first
        if 'elevator_pitch' not in current_data:
            pm = PITCH_PATTERN.search(page_text)
            if pm:
                current_data['elevator_pitch'] = clean(pm.group(1))
                pitch_open = False
                pending_pitch = ''
            elif 'Elevator Pitch:' in page_text:
                # Start of pitch, continues on next page(s)
                idx = page_text.find('Elevator Pitch:') + len('Elevator Pitch:')
                pending_pitch = page_text[idx:]
                pitch_open = True
            elif pitch_open:
                # Continuation page
                if NEW_SECTION_PATTERN.search(page_text):
                    # New player started — close pitch
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
        results[current_player] = current_data

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"Wrote {len(results)} Waldman entries to {OUTPUT_PATH}")

    # Sample output
    for name, d in list(results.items())[:5]:
        rank_str = f"{d.get('waldman_position','?')}{d.get('waldman_rsp_rank','?')}"
        pitch = (d.get('elevator_pitch') or '')[:80]
        advice = (d.get('pre_draft_advice') or '')[:80]
        print(f"  {rank_str}. {name}: DOT={d.get('waldman_dot_score')} pitch={pitch!r}")
    return results


if __name__ == '__main__':
    extract()
