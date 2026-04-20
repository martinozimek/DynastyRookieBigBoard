"""
Run the full data pipeline: extract all sources, then build prospects.json.
Run this script whenever source data files are updated (new CSV, post-draft PDFs, etc.).

Usage:
    python scripts/run_all.py
    python scripts/run_all.py --skip-adp      # skip ADP web scrape
    python scripts/run_all.py --skip-waldman  # skip slow Waldman scan
"""
import subprocess, sys, os, argparse

BASE = os.path.dirname(os.path.abspath(__file__))
PYTHON = sys.executable


def run(script, args=None):
    cmd = [PYTHON, os.path.join(BASE, script)] + (args or [])
    print(f"\n{'='*60}")
    print(f"Running: {script}")
    print('='*60)
    result = subprocess.run(cmd, cwd=os.path.dirname(BASE))
    if result.returncode != 0:
        print(f"WARNING: {script} exited with code {result.returncode}")
    return result.returncode == 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--skip-adp', action='store_true')
    parser.add_argument('--skip-waldman', action='store_true')
    parser.add_argument('--skip-beast', action='store_true')
    args = parser.parse_args()

    ok = True
    ok &= run('scripts/extract_zap.py')
    ok &= run('scripts/extract_sanderson.py')
    if not args.skip_waldman:
        ok &= run('scripts/extract_waldman.py')
    if not args.skip_beast:
        ok &= run('scripts/extract_beast.py')
    if not args.skip_adp:
        ok &= run('scripts/fetch_adp.py')
    ok &= run('scripts/build_data.py')

    if ok:
        print('\n✓ Pipeline complete. Restart the dev server to pick up changes.')
    else:
        print('\n⚠ Pipeline finished with warnings. Check output above.')


if __name__ == '__main__':
    main()
