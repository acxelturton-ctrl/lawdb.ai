#!/usr/bin/env python3
"""Step 4 of the US firm pipeline: turn a state's selected firms (selected.csv) and what the crawler found (enriched.jsonl) into SQL for the site's database.

Usage: python3 tools/us-data/build_import_sql.py FL
Out:   data/states/<ST>/import.sql   (INSERT OR IGNORE rows for firms, firm_feeds and firm_posts; safe to run twice. Not committed to git.)

Firms that block crawlers, or that the crawler could not read, are still listed with their basic facts (name, address, phone, website, map position).
Descriptions ('about') are left empty on purpose: a page without a real, original description stays out of search engines until it has one.
"""
import csv, json, os, re, sys, unicodedata, datetime, email.utils
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bios import make_biography, MIN_WORDS, MIN_FACTS
from profile_facts import extract as extract_facts, count_facts, lawyer_list

ST = (sys.argv[1] if len(sys.argv) > 1 else 'FL').upper()
KEEP = int(sys.argv[sys.argv.index('--keep') + 1]) if '--keep' in sys.argv else 0   # 0 = keep every picked firm; N = only the first N that can go live (the rest are dropped)
D = os.path.join('data', 'states', ST)

# practice area label (from the crawler) -> the site's ten case types (ids used by search and the case pages)
CASE = {'Personal injury': 'injury', 'Car accidents': 'injury', 'Wrongful death': 'injury', 'Medical malpractice': 'injury', 'Insurance claims': 'injury',
        'Criminal defense': 'criminal', 'DUI': 'criminal', 'Traffic tickets': 'traffic', 'Family law': 'family', 'Immigration': 'immigration',
        'Wills, trusts & probate': 'wills', 'Elder law': 'wills', 'Real estate': 'realestate', 'Employment': 'employment', 'Workers’ compensation': 'employment',
        'Business & corporate': 'business', 'Intellectual property': 'business', 'Tax law': 'business', 'Civil litigation': 'litigation'}
TAG = {'Wills, trusts & probate': 'Wills, Trusts & Probate', 'Workers’ compensation': 'Workers’ Compensation', 'Business & corporate': 'Business & Corporate', 'Social Security disability': 'Social Security Disability'}
LANGS = {'Spanish', 'French', 'Russian', 'Arabic', 'Mandarin', 'Portuguese', 'Hebrew', 'Haitian Creole'}

REGIONS = json.load(open(os.path.join(os.path.dirname(__file__), 'regions.json')))
STATE_NAMES = json.load(open(os.path.join(os.path.dirname(__file__), 'state_names.json')))

def region_nearest(st, lat, lng):
    if st not in REGIONS: return ''
    return min(REGIONS[st]['regions'], key=lambda r: (r['lat'] - lat) ** 2 + ((r['lng'] - lng) * 0.85) ** 2)['id']

def region_if_near(st, rid, lat, lng, miles=50):
    """The region's name goes into a firm's description only when the firm is within `miles` of its centre; far-off firms get no region sentence rather than a wrong one."""
    if st == 'FL' or st not in REGIONS: return rid
    c = next((r for r in REGIONS[st]['regions'] if r['id'] == rid), None)
    if not c: return ''
    import math
    dy = (lat - c['lat']) * 69.0; dx = (lng - c['lng']) * 69.0 * math.cos(math.radians(lat))
    return rid if math.hypot(dx, dy) <= miles else ''

def region_of(lat, lng):
    if lat < 27.0 and lng > -81.3: return 'fl-south'
    if lat < 27.1 and lng <= -81.3: return 'fl-southwest'
    if 27.0 <= lat < 28.2 and lng < -82.0: return 'fl-tampa-bay'
    if lat >= 29.4 and lng < -83.0: return 'fl-panhandle'
    if lat >= 29.4: return 'fl-north'
    if 27.0 <= lat < 29.4 and -82.4 <= lng < -80.0 and not (lat < 27.8 and lng > -81.0): return 'fl-central'
    if lat < 27.8: return 'fl-treasure'
    return 'fl-central'

