#!/usr/bin/env python3
"""Step 1 of the US firm pipeline: pull law firms for one state from Overture Maps (open data), clean them, and pick the best N.

Usage:  python3 tools/us-data/pull_overture.py FL [--target 500]
Output: data/states/<ST>/candidates.csv (all cleaned firms) and selected.csv (the picked N). data/states is not committed.
Needs:  pip install duckdb
"""
import argparse, csv, os, re, sys, urllib.parse, urllib.request, collections
import duckdb

# Rough bounding boxes make the read fast (parquet row groups are skipped). A state missing here still works, just slower.
BBOX = {'FL': (-87.7, -79.9, 24.3, 31.1), 'CA': (-124.5, -114.1, 32.5, 42.1), 'NY': (-79.8, -71.8, 40.4, 45.1), 'GA': (-85.7, -80.7, 30.3, 35.1), 'IL': (-91.6, -87.0, 36.9, 42.6)}
BASE = 'https://overturemaps-us-west-2.s3.amazonaws.com/'

FIRM_WORDS = re.compile(r"\b(law|laws|lawyer|lawyers|attorney|attorneys|legal|firm|offices?|counsel|associates|group|p\.?\s?a\.?|pllc|p\.?l\.?l\.?c\.?|llp|l\.?l\.?p\.?|llc|p\.?c\.?|chartered|esq\.?)\b", re.I)
NOT_A_FIRM = re.compile(r"\b(bail|bonds?|notary|notaries|paralegal|document|process serv|title (co|company|insurance)|court reporting|legal aid|legal services of|clinic|courthouse|clerk|county|department|state attorney|district attorney|attorney general|prosecutor|law school|school of law|universit(y|ies)|college|law librar(y|ies)|legal runner|referral|runners?|public defender|sheriff|police|mediation|collection agenc|translation|apostille|immigration (services|consult)|tax (prep|services)|bankruptcy (petition|prep)|lawn|lawnmower|pawn)\b", re.I)
AGGREGATORS = {'avvo.com','lawyers.com','justia.com','findlaw.com','martindale.com','yelp.com','facebook.com','instagram.com','linkedin.com','yellowpages.com','superpages.com','mapquest.com','bbb.org','google.com','nolo.com','lawinfo.com','linktr.ee','wixsite.com','business.site','godaddysites.com','sites.google.com','weebly.com','squarespace.com','wordpress.com'}

def latest_release():
    x = urllib.request.urlopen(BASE + '?list-type=2&prefix=release/&delimiter=/', timeout=30).read().decode()
    rel = sorted(re.findall(r'<Prefix>(release/[^<]+/)</Prefix>', x))
    return rel[-1]

def list_files(release):
    keys, tok = [], None
    while True:
        u = BASE + '?list-type=2&prefix=' + urllib.parse.quote(release + 'theme=places/type=place/', safe='/') + ('&continuation-token=' + urllib.parse.quote(tok) if tok else '')
        x = urllib.request.urlopen(u, timeout=60).read().decode()
        keys += re.findall(r'<Key>([^<]+)</Key>', x)
        m = re.search(r'<NextContinuationToken>([^<]+)</NextContinuationToken>', x)
        if not m: break
        tok = m.group(1)
    return [BASE + urllib.parse.quote(k, safe='/=') for k in keys if k.endswith('.parquet')]

def phone10(p):
    d = re.sub(r'\D', '', p or '')
    if len(d) == 11 and d[0] == '1': d = d[1:]
    return d if len(d) == 10 else ''

def show_phone(d): return f'({d[:3]}) {d[3:6]}-{d[6:]}'

def domain_of(u):
    if not u: return ''
    u = u.strip().lower()
    if not re.match(r'^https?://', u): u = 'http://' + u
    h = urllib.parse.urlparse(u).netloc.split(':')[0]
    return re.sub(r'^www\.', '', h)

def site_of(u):
    d = domain_of(u)
    return 'https://' + d + '/' if d else ''

SUFFIXES = {'pa', 'pl', 'plc', 'pllc', 'llp', 'llc', 'pc', 'lc', 'plc', 'lp', 'ii', 'iii', 'iv', 'esq', 'jd', 'dba'}

