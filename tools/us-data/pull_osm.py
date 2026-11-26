#!/usr/bin/env python3
"""A second source of law-firm candidates: OpenStreetMap (open data), for the states where Overture has too few.

Usage:  python3 tools/us-data/pull_osm.py OH
Out:    data/states/<ST>/candidates_osm.csv   same columns as the Overture candidates.csv (pull_overture.clean_and_pick does the cleaning)
Reads every OSM object tagged office=lawyer or amenity=lawyer in the state from the public Overpass API (one query per state). An entry needs a name, a street
address, a phone number and its own website to be kept, exactly like an Overture one; the drip then reads the website and applies the same bar to it.
"""
import csv, json, os, sys, time, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
UA = 'LawDBBot/1.0 (+https://lawdb.ai)'

def query(st):
    # Also anything with a website whose name says it is a law practice (many are tagged office=yes or have no office tag at all)
    name_rx = r'(^| )(Law|Attorneys?|Lawyers?|Legal|Esq\.?)( |$|,|\.)'
    return (f'[out:json][timeout:240];area["ISO3166-2"="US-{st}"][admin_level=4]->.a;(nwr["office"="lawyer"](area.a);nwr["amenity"="lawyer"](area.a);'
            f'nwr["name"~"{name_rx}",i]["website"](area.a);nwr["name"~"{name_rx}",i]["contact:website"](area.a););out center tags;')

def osm_to_raw(elements, st):
    """Overpass elements -> rows shaped like the Overture query result, so the same cleaning applies"""
    rows = []
    for e in elements:
        t = e.get('tags') or {}
        name = (t.get('name') or '').strip()
        lat = e.get('lat') if e.get('lat') is not None else (e.get('center') or {}).get('lat')
        lon = e.get('lon') if e.get('lon') is not None else (e.get('center') or {}).get('lon')
        if not name or lat is None or lon is None: continue
        street = ' '.join(x for x in (t.get('addr:housenumber'), t.get('addr:street')) if x).strip()
        state = (t.get('addr:state') or st).upper()
        if state != st: continue
        rows.append({'id': f"osm_{e.get('type', 'x')}_{e.get('id')}", 'name': name, 'cat': 'lawyer', 'street': street or None, 'city': (t.get('addr:city') or '').strip() or None,
                     'zip': (t.get('addr:postcode') or '')[:5] or None, 'region': st, 'phone': t.get('phone') or t.get('contact:phone'),
                     'website': t.get('website') or t.get('contact:website') or t.get('url'), 'email': t.get('email') or t.get('contact:email'),
                     'socials': None, 'confidence': 0.6, 'lat': float(lat), 'lng': float(lon)})
    return rows

def fetch(st):
    body = urllib.parse.urlencode({'data': query(st)}).encode()
    last = None
    for url in ENDPOINTS:
        for attempt in range(2):
            try:
                req = urllib.request.Request(url, data=body, headers={'User-Agent': UA})
                with urllib.request.urlopen(req, timeout=300) as r: return json.load(r).get('elements', [])
            except Exception as ex:
                last = ex; time.sleep(5 * (attempt + 1))
    raise RuntimeError(f'Overpass failed for {st}: {last!r}')

def main():
    st = sys.argv[1].upper()
    from pull_overture import clean_and_pick
    raw = osm_to_raw(fetch(st), st)
    clean, picked, stats, per = clean_and_pick(st, raw, 5000, 0.3)
    out = os.path.join('data', 'states', st); os.makedirs(out, exist_ok=True)
    fields = list(clean[0].keys()) if clean else ['name']
    with open(os.path.join(out, 'candidates_osm.csv'), 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields); w.writeheader(); w.writerows(clean)
    print(f'{st} OSM: {len(raw)} lawyer objects, {len(clean)} usable (name, address, phone, own website)')

if __name__ == '__main__':
    main()
