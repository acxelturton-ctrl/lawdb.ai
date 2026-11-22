#!/usr/bin/env python3
"""The hourly drip: finds, reads and loads about 50 good law firms into the live database, a few at a time.

Usage:  python3 tools/us-data/drip.py [--per-hour 50] [--dry-run] [--states "TX CA"]
Needs:  CLOUDFLARE_API_TOKEN (D1 Edit) and CLOUDFLARE_ACCOUNT_ID in the environment, wrangler (npm), and pip: duckdb requests beautifulsoup4 lxml Pillow.

Each run:
 1. Starts at a different state each hour (so the firms spread across the country) and goes down the list in tools/us-data/drip_states.txt.
 2. For a state: pulls the cleaned Overture candidates, drops the ones already in the database or already looked at (table collect_seen),
    then works through the rest 60 at a time: read the firm's own site politely (robots.txt, one request a second per site), build the
    description, keep only firms that pass every check (own site read, logo, cover photo, 90+ word description), load them, remember all.
 3. Stops at --per-hour kept firms. Nothing is loaded in --dry-run (it still reads sites and builds everything).
"""
import argparse, csv, datetime, json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from pull_overture import NOT_A_FIRM, NAMELESS, MANUAL_NOT_FIRMS, domain_of
from seen import TABLE, seen_sql

BATCH = 60          # candidates read per round
MAX_ROUNDS = 4      # per state per run
MAX_PER_DAY = 1300  # a second safety stop
TIME_BUDGET = 40 * 60   # seconds; no new round starts after this, so a run always ends inside the hour

def run(cmd, **kw):
    print('$', ' '.join(cmd), flush=True)
    return subprocess.run(cmd, cwd=ROOT, **kw)

def d1(sql=None, file=None, json_out=False):
    cmd = ['npx', 'wrangler', 'd1', 'execute', 'DB', '--remote']
    if json_out: cmd.append('--json')
    cmd += ['--command', sql] if sql else ['--yes', '--file', file]
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if p.returncode != 0: raise RuntimeError(f'wrangler failed: {(p.stderr or p.stdout)[-600:]}')
    if not json_out: return p.stdout
    out = p.stdout; return json.loads(out[out.index('['):])

def rows(sql):
    try: return d1(sql, json_out=True)[0].get('results', [])
    except RuntimeError as e:
        if 'no such table' in str(e): return []
        raise

def rotate(states, now):
    k = (now.timetuple().tm_yday * 24 + now.hour) % len(states)
    return states[k:] + states[:k]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--per-hour', type=int, default=50); ap.add_argument('--dry-run', action='store_true'); ap.add_argument('--states', default='')
    a = ap.parse_args()
    states = a.states.split() or open(os.path.join(HERE, 'drip_states.txt')).read().split()
    states = rotate(states, datetime.datetime.utcnow()) if not a.states else states
    if not a.dry_run: d1(TABLE)
    done_today = rows("SELECT COUNT(*) AS n FROM collect_seen WHERE outcome = 'kept' AND seen_at > datetime('now', '-1 day')")
    if done_today and done_today[0]['n'] >= MAX_PER_DAY: print('Daily cap reached:', done_today[0]['n']); return
    have = {domain_of(r['w']) for r in rows("SELECT json_extract(data, '$.website') AS w FROM firms") if r.get('w')}
    quota = a.per_hour; total = 0; added = []; t0 = time.time()
    for st in states:
        if quota <= 0 or time.time() - t0 > TIME_BUDGET: break
        print(f'\n=== {st} (still to fill: {quota}) ===', flush=True)
        if run([sys.executable, 'tools/us-data/pull_overture.py', st, '--target', '5000', '--min-conf', '0.5']).returncode != 0: print('pull failed for', st); continue
        path = os.path.join(ROOT, 'data', 'states', st, 'candidates.csv')
        if not os.path.exists(path): continue
        seen = {r['overture_id'] for r in rows(f"SELECT overture_id FROM collect_seen WHERE state = '{st}'")}
        cand = [r for r in csv.DictReader(open(path))
                if r['overture_id'] not in seen and r['domain'] not in have
                and not (NOT_A_FIRM.search(r['name']) or NAMELESS.match(r['name'].strip()) or r['name'].strip().lower() in MANUAL_NOT_FIRMS)]
        print(f'{st}: {len(cand)} candidates not yet seen', flush=True)
        if len(cand) < 10: continue
        fields = list(cand[0].keys())
        for rnd in range(MAX_ROUNDS):
            if quota <= 0 or not cand or time.time() - t0 > TIME_BUDGET: break
            batch, cand = cand[:BATCH], cand[BATCH:]
            sdir = os.path.join(ROOT, 'data', 'states', st)
            with open(os.path.join(sdir, 'selected.csv'), 'w', newline='') as f:
                w = csv.DictWriter(f, fieldnames=fields); w.writeheader(); w.writerows(batch)
            for fn in ('enriched.jsonl', 'outcome.json'):
                if os.path.exists(os.path.join(sdir, fn)) and rnd == 0: os.remove(os.path.join(sdir, fn))
            if run([sys.executable, 'tools/us-data/enrich.py', st, '--workers', '6']).returncode != 0: print('crawl failed'); break
            if run([sys.executable, 'tools/us-data/build_import_sql.py', st, '--keep', str(quota)]).returncode != 0: print('build failed'); break
            outcome = json.load(open(os.path.join(sdir, 'outcome.json')))
            kept = [r for r in batch if outcome.get(r['overture_id']) == 'kept']
            run([sys.executable, 'tools/us-data/seen.py', st])
            if kept and not a.dry_run: d1(file=os.path.join('data', 'states', st, 'import.sql'))
            if not a.dry_run: d1(file=os.path.join('data', 'states', st, 'seen.sql'))
            for r in kept: added.append((st, r['name'], r['city'])); have.add(r['domain'])
            quota -= len(kept); total += len(kept)
            print(f'{st} round {rnd + 1}: read {len(batch)}, kept {len(kept)}, still to fill {quota}', flush=True)
    print(f"\nDRIP SUMMARY: {'DRY RUN, nothing loaded' if a.dry_run else 'loaded'} {total} firms")
    for st, name, city in added: print(f'ADDED {st} | {name} | {city}')

if __name__ == '__main__':
    main()