def _word(w, first):
    m = re.match(r"^([^A-Za-z0-9&]*)(.*?)([^A-Za-z0-9&]*)$", w)
    pre, core, post = m.groups()
    core_l = core.lower().replace('.', '')
    if core_l in SUFFIXES: core = core_l.upper() if core_l != 'dba' else 'dba'
    elif core_l in {'of', 'and', 'the', 'at', 'in', 'for'} and not first: core = core.lower()
    elif core_l.startswith('mc') and len(core) > 2: core = 'Mc' + core[2:].capitalize()
    else: core = '-'.join(x.capitalize() for x in core.split('-'))
    return pre + core + post

def tidy_name(n):
    n = re.sub(r'\s+', ' ', (n or '').strip())
    if n.isupper() or n.islower():
        n = ' '.join(_word(w, i == 0) for i, w in enumerate(n.split()))
    # business suffixes are always upper case, whatever the source did ("Pllc" -> "PLLC")
    def suf(m):
        return m.group(1) + m.group(2).replace('.', '').upper() + m.group(3)
    return re.sub(r"(^|[\s,])((?:p\.?a\.?|p\.?l\.?|plc|p\.?l\.?l\.?c\.?|l\.?l\.?p\.?|l\.?l\.?c\.?|p\.?c\.?|l\.?c\.?))($|[\s,.;:])", suf, n, flags=re.I)

def title_city(c): return ' '.join(w.capitalize() for w in (c or '').split())

STATES = ('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY').split()

def clean_and_pick(st, raw, target, min_conf):
    """cleaning rules for one state's raw rows -> (clean list, picked list, removal stats, per-city counter)"""
    stats = collections.Counter(); keep = []
    for r in raw:
        name = tidy_name(r['name']); d = domain_of(r['website']); ph = phone10(r['phone'])
        if not name: stats['no name'] += 1; continue
        if NOT_A_FIRM.search(name): stats['not a law firm (name)'] += 1; continue
        if not FIRM_WORDS.search(name): stats['looks like a person, not a firm'] += 1; continue
        if not r['street'] or not r['city']: stats['no address'] += 1; continue
        if not ph: stats['no valid phone'] += 1; continue
        if not d or d in AGGREGATORS or any(d.endswith('.' + g) for g in AGGREGATORS): stats['no own website'] += 1; continue
        if (r['confidence'] or 0) < min_conf: stats['low confidence'] += 1; continue
        keep.append({'name': name, 'street': re.sub(r'\s+', ' ', r['street']).strip(), 'city': title_city(r['city']), 'state': st, 'zip': (r['zip'] or '')[:5],
                     'phone': show_phone(ph), 'phone_raw': ph, 'website': site_of(r['website']), 'domain': d, 'email': r['email'] or '', 'socials': '|'.join(r['socials'] or []),
                     'confidence': round(r['confidence'] or 0, 2), 'lat': round(r['lat'], 5), 'lng': round(r['lng'], 5), 'overture_id': r['id'], 'category': r['cat']})
    def rank(x): return (x['confidence'], 1 if re.search(r'\b(law|legal|firm|attorneys|lawyers)\b', x['name'], re.I) else 0, -len(x['name']))
    byd = {}
    for x in sorted(keep, key=rank, reverse=True):
        if x['domain'] in byd: stats['duplicate website'] += 1; continue
        byd[x['domain']] = x
    byp = {}
    for x in sorted(byd.values(), key=rank, reverse=True):
        if x['phone_raw'] in byp: stats['duplicate phone'] += 1; continue
        byp[x['phone_raw']] = x
    seen = set(); clean = []
    for x in sorted(byp.values(), key=rank, reverse=True):
        k = (re.sub(r'[^a-z0-9]', '', x['name'].lower()), x['city'].lower())
        if k in seen: stats['duplicate name in city'] += 1; continue
        seen.add(k); clean.append(x)
    cap = max(5, int(target * 0.15)); per = collections.Counter(); picked = []
    for x in sorted(clean, key=lambda x: (x['confidence'], 1 if x['email'] else 0, 1 if x['socials'] else 0), reverse=True):
        if per[x['city']] >= cap: continue
        picked.append(x); per[x['city']] += 1
        if len(picked) >= target: break
    return clean, picked, stats, per

