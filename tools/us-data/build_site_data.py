#!/usr/bin/env python3
"""Step 5: rebuild the Find page's inline data and the autocomplete places from the states that are loaded.

Usage: python3 tools/us-data/build_site_data.py FL TX
Reads  data/states/<ST>/selected.csv (the firms that are on the site), data/states/<ST>/candidates.csv (towns for autocomplete), tools/us-data/regions.json
Writes the CITY_SEED / REGIONS_BY_STATE / STATES / REGION_CENTERS / POPULAR_CITIES lines in find-lawyers.html and places.json.
Florida's regions are kept as they are in the page (they were written first); other states use regions.json.
"""
import csv, json, re, sys, os, collections

sts = [s.upper() for s in sys.argv[1:]] or ['FL']
REG = json.load(open('tools/us-data/regions.json'))
NAMES = json.load(open('tools/us-data/state_names.json'))
page = open('find-lawyers.html', encoding='utf-8').read()

LINE = r'^(/\*city-seed\*/)?const {} = (.*?)(;?)(/\*/city-seed\*/)?$'
LINE = LINE.replace('= (.*?)', '= ((?:.*?))')

def grab(name):
    m = re.search(LINE.format(name), page, re.M)
    return json.loads(m.group(2)) if m else None

seed = grab('CITY_SEED'); regions = grab('REGIONS_BY_STATE'); centers = grab('REGION_CENTERS')
seed = [c for c in seed if c['state'] in ('FL',)]  # FL stays as built; other states are rebuilt below
regions = {k: v for k, v in regions.items() if k == 'FL'}; centers = {k: v for k, v in centers.items() if k.startswith('fl-')}

def nearest(st, lat, lng):
    best = None
    for r in REG[st]['regions']:
        d = (r['lat'] - lat) ** 2 + ((r['lng'] - lng) * 0.85) ** 2
        if best is None or d < best[0]: best = (d, r['id'])
    return best[1]

popular = ['Miami|FL', 'Tampa|FL', 'Orlando|FL', 'Fort Lauderdale|FL', 'Jacksonville|FL', 'Boca Raton|FL', 'West Palm Beach|FL', 'Coral Gables|FL']
for st in sts:
    if st == 'FL' or st not in REG: continue
    regions[st] = [{'id': r['id'], 'label': r['label']} for r in REG[st]['regions']]
    for r in REG[st]['regions']: centers[r['id']] = {'lat': r['lat'], 'lng': r['lng']}
    by = collections.defaultdict(list)
    for row in csv.DictReader(open(f'data/states/{st}/selected.csv', encoding='utf-8')):
        try: by[row['city'].strip()].append((float(row['lat']), float(row['lng'])))
        except Exception: pass
    for city, pts in sorted(by.items()):
        lat = sum(p[0] for p in pts) / len(pts); lng = sum(p[1] for p in pts) / len(pts)
        seed.append({'name': city, 'state': st, 'region': nearest(st, lat, lng), 'lat': round(lat, 5), 'lng': round(lng, 5)})
    popular += [f'{c}|{st}' for c in REG[st].get('popular', [])]

states = [{'code': s, 'label': NAMES[s]} for s in sts]
def sub(name, value):
    global page
    pat = re.compile(LINE.format(name), re.M)
    assert pat.search(page), name
    page = pat.sub(lambda m: (m.group(1) or '') + 'const ' + name + ' = ' + value + m.group(3) + (m.group(4) or ''), page, count=1)
sub('CITY_SEED', json.dumps(seed, ensure_ascii=False))
sub('REGIONS_BY_STATE', json.dumps(regions, ensure_ascii=False))
sub('STATES', json.dumps(states))
sub('REGION_CENTERS', json.dumps(centers))
sub('POPULAR_CITIES', '[' + ','.join("'" + c + "'" for c in popular) + ']')
open('find-lawyers.html', 'w', encoding='utf-8').write(page)

# autocomplete places: [name, state, lat, lng, weight]; towns with 2+ candidate firms, plus what was already there
places = {(p[0], p[1]): p for p in json.load(open('places.json'))['places']}
for st in sts:
    if st == 'FL': continue
    agg = collections.defaultdict(list)
    for row in csv.DictReader(open(f'data/states/{st}/candidates.csv', encoding='utf-8')):
        try: agg[row['city'].strip()].append((float(row['lat']), float(row['lng'])))
        except Exception: pass
    for city, pts in agg.items():
        if len(pts) >= 2 and (city, st) not in places:
            places[(city, st)] = [city, st, round(sum(p[0] for p in pts) / len(pts), 4), round(sum(p[1] for p in pts) / len(pts), 4), len(pts)]
out = sorted(places.values(), key=lambda p: -p[4])
json.dump({'places': out}, open('places.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('cities', len(seed), 'places', len(out), 'states', [s['code'] for s in states])
