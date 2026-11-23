#!/usr/bin/env python3
"""Refreshes the descriptions of the firms ALREADY in the live database: re-reads each firm's own website with the biography extractor,
adds press coverage, writes the new biography, and (with `load`) saves the old text and replaces it.

Steps (the Refresh US firm descriptions workflow runs them in this order):
  python3 tools/us-data/refresh.py export --states "FL TX CA NY" [--limit 40]   firms from the database -> data/states/REF/{firms.json,selected.csv}
  python3 tools/us-data/enrich.py REF --workers 6                              read every firm's website
  python3 tools/us-data/press.py REF                                           press coverage on other sites
  python3 tools/us-data/refresh.py build                                       -> data/states/REF/{refresh.sql,bios.json,report.txt}
  python3 tools/us-data/check_bios.py REF                                      overlap and banned wording
  python3 tools/us-data/refresh.py load                                        run refresh.sql against the live database

What a firm gets:
  A  a new biography, when its site gives at least three firm-specific facts (see profile_facts.py) and the text is at least 150 characters.
     A hidden firm that already has a logo and a cover photo goes live with it.
  C  no new biography, but its existing description is cleaned of sentences that repeat the profile (address, phone, consultation terms, blog titles).
  -  untouched: the site could not be read, or there is nothing to improve.
Before any description changes, the old text is saved in table about_backup (first copy kept), so every change can be undone.
"""
import argparse, csv, json, math, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
D = os.path.join(ROOT, 'data', 'states', 'REF')
REGIONS = json.load(open(os.path.join(HERE, 'regions.json')))
MIN_CHARS = 150

BACKUP_TABLE = "CREATE TABLE IF NOT EXISTS about_backup (slug TEXT PRIMARY KEY, about TEXT, saved_at TEXT NOT NULL DEFAULT (datetime('now')));"
# sentences the profile page already covers (or that the owner did not want): address, phone, consultation terms, languages, blog titles
REPEATS = re.compile(r'(The office is at|the phone number is|To get in touch, call|To reach the firm, call|Visit .{0,60} (?:or call|to talk)|According to its own website|The firm.s website states|By its own description|'
                     r'Its blog has recently covered|Recent articles on the firm.s blog|A recent article on its blog|Its latest writing includes|Language support is listed|can work with clients in)', re.I)


def q(v):
    if v is None: return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"


def d1(sql=None, file=None, json_out=False):
    cmd = ['npx', 'wrangler', 'd1', 'execute', 'DB', '--remote']
    if json_out: cmd.append('--json')
    cmd += ['--command', sql] if sql else ['--yes', '--file', file]
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if p.returncode != 0: raise RuntimeError(f'wrangler failed: {(p.stderr or p.stdout)[-800:]}')
    if not json_out: return p.stdout
    out = p.stdout; return json.loads(out[out.index('['):])


def region_if_near(st, rid, lat, lng, miles=50):
    if st == 'FL' or st not in REGIONS: return rid
    c = next((r for r in REGIONS[st]['regions'] if r['id'] == rid), None)
    if not c or lat is None or lng is None: return ''
    dy = (lat - c['lat']) * 69.0; dx = (lng - c['lng']) * 69.0 * math.cos(math.radians(lat))
    return rid if math.hypot(dx, dy) <= miles else ''


def clean_old(text):
    """The existing description without the sentences listed in REPEATS."""
    paras = []
    for para in (text or '').split('\n\n'):
        keep = [s for s in re.split(r'(?:(?<=[.!?])|(?<=[.!?]”))\s+(?=[A-Z“])', para) if s and not REPEATS.search(s)]
        if keep: paras.append(' '.join(keep))
    return '\n\n'.join(paras)


def cmd_export(a):
    import random
    sts = ','.join("'" + s + "'" for s in a.states.split())
    rows = d1(f"SELECT slug, name, city, state, status, about, data FROM firms WHERE state IN ({sts}) ORDER BY slug", json_out=True)[0]['results']
    if a.limit: random.Random(1).shuffle(rows); rows = rows[:a.limit]
    os.makedirs(D, exist_ok=True)
    json.dump(rows, open(os.path.join(D, 'firms.json'), 'w'))
    from pull_overture import domain_of
    n = 0
    with open(os.path.join(D, 'selected.csv'), 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['overture_id', 'name', 'city', 'state', 'website', 'domain']); w.writeheader()
        for r in rows:
            rec = json.loads(r['data']); site = rec.get('website') or ''
            dom = domain_of(site)
            if not dom: continue
            w.writerow({'overture_id': r['slug'], 'name': r['name'], 'city': r['city'], 'state': r['state'], 'website': 'https://' + dom + '/', 'domain': dom}); n += 1
    print(f'exported {len(rows)} firms, {n} with a website to read')