def slugify(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower().replace('&', ' and ')
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', s)).strip('-')

def q(v):
    if v is None: return 'NULL'
    if isinstance(v, (int, float)): return str(v)
    return "'" + str(v).replace("'", "''") + "'"

def when(s):
    if not s: return None
    try:
        t = email.utils.parsedate_to_datetime(s)
    except Exception:
        try: t = datetime.datetime.fromisoformat(s.replace('Z', '+00:00'))
        except Exception: return None
    if t.tzinfo: t = t.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    return t

rows = list(csv.DictReader(open(os.path.join(D, 'selected.csv'))))
# a second look at names, for crawls made before the pull learned a rule, and for listings a person judged not to be a law firm
from pull_overture import NOT_A_FIRM, NAMELESS, MANUAL_NOT_FIRMS
rows = [r for r in rows if not (NOT_A_FIRM.search(r['name']) or NAMELESS.match(r['name'].strip()) or r['name'].strip().lower() in MANUAL_NOT_FIRMS)]
enr = {}
press = json.load(open(os.path.join(D, 'press.json'))) if os.path.exists(os.path.join(D, 'press.json')) else {}   # coverage found on other sites (press.py)
gr = json.load(open(os.path.join(D, 'reviews.json'))) if os.path.exists(os.path.join(D, 'reviews.json')) else {}   # three good Google reviews per firm (google_reviews.py)
import google_reviews, bar
REVIEWS_REQUIRED = google_reviews.required(); HOURS_REQUIRED = bar.hours_required(); SEO_MIN = bar.seo_min()
p = os.path.join(D, 'enriched.jsonl')
if os.path.exists(p):
    for l in open(p):
        try: j = json.loads(l); enr[j['overture_id']] = j
        except Exception: pass
now = datetime.datetime.utcnow(); fresh = now - datetime.timedelta(days=365)
out = ['-- generated by tools/us-data/build_import_sql.py; safe to run twice (INSERT OR IGNORE)']
outcome = {}   # overture_id -> kept | skip | extra (good, but over the --keep cap, so left for a later run)
live_rows = []; perk_rows = []; bios = {}; used = set(); stats = dict(firms=0, logos=0, covers=0, feeds=0, posts=0, with_areas=0, no_hours=0, no_lawyers=0)
for r in rows:
    e = enr.get(r['overture_id'], {}) if enr else {}
    e = e if e.get('ok') else {}
    base = slugify(f"{r['name']} {r['city']} {ST}")[:84].strip('-')
    slug, i = base, 2
    while slug in used: slug = f'{base}-{i}'; i += 1
    used.add(slug)
    areas = e.get('practice_areas') or []
    case_types = sorted({CASE[a] for a in areas if a in CASE})
    tags = [TAG.get(a, a.title() if a.islower() else a) for a in areas][:6]
    lat, lng = float(r['lat']), float(r['lng'])
    addr = f"{r['street']}, {r['city']}, {ST} {r['zip']}".strip().rstrip(',')
    words = [w for w in re.split(r'\W+', r['name']) if w]
    initials = (words[0][0] + (words[1][0] if len(words) > 1 else '')).upper()
    rec = {'slug': slug, 'name': r['name'], 'city': r['city'], 'state': ST, 'region': region_of(lat, lng) if ST == 'FL' else region_nearest(ST, lat, lng), 'featured': False,
           'tags': tags, 'caseTypes': case_types, 'lat': lat, 'lng': lng, 'address': addr, 'phone': '+1' + r['phone_raw'], 'rating': 0, 'count': 0,
           'website': 'https://' + r['domain'], 'type': 'mono', 'initials': initials, 'color': '#3a3a3a',
           'mapsUrl': 'https://www.google.com/maps/search/' + re.sub(r'%20', '+', __import__('urllib.parse').parse.quote(f"{r['name']} {r['city']} {STATE_NAMES.get(ST, ST)}")),
           'dirUrl': 'https://www.google.com/maps/dir/?api=1&destination=' + re.sub(r'%20', '+', __import__('urllib.parse').parse.quote(addr)),
           'blurb': (f"{tags[0]} in {r['city']}." if tags else f"Law firm in {r['city']}.")}
    lg = e.get('logo')
    if lg and lg.get('url', '').startswith('https://'): rec['type'] = 'logo'; rec['src'] = lg['url']; stats['logos'] += 1
    cv = e.get('cover')
    if cv and cv.get('url', '').startswith('https://'): rec['heroImage'] = cv['url']; stats['covers'] += 1
    if e.get('socials'): rec['social'] = e['socials']
    det = {}
    langs = [l for l in (e.get('languages') or []) if l in LANGS]
    if 'Haitian Creole' in langs: langs[langs.index('Haitian Creole')] = 'Haitian Creole'
    if langs: det['languages'] = langs
    since = (e.get('facts') or {}).get('since')
    if since and 1850 <= since <= now.year: det['founded'] = since
    if det: rec['details'] = det
    # what the firm's own website says about consultations and hours (shown as chips and used by the AI filters)
    fx = e.get('facts') or {}
    perks = {k: True for k, src in (('free', 'free_consultation'), ('contingency', 'contingency'), ('h24', 'available_24_7'), ('virtual', 'virtual_consultations')) if fx.get(src)}
    if perks: rec['perks'] = perks
    if areas: stats['with_areas'] += 1
    has_pics = bool(rec.get('src') and rec.get('heroImage'))
    facts = extract_facts(e, r['name'], r['city']) if e else {}
    pr = press.get(r['overture_id']) or []
    about = make_biography(slug, r['name'], r['city'], ST, region_if_near(ST, rec['region'], lat, lng), areas, facts, pr) if (has_pics and areas) else None
    # The bar for a firm to appear on the site: its own site was read; logo and cover photo; practice areas; a real biography; opening hours listed; and a named lawyer.
    hours = e.get('hours') if e else None
    lawyers = lawyer_list(facts, e or {})
    has_lawyers = bool(lawyers)
    if not hours: stats['no_hours'] += 1
    if not has_lawyers: stats['no_lawyers'] += 1
    rv = gr.get(r['overture_id']) or {}
    has_google = len(rv.get('items') or []) >= google_reviews.WANT
    testi = (e.get('testimonials') or [])[:5]   # client testimonials the firm posts on its own website (testimonials.py)
    has_reviews = bar.has_reviews(rv.get('items'), testi)
    if not has_reviews: stats['no_reviews'] = stats.get('no_reviews', 0) + 1
    seo = bar.seo_score(len(areas), len(about.split()) if about else 0, count_facts(facts, pr), len(lawyers), bool(hours), bool(rec.get('social')), bool(pr or facts.get('awards')), has_reviews, bar.extras_points(e))
    if e.get('directories'): rec['directories'] = e['directories']   # the firm's profiles on legal directories
    rec['seo'] = seo   # saved on the firm: the audit and the admin can see why it was listed
    if seo < SEO_MIN: stats['low_seo'] = stats.get('low_seo', 0) + 1
    is_live = bool(about and len(about.split()) >= MIN_WORDS and count_facts(facts, pr) >= MIN_FACTS and (hours or not HOURS_REQUIRED) and has_lawyers and (has_reviews or not REVIEWS_REQUIRED) and seo >= SEO_MIN)
    if lawyers: rec.setdefault('details', {})['lawyers'] = lawyers   # shown on the firm's Lawyers tab and in its structured data
    if pr: rec['press'] = pr
    if has_google: rec['reviews'] = rv; rec['rating'] = rv.get('rating') or 0; rec['count'] = rv.get('count') or 0   # shown on the page with Google named as the source
    if testi: rec['testimonials'] = testi   # shown on the page as the firm's own words, from its website
    if facts.get('awards'): rec['awards'] = facts['awards']
    if not is_live: about = None
    if KEEP and not is_live: outcome[r['overture_id']] = 'skip'; continue
    if KEEP and len(live_rows) >= KEEP: outcome[r['overture_id']] = 'extra'; continue
    outcome[r['overture_id']] = 'kept' if is_live else 'skip'
    if about: bios[slug] = about
    if perks: perk_rows.append((slug, perks))
    out.append('INSERT OR IGNORE INTO firms (slug,name,city,state,region,featured,rating,review_count,lat,lng,data,hours,about,page_mode,status,created_by) VALUES ('
               + ','.join([q(slug), q(r['name']), q(r['city']), q(ST), q(rec['region']), '0', (q(rec['rating']) if has_google else 'NULL'), (q(rec['count']) if has_google else 'NULL'), q(lat), q(lng), q(json.dumps(rec, ensure_ascii=False, separators=(',', ':'))), (q(json.dumps(hours, separators=(',', ':'))) if hours else 'NULL'), q(about), "'dynamic'", "'live'" if is_live else "'hidden'", 'NULL']) + ');')
    stats['firms'] += 1
    if is_live: live_rows.append((r['city'], lat, lng, rec['region']))
    feed = e.get('blog_feed')
    posts = [p for p in (e.get('posts') or []) if p.get('image') and p.get('title') and p.get('url')]
    newest = max([when(p.get('date')) for p in posts if when(p.get('date'))] or [None], key=lambda t: t or datetime.datetime.min)
    if feed and newest and newest >= fresh:
        out.append(f"INSERT OR IGNORE INTO firm_feeds (firm_slug,feed_url,source,enabled,status,kind,page_only) VALUES ({q(slug)},{q(feed['url'])},'auto',1,'pending','rss',0);")
        stats['feeds'] += 1
        for p in posts[:4]:
            t = when(p.get('date'))
            if not t or t < fresh: continue
            out.append('INSERT OR IGNORE INTO firm_posts (firm_slug,guid,title,url,published_at,excerpt,image_url) VALUES ('
                       + ','.join([q(slug), q(p['url']), q(p['title'][:200]), q(p['url']), q(t.strftime('%Y-%m-%d %H:%M:%S')), q((p.get('excerpt') or '')[:600]), q(p['image'])]) + ');')
            stats['posts'] += 1
open(os.path.join(D, 'import.sql'), 'w').write('\n'.join(out) + '\n')
# one UPDATE per biography, for firms already in the database (only where no biography exists yet)
with open(os.path.join(D, 'bios.sql'), 'w') as f:
    for sl, ab in bios.items(): f.write(f"UPDATE firms SET about = {q(ab)} WHERE slug = {q(sl)} AND about IS NULL;\n")
json.dump(bios, open(os.path.join(D, 'bios.json'), 'w'), ensure_ascii=False, indent=1)
json.dump(outcome, open(os.path.join(D, 'outcome.json'), 'w'))
# the same facts as one UPDATE per firm, for firms already in the database
with open(os.path.join(D, 'perks.sql'), 'w') as f:
    for sl, pk in perk_rows: f.write(f"UPDATE firms SET data = json_set(data, '$.perks', json({q(json.dumps(pk, separators=(',', ':')))})) WHERE slug = {q(sl)};\n")
# the firms that go live (logo + cover photo): the Find page lists only their cities
with open(os.path.join(D, 'live.csv'), 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['city', 'lat', 'lng', 'region']); w.writerows(live_rows)
print(stats, 'live:', len(live_rows), '->', os.path.join(D, 'import.sql'), os.path.getsize(os.path.join(D, 'import.sql')) // 1024, 'KB')