def write_state(st, clean, picked):
    out = os.path.join('data', 'states', st); os.makedirs(out, exist_ok=True)
    fields = list(clean[0].keys()) if clean else ['name']
    for fn, data in (('candidates.csv', clean), ('selected.csv', picked)):
        with open(os.path.join(out, fn), 'w', newline='') as f:
            w = csv.DictWriter(f, fieldnames=fields); w.writeheader(); w.writerows(data)

def fetch(con, lst, where_geo, spool=None):
    """Read the matching rows. With `spool` (a file path) the result is first written to a local parquet file, so a country-wide read does not have to fit in memory."""
    q = f"""SELECT id, names.primary AS name, taxonomy.primary AS cat, addresses[1].freeform AS street, addresses[1].locality AS city, addresses[1].postcode AS zip, addresses[1].region AS region,
        phones[1] AS phone, websites[1] AS website, emails[1] AS email, socials AS socials, confidence, ST_Y(geometry) AS lat, ST_X(geometry) AS lng
      FROM read_parquet({lst})
      WHERE {where_geo} AND (operating_status IS NULL OR operating_status = 'open')
        AND (taxonomy.primary IN ('attorney_or_law_firm','legal_service') OR taxonomy.primary LIKE '%\\_law' ESCAPE '\\' OR list_contains(taxonomy.hierarchy, 'lawyer'))"""
    if spool:
        os.makedirs(os.path.dirname(spool), exist_ok=True)
        con.execute("SET memory_limit='2GB'; SET threads=2;")
        con.execute(f"COPY ({q}) TO '{spool}' (FORMAT PARQUET)")
        q = f"SELECT * FROM read_parquet('{spool}')"
    rows = con.execute(q).fetchall(); cols = [d[0] for d in con.description]
    return [dict(zip(cols, r)) for r in rows]

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('state', help="a state code like FL, or ALL for every state"); ap.add_argument('--target', type=int, default=500); ap.add_argument('--min-conf', type=float, default=0.65)
    a = ap.parse_args(); st = a.state.upper()
    rel = latest_release(); print('Overture release:', rel)
    files = list_files(rel); print(len(files), 'files')
    con = duckdb.connect(); con.execute('INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;')
    lst = '[' + ','.join("'" + u + "'" for u in files) + ']'
    if st == 'ALL':
        # contiguous US, Alaska and Hawaii boxes keep the read fast; the exact state comes from each place's own address
        geo = "((bbox.xmin BETWEEN -125.1 AND -66.5 AND bbox.ymin BETWEEN 24.3 AND 49.5) OR (bbox.xmin BETWEEN -171 AND -129 AND bbox.ymin BETWEEN 51 AND 72) OR (bbox.xmin BETWEEN -161 AND -154 AND bbox.ymin BETWEEN 18.5 AND 22.5)) AND addresses[1].country = 'US'"
        raw_all = fetch(con, lst, geo, spool='data/states/_us_raw.parquet'); print('raw US rows:', len(raw_all), flush=True)
        by = collections.defaultdict(list)
        for r in raw_all:
            if r['region'] in STATES: by[r['region']].append(r)
        print(f"{'state':5} {'raw':>7} {'clean':>7} {'picked':>7}")
        total = 0
        for s_ in STATES:
            clean, picked, stats, per = clean_and_pick(s_, by.get(s_, []), a.target, a.min_conf)
            if clean: write_state(s_, clean, picked)
            total += len(clean); print(f'{s_:5} {len(by.get(s_, [])):7d} {len(clean):7d} {len(picked):7d}', flush=True)
        print('total clean firms in the US:', total); return
    box = BBOX.get(st)
    where_box = f'bbox.xmin BETWEEN {box[0]} AND {box[1]} AND bbox.ymin BETWEEN {box[2]} AND {box[3]} AND' if box else ''
    raw = fetch(con, lst, f"{where_box} addresses[1].region = '{st}'"); print('raw rows:', len(raw))
    clean, picked, stats, per = clean_and_pick(st, raw, a.target, a.min_conf)
    print('after cleaning:', len(clean)); write_state(st, clean, picked)
    print('\nRemoved along the way:'); [print(f'  {v:6d}  {k}') for k, v in stats.most_common()]
    print(f'\nPicked {len(picked)} of {len(clean)} clean firms. Files in data/states/{st}/')

if __name__ == '__main__':
    main()
