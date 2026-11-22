#!/usr/bin/env python3
"""Remembers which candidate firms a run has already looked at, so the next run does not crawl them again.

Usage:  python3 tools/us-data/seen.py FL      writes data/states/FL/seen.sql (INSERT OR IGNORE into collect_seen)
Reads:  data/states/<ST>/selected.csv (the firms this run looked at) and outcome.json (what build_import_sql.py decided).
A firm that was good but left out because of the --keep cap ('extra') is NOT remembered, so a later run can still take it.
"""
import csv, json, os, sys

TABLE = ("CREATE TABLE IF NOT EXISTS collect_seen (overture_id TEXT PRIMARY KEY, state TEXT NOT NULL, domain TEXT, "
         "outcome TEXT NOT NULL, seen_at TEXT NOT NULL DEFAULT (datetime('now')));")

def q(v): return "'" + str(v).replace("'", "''") + "'"

def seen_sql(st):
    d = os.path.join('data', 'states', st)
    rows = list(csv.DictReader(open(os.path.join(d, 'selected.csv'))))
    path = os.path.join(d, 'outcome.json')
    outcome = json.load(open(path)) if os.path.exists(path) else {}
    out = [TABLE]
    for r in rows:
        o = outcome.get(r['overture_id'], 'skip')
        if o == 'extra': continue
        out.append(f"INSERT OR IGNORE INTO collect_seen (overture_id, state, domain, outcome) VALUES ({q(r['overture_id'])}, {q(st)}, {q(r.get('domain', ''))}, {q(o)});")
    return '\n'.join(out) + '\n'

if __name__ == '__main__':
    st = sys.argv[1].upper()
    sql = seen_sql(st)
    open(os.path.join('data', 'states', st, 'seen.sql'), 'w').write(sql)
    print(st, 'seen.sql:', sql.count('INSERT OR IGNORE'), 'firms remembered')