def cmd_build(a):
    from bios import make_biography, AREA, STATE, MIN_WORDS, MIN_FACTS
    from profile_facts import extract, count_facts
    rows = json.load(open(os.path.join(D, 'firms.json')))
    enr = {}
    for l in open(os.path.join(D, 'enriched.jsonl')):
        try: j = json.loads(l); enr[j['overture_id']] = j
        except Exception: pass
    press = json.load(open(os.path.join(D, 'press.json'))) if os.path.exists(os.path.join(D, 'press.json')) else {}
    by_lower = {k.lower(): k for k in AREA}
    sql = [BACKUP_TABLE]; bios = {}; new_slugs = set(); report = []; tally = {'A': 0, 'A_live': 0, 'C': 0, 'untouched': 0, 'unreachable': 0}
    for r in rows:
        slug, st = r['slug'], r['state']; rec = json.loads(r['data']); e = enr.get(slug)
        old = r.get('about') or ''
        reach = bool(e and e.get('ok'))
        if not reach:
            tally['unreachable'] += 1; report.append(f"UNREACHABLE {slug} (written from its practice areas alone)")
        areas = (e.get('practice_areas') if reach else None) or [by_lower[t.lower()] for t in (rec.get('tags') or []) if t.lower() in by_lower]
        facts = extract(e, r['name'], r['city']) if reach else {}
        pr = press.get(slug) or []
        rid = region_if_near(st, rec.get('region') or '', rec.get('lat'), rec.get('lng'))
        new = make_biography(slug, r['name'], r['city'], st, rid, areas, facts, pr) if areas else ''
        ok = bool(new) and len(new) >= MIN_CHARS and len(new.split()) >= MIN_WORDS and count_facts(facts, pr) >= MIN_FACTS
        tier = 'A' if ok else '-'
        if ok:
            bios[slug] = new; new_slugs.add(slug); tally['A'] += 1
            sets = [f'about = {q(new)}']
            path = []
            if pr: path += ["'$.press'", f'json({q(json.dumps(pr, ensure_ascii=False))})']
            if facts.get('awards'): path += ["'$.awards'", f'json({q(json.dumps(facts["awards"], ensure_ascii=False))})']
            if path: sets.append('data = json_set(data, ' + ', '.join(path) + ')')
            if r['status'] == 'hidden' and rec.get('src') and rec.get('heroImage'): sets.append("status = 'live'"); tally['A_live'] += 1
            sets.append("updated_at = datetime('now')")
            sql.append(f"INSERT OR IGNORE INTO about_backup (slug, about) SELECT slug, about FROM firms WHERE slug = {q(slug)};")
            sql.append(f"UPDATE firms SET {', '.join(sets)} WHERE slug = {q(slug)};")
            report.append(f"A {slug} | {len(new)} chars, {len(new.split())} words, {count_facts(facts, pr)} facts" + (' | now live' if r['status'] == 'hidden' and rec.get('src') and rec.get('heroImage') else ''))
        if tier != 'A':
            cleaned = clean_old(old)
            if old and cleaned != old and len(cleaned) >= MIN_CHARS:
                tally['C'] += 1; bios[slug] = cleaned
                sql.append(f"INSERT OR IGNORE INTO about_backup (slug, about) SELECT slug, about FROM firms WHERE slug = {q(slug)};")
                sql.append(f"UPDATE firms SET about = {q(cleaned)}, updated_at = datetime('now') WHERE slug = {q(slug)};")
                report.append(f"C {slug} | old text cleaned: {len(old)} -> {len(cleaned)} chars")
            elif reach: tally['untouched'] += 1; report.append(f"UNCHANGED {slug} | {len(old)} chars, no practice areas known")
    open(os.path.join(D, 'refresh.sql'), 'w').write('\n'.join(sql) + '\n')
    json.dump(bios, open(os.path.join(D, 'bios.json'), 'w'), ensure_ascii=False, indent=1)
    open(os.path.join(D, 'report.txt'), 'w').write('\n'.join(report) + '\n')
    print('REFRESH SUMMARY', json.dumps(tally), 'of', len(rows), 'firms')
    for slug in [s for s in bios if s in new_slugs][:25]: print(f'--- NEW {slug} ---\n{bios[slug]}\n')
    for line in report: print(line)


def cmd_load(a):
    d1(file=os.path.join('data', 'states', 'REF', 'refresh.sql'))
    out = d1("SELECT state, status, COUNT(*) AS firms, SUM(length(about) >= 150) AS described_150_plus, SUM(about IS NULL OR length(about) < 150) AS short_or_missing FROM firms GROUP BY state, status ORDER BY state, status", json_out=True)
    print(json.dumps(out[0]['results'], indent=1))
    print('backups:', d1("SELECT COUNT(*) AS n FROM about_backup", json_out=True)[0]['results'])


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest='cmd', required=True)
    e = sub.add_parser('export'); e.add_argument('--states', required=True); e.add_argument('--limit', type=int, default=0)
    sub.add_parser('build'); sub.add_parser('load')
    a = ap.parse_args(); {'export': cmd_export, 'build': cmd_build, 'load': cmd_load}[a.cmd](a)
