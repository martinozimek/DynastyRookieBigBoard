"""
Generate AI insights for each prospect using Claude.
Reads app/src/data/prospects.json, adds ai_insight field, writes back.

Usage:
  python scripts/generate_insights.py
  python scripts/generate_insights.py --model claude-haiku-4-5-20251001
  python scripts/generate_insights.py --force   # regenerate even if insight exists
"""
import json, time, argparse, sys, os
from pathlib import Path
import anthropic

ROOT = Path(__file__).parent.parent
PROSPECTS = ROOT / 'app' / 'src' / 'data' / 'prospects.json'

SYSTEM = (
    "You are a concise dynasty fantasy football analyst. "
    "Write tight, data-driven insights — no filler, no hedging. "
    "Use specific numbers. Be opinionated."
)

def fmt(v, suffix=''):
    return f"{v}{suffix}" if v is not None else '—'

def build_prompt(p: dict) -> str:
    lines = [
        f"Player: {p['name']} | {p.get('position','?')} | Age {fmt(p.get('age'))} | {p.get('team','?')}",
        f"Draft Capital: {fmt(p.get('draft_capital'))}",
        "",
        "Rankings (manager weights LateRound & Sanderson most):",
        f"  LateRound Rank: {fmt(p.get('lateround_sf_rank'))}  LR Tier: {fmt(p.get('lateround_overall_tier'))}  ZAP Tier: {fmt(p.get('lateround_zap_tier_label'))}",
        f"  Sanderson Rank: {fmt(p.get('sanderson_rank'))}  S.Tier: {fmt(p.get('sanderson_tier'))}  S.Val: {fmt(p.get('sanderson_tier_label'))}",
        f"  ETR Rank: {fmt(p.get('etr_rank'))}  DLF Rank: {fmt(p.get('dlf_rank'))}",
        f"  ADP: {fmt(p.get('adp'))}",
        "",
        "Model scores:",
        f"  ZAP: {fmt(p.get('zap_score'))}  ORBIT: {fmt(p.get('orbit_score'))}  Breakout: {fmt(p.get('breakout_score'))}",
        f"  Waldman DOT: {fmt(p.get('waldman_dot'))}  Brugler Grade: {fmt(p.get('brugler_grade'))}",
    ]

    if p.get('brugler_summary'):
        lines += ["", f"Brugler summary: {p['brugler_summary'][:400]}"]
    if p.get('elevator_pitch'):
        lines += ["", f"Waldman elevator pitch: {p['elevator_pitch'][:400]}"]
    if p.get('lateround_profile'):
        lines += ["", f"LateRound profile: {p['lateround_profile'][:500]}"]

    lines += [
        "",
        "Write exactly 3 sentences:",
        "1. What LateRound and Sanderson tell us about this player's dynasty value (cite their specific ranks/tiers).",
        "2. How ETR/DLF compare — note any meaningful gap vs LateRound/Sanderson.",
        "3. The single most important factor (physical profile, landing spot, role clarity, risk) that defines his dynasty ceiling or floor.",
    ]
    return '\n'.join(lines)


def generate_insight(client: anthropic.Anthropic, player: dict, model: str) -> str:
    msg = client.messages.create(
        model=model,
        max_tokens=220,
        system=SYSTEM,
        messages=[{"role": "user", "content": build_prompt(player)}],
    )
    return msg.content[0].text.strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', default='claude-haiku-4-5-20251001')
    parser.add_argument('--force', action='store_true', help='Regenerate existing insights')
    parser.add_argument('--player', help='Only generate for this player name (substring match)')
    args = parser.parse_args()

    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        print("ERROR: Set ANTHROPIC_API_KEY environment variable", file=sys.stderr)
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    data = json.loads(PROSPECTS.read_text(encoding='utf-8'))
    players = data['players']

    updated = 0
    for i, p in enumerate(players):
        if args.player and args.player.lower() not in p['name'].lower():
            continue
        if not args.force and p.get('ai_insight'):
            continue

        print(f"  [{i+1}/{len(players)}] {p['name']}...", end=' ', flush=True)
        try:
            p['ai_insight'] = generate_insight(client, p, args.model)
            updated += 1
            print('done')
        except Exception as e:
            print(f'ERROR: {e}')

        time.sleep(0.25)  # gentle rate limiting

    PROSPECTS.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding='utf-8')
    print(f"\nDone. {updated} insights written to {PROSPECTS}")


if __name__ == '__main__':
    main()
