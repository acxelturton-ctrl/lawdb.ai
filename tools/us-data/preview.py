#!/usr/bin/env python3
"""Prints, for each state given, how many firms were picked, crawled and kept, plus one example firm with its description. Reads data/states/<ST>/ only."""
import csv, json, os, sys
for st in (a.upper() for a in sys.argv[1:]):
    d = os.path.join('data', 'states', st)
    sel = list(csv.DictReader(open(os.path.join(d, 'selected.csv'))))
    enr = [json.loads(l) for l in open(os.path.join(d, 'enriched.jsonl'))] if os.path.exists(os.path.join(d, 'enriched.jsonl')) else []
    bios = json.load(open(os.path.join(d, 'bios.json'))) if os.path.exists(os.path.join(d, 'bios.json')) else {}
    sql = open(os.path.join(d, 'import.sql')).read()
    print(f'=== {st}: candidates picked {len(sel)} | crawled {len(enr)} (reached {sum(1 for e in enr if e.get("ok"))}, with practice areas {sum(1 for e in enr if e.get("practice_areas"))}, with logo {sum(1 for e in enr if e.get("logo"))}) | firms in import.sql {sql.count("INSERT OR IGNORE INTO firms ")} | with a description {len(bios)}')
    if bios:
        slug = sorted(bios)[len(bios) // 2]
        print(f'--- EXAMPLE {slug} ({len(bios[slug].split())} words) ---\n{bios[slug]}\n')
