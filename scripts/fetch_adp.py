"""
Fetch ADP data from Dynasty Data Lab.
URL: https://dynastydatalab.com/adp/rookie
Uses Playwright (already installed) since the page is JS-rendered.
Outputs scripts/output/adp.json
"""
import json, re, os, time

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), 'output', 'adp.json')


def fetch_with_playwright():
    from playwright.sync_api import sync_playwright

    results = {}
    url = 'https://dynastydatalab.com/adp/rookie'

    print(f"Launching browser to fetch {url} ...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(url, wait_until='networkidle', timeout=60000)
        time.sleep(3)

        # Try to get all rows from the ADP table
        # Dynasty Data Lab uses a table with headers including "Player", "ADP", "Pos" etc.
        rows = page.query_selector_all('table tbody tr')
        if not rows:
            # Try alternate selectors
            rows = page.query_selector_all('[class*="table"] tr, [class*="row"]')

        print(f"  Found {len(rows)} rows")

        for row in rows:
            cells = row.query_selector_all('td')
            if len(cells) < 3:
                continue
            texts = [c.inner_text().strip() for c in cells]

            # Try to identify columns: look for player name (string), ADP (float), pos (letters)
            # Typical columns: Rank, Player, Team, Pos, ADP, ...
            player_name = None
            adp_val = None

            for j, t in enumerate(texts):
                if re.match(r'^\d+\.\d+$', t) or re.match(r'^\d+$', t):
                    # Candidate for ADP or rank
                    if j > 0 and player_name is None:
                        # First numeric after player name
                        pass
                # Player name heuristic: mixed case, 2+ words, no numbers
                if re.match(r'^[A-Z][a-zA-Z\'.\-]+(\s+[A-Z][a-zA-Z\'.\-]+)+$', t) and len(t) > 4:
                    player_name = t

            # More robust: find ADP as last decimal number in row
            decimals = [t for t in texts if re.match(r'^\d+\.\d+$', t)]
            if decimals:
                adp_val = float(decimals[0])

            if player_name and adp_val:
                results[player_name] = {'adp': adp_val}

        browser.close()

    return results


def fetch_heatmap_adp():
    """Parse heatmap page — player name followed by decimal ADP then percentages."""
    from playwright.sync_api import sync_playwright

    results = {}
    url = 'https://dynastydatalab.com/adp/rookie_heatmap'

    print(f"Trying heatmap URL: {url} ...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(url, wait_until='networkidle', timeout=60000)
        time.sleep(5)

        body = page.inner_text('body')
        lines = [l.strip() for l in body.split('\n') if l.strip()]

        # Pattern: player name line (title case, 2+ words) followed by a number (the ADP)
        # Skip lines that are percentages or pick slots (1.01, 1.02, etc.)
        i = 0
        while i < len(lines):
            line = lines[i]
            # Player name: mixed case, 2+ words, no % or pure numbers
            name_match = re.match(r'^([A-Z][a-zA-Z\'.\-]+(?:\s+[A-Z][a-zA-Z\'.\-]+)+)$', line)
            if name_match and '%' not in line:
                name = name_match.group(1)
                # Next line should be the ADP (integer or decimal, but NOT slot like 1.01)
                if i + 1 < len(lines):
                    next_line = lines[i + 1]
                    adp_match = re.match(r'^(\d+(?:\.\d+)?)$', next_line)
                    # Exclude pick-slot format like 1.01, 2.03, etc. (two digits after dot)
                    if adp_match:
                        adp_str = adp_match.group(1)
                        if not re.match(r'^\d+\.\d{2}$', adp_str):  # exclude X.YY slot format
                            results[name] = {'adp': float(adp_str)}
            i += 1

        browser.close()

    return results


def fetch():
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

    results = {}
    # Try heatmap first (has decimal ADP)
    try:
        hm = fetch_heatmap_adp()
        print(f"  Got {len(hm)} ADP entries from heatmap")
        results.update(hm)
    except Exception as e:
        print(f"  Heatmap failed: {e}")

    if len(results) < 10:
        try:
            results = fetch_with_playwright()
            print(f"  Got {len(results)} ADP entries from main page")
        except Exception as e:
            print(f"  Main page failed: {e}")

    if not results:
        print("WARNING: Could not fetch ADP data. ADP will be null for all players.")

    with open(OUTPUT_PATH, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"Wrote {len(results)} ADP entries to {OUTPUT_PATH}")
    return results


if __name__ == '__main__':
    data = fetch()
    for name, d in list(data.items())[:15]:
        print(f"  {name}: ADP={d['adp']}")
