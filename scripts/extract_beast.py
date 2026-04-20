"""
Extract Brugler (The Beast) draft grades and bold summary statements.
PDF: src/the-beast-2026-2.pdf  Password: thebeast2026!

Strategy:
  1. Known section page ranges (from TOC + probe):
     QB table idx 5, writeups 6-38
     RB table idx 40, writeups 41-83
     WR table idx ~84, writeups ~86-171
     TE table idx 172, writeups 173-~220
  2. Parse grade tables to get {CAPS_NAME: grade} per position.
  3. Fast scan all pages with extract_text() to find "Overall,"-containing pages.
  4. On those pages only, extract_words() to get bold Georgia-Bold text.
  5. Split bold text on "Overall," → match player by last name.
  6. Output beast.json {title_case_name: {brugler_grade, brugler_summary}}
"""
import json, re, os
import pdfplumber
from rapidfuzz import process, fuzz

PDF_PATH = os.path.join(os.path.dirname(__file__), '..', 'src', 'the-beast-2026-2.pdf')
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), 'output', 'beast.json')
PASSWORD = 'thebeast2026!'

BOLD_MARKER = 'Georgia-Bold'

# Known section page indices (0-based) from PDF probe
SECTIONS = [
    ('QB', 5,  6,   39),
    ('RB', 40, 41,  84),
    ('WR', 84, 86,  172),
    ('TE', 172, 174, 225),
]

GRADE_RE = re.compile(r'^\d+(?:st|nd|rd|th)(?:-(?:\d+(?:st|nd|rd|th)|FA))?$|^FA$')
SUFFIXES = {'JR.', 'JR', 'II', 'III', 'IV', 'SR.', 'SR'}


def is_bold(fontname):
    return BOLD_MARKER in fontname


def parse_grade_table(text):
    """Token-based grade table parser. Returns {CAPS_NAME: grade}."""
    results = {}
    for line in text.split('\n'):
        tokens = line.strip().split()
        if not tokens or not tokens[0].isdigit():
            continue
        grade = None
        grade_idx = None
        for i, t in enumerate(tokens[1:], 1):
            if GRADE_RE.match(t):
                grade = t
                grade_idx = i
                break
        if grade is None:
            continue
        # Collect all-caps name tokens; limit to 2 unless 3rd is a suffix
        name_tokens = []
        for t in tokens[1:grade_idx]:
            if not re.match(r'^[A-Z][A-Z\'.\-]+$', t):
                break
            if len(name_tokens) >= 2 and t not in SUFFIXES:
                break
            name_tokens.append(t)
        if len(name_tokens) < 2:
            continue
        results[' '.join(name_tokens)] = grade
    return results


def get_bold_text(page):
    """Extract bold Georgia-Bold words joined with spaces."""
    words = page.extract_words(extra_attrs=['fontname'])
    return ' '.join(w['text'] for w in words if is_bold(w.get('fontname', '')))


def extract_summaries_from_range(pdf, start, end):
    """
    Collect bold "Overall, ..." statements from pages [start, end).
    Returns list of (last_name_hint, full_summary_text).
    Fast: only does full word extraction on pages containing "Overall".
    """
    bold_parts = []
    for idx in range(start, min(end, len(pdf.pages))):
        text = pdf.pages[idx].extract_text() or ''
        if 'Overall' not in text:
            continue
        bold = get_bold_text(pdf.pages[idx])
        if bold:
            bold_parts.append(bold)

    joined = ' '.join(bold_parts)

    segments = re.split(r'(?=\bOverall,\s)', joined)
    summaries = []
    for seg in segments:
        seg = seg.strip()
        if not seg.startswith('Overall,'):
            continue
        rest = seg[len('Overall,'):].strip()
        first_word = rest.split()[0].rstrip(",'\"") if rest else ''
        summaries.append((first_word, seg))
    return summaries


def extract():
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    grades = {}   # {CAPS_NAME: grade}
    pos_of = {}   # {CAPS_NAME: pos}

    with pdfplumber.open(PDF_PATH, password=PASSWORD) as pdf:
        print(f"PDF: {len(pdf.pages)} pages")

        # Parse grade tables
        for pos, table_idx, writeup_start, writeup_end in SECTIONS:
            text = (pdf.pages[table_idx].extract_text() or '').encode('ascii', errors='replace').decode()
            sect_grades = parse_grade_table(text)
            for name, grade in sect_grades.items():
                grades[name] = grade
                pos_of[name] = pos
            print(f"  {pos} table (page {table_idx}): {len(sect_grades)} players")

        # Collect bold summaries per section
        all_summaries = []
        for pos, table_idx, writeup_start, writeup_end in SECTIONS:
            sums = extract_summaries_from_range(pdf, writeup_start, writeup_end)
            all_summaries.extend(sums)
            print(f"  {pos} writeups ({writeup_start}-{writeup_end}): {len(sums)} Overall summaries")

    print(f"\nTotal summaries: {len(all_summaries)}")
    print(f"Grade table entries: {len(grades)}")

    # Build last_name → CAPS names lookup
    # For names ending in suffix (JR., II, etc.), index by second-to-last token too
    last_to_caps = {}
    for name in grades:
        parts = name.split()
        # Primary key: last non-suffix token
        non_suffix = [p for p in parts if p not in SUFFIXES]
        key = non_suffix[-1] if non_suffix else parts[-1]
        last_to_caps.setdefault(key, []).append(name)

    caps_names = list(grades.keys())
    results = {}
    matched = 0
    unmatched = []

    for last_name, summary in all_summaries:
        # Strip possessives (Unicode ' and ASCII ') and punctuation
        clean = re.sub(r"[\u2019\u2018']s?$", '', last_name).strip("'s").strip()
        ln_upper = clean.upper()
        candidates = last_to_caps.get(ln_upper, [])

        if len(candidates) == 1:
            full_name = candidates[0]
        elif len(candidates) > 1:
            # Multiple players with same last name: check first name in summary
            best = None
            for c in candidates:
                first = c.split()[0].title()
                if first in summary:
                    best = c
                    break
            full_name = best or candidates[0]
        else:
            match = process.extractOne(ln_upper, caps_names, scorer=fuzz.token_sort_ratio)
            if match and match[1] >= 70:
                full_name = match[0]
            else:
                unmatched.append((last_name, summary[:80]))
                continue

        results[full_name] = {
            'brugler_grade': grades.get(full_name),
            'brugler_summary': summary,
        }
        matched += 1

    print(f"Matched: {matched} / {len(all_summaries)}")
    if unmatched:
        print(f"Unmatched ({len(unmatched)}):")
        for nm, s in unmatched:
            print(f"  '{nm}': {s[:70]}")

    # Convert to Title Case keys for downstream matching
    title_results = {}
    for name, data in results.items():
        title = ' '.join(w.capitalize() for w in name.split())
        title_results[title] = data

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(title_results, f, indent=2, ensure_ascii=False)
    print(f"\nWrote {len(title_results)} entries to {OUTPUT_PATH}")

    for name, d in list(title_results.items())[:8]:
        print(f"  {name}: {d['brugler_grade']} | {d['brugler_summary'][:70]}...")

    return title_results


if __name__ == '__main__':
    extract()
