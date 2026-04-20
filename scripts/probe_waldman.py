"""Probe Waldman RSP for elevator pitch and pre-draft fantasy advice sections."""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

from pdfminer.high_level import extract_pages
from pdfminer.layout import LTTextContainer
import os, re

PDF_PATH = r'C:\Users\Ozimek\Documents\Claude\DynastyBigBoard\src\2026_Rookie_Scouting_Portfolio.pdf'

# Find first few players with 'ELEVATOR PITCH' or 'PRE-NFL DRAFT FANTASY ADVICE'
TARGET_KEYWORDS = ['ELEVATOR PITCH', 'PRE-NFL DRAFT FANTASY ADVICE', 'FANTASY ADVICE']

page_texts = []
found = 0
for page_num, page_layout in enumerate(extract_pages(PDF_PATH)):
    lines = []
    for element in page_layout:
        if isinstance(element, LTTextContainer):
            lines.append(element.get_text().strip())
    text = '\n'.join(lines)

    for kw in TARGET_KEYWORDS:
        if kw in text.upper():
            print(f"\n=== Page {page_num} (keyword: {kw}) ===")
            # Show context around keyword
            upper = text.upper()
            idx = upper.find(kw)
            print(text[max(0,idx-200):idx+500])
            found += 1
            break

    if found >= 5:
        break

print(f"\nFound {found} pages with target keywords in first {page_num} pages")
