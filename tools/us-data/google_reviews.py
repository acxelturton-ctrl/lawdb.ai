#!/usr/bin/env python3
"""Google reviews for firms: the three best, from Google's own Places API (never scraped).

Usage:
  python3 tools/us-data/google_reviews.py ST                         the drip: reads data/states/ST/selected.csv, writes data/states/ST/reviews.json
  python3 tools/us-data/google_reviews.py backfill [--states "TX FL"] [--stale-days 25] [--limit N] [--load]
                                                                      firms already in the database: finds the Google place, takes the three best reviews,
                                                                      writes data/states/REF/reviews.sql (and runs it with --load)
Needs GOOGLE_PLACES_API_KEY (Places API (New) switched on in Google Cloud). Without the key nothing is fetched and nothing is changed.

What counts as a good review: 4 or 5 stars, written in English, at least 80 characters, no more than 1500. Of the (up to five) reviews the API returns for a place,
the three with the best score (stars first, then length up to a point, then how recent) are kept, word for word. A firm needs three of them to meet the bar.
The place must be the firm: its Google website has to be the firm's domain, or the phone number has to match.
Google's rules: the reviews are shown with Google as the source, the reviewer's name and a link to the place; the API content may be kept for 30 days, so each
firm is refreshed before that (the Google reviews workflow runs monthly) and the page hides reviews older than 35 days.
Cost: one Text Search (Enterprise + Atmosphere) request per firm, about 35 US dollars per 1,000 firms.
"""
import argparse, concurrent.futures, csv, datetime, json, os, re, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
from pull_overture import domain_of

KEY = os.environ.get('GOOGLE_PLACES_API_KEY', '')
URL = 'https://places.googleapis.com/v1/places:searchText'
FIELDS = 'places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.rating,places.userRatingCount,places.googleMapsUri,places.reviews'
WANT = 3
MIN_CHARS, MAX_CHARS = 80, 1500


def required():
    """True once tools/us-data/reviews_required.txt says yes: from then on a firm needs three good Google reviews to go live (and to stay live in the audit)"""
    try: return open(os.path.join(HERE, 'reviews_required.txt')).read().strip().lower() == 'yes'
    except OSError: return False


def digits10(s):
    d = re.sub(r'\D', '', s or '')
    return d[-10:] if len(d) >= 10 else ''


def is_match(place, domain, phone):
    """the Google place is this firm: same website domain, or the same phone number"""
    site = domain_of(place.get('websiteUri') or '')
    if site and domain and (site == domain or site.endswith('.' + domain) or domain.endswith('.' + site)): return True
    p = digits10(place.get('nationalPhoneNumber')) or digits10(place.get('internationalPhoneNumber'))
    return bool(p and phone and p == phone)


def score(rv, now):
    """higher is better: stars first, then a fuller review (up to 400 characters), then a recent one"""
    text = ((rv.get('text') or {}).get('text') or rv.get('originalText', {}).get('text') or '').strip()
    stars = rv.get('rating') or 0
    age_days = 0
    try:
        t = datetime.datetime.fromisoformat((rv.get('publishTime') or '').replace('Z', '+00:00'))
        age_days = max(0, (now - t).days)
    except Exception: age_days = 3650
    return stars * 1000 + min(len(text), 400) - min(age_days, 3650) / 30


def pick_reviews(reviews, now=None, n=WANT):
    """the n best usable reviews from what the API returned, as {author, authorUrl, rating, text, when}; fewer than n if there are not enough good ones"""
    now = now or datetime.datetime.now(datetime.timezone.utc)
    ok = []
    for rv in reviews or []:
        t = rv.get('text') or {}
        text = (t.get('text') or '').strip()
        if (rv.get('rating') or 0) < 4 or not (MIN_CHARS <= len(text) <= MAX_CHARS): continue
        if t.get('languageCode') and not str(t['languageCode']).lower().startswith('en'): continue
        a = rv.get('authorAttribution') or {}
        if not (a.get('displayName') or '').strip(): continue
        ok.append((score(rv, now), {'author': a['displayName'].strip()[:60], 'authorUrl': a.get('uri') or '', 'rating': int(rv['rating']), 'text': text,
                                    'when': (rv.get('relativePublishTimeDescription') or '')[:40], 'time': (rv.get('publishTime') or '')[:10]}))
    ok.sort(key=lambda x: -x[0])
    return [r for _, r in ok[:n]]


def package(place, picked, today=None):
    today = today or datetime.date.today().isoformat()
    return {'placeId': place.get('id') or '', 'mapsUrl': place.get('googleMapsUri') or '', 'rating': place.get('rating') or 0, 'count': place.get('userRatingCount') or 0,
            'fetchedAt': today, 'items': picked}


def search(name, city, st, lat=None, lng=None):
    body = {'textQuery': f'{name} {city} {st}', 'maxResultCount': 3, 'regionCode': 'US', 'languageCode': 'en'}
    if lat is not None and lng is not None:
        body['locationBias'] = {'circle': {'center': {'latitude': float(lat), 'longitude': float(lng)}, 'radius': 3000.0}}
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': FIELDS})
    with urllib.request.urlopen(req, timeout=30) as r: return json.load(r).get('places', [])


def reviews_for(name, city, st, domain, phone, lat=None, lng=None):
    """-> the reviews package (items may be empty when the place or enough good reviews were not found); None when the request failed"""
    try: places = search(name, city, st, lat, lng)
    except Exception as e:
        print('  places request failed:', repr(e)[:160], flush=True); return None
    for pl in places:
        if is_match(pl, domain, digits10(phone)): return package(pl, pick_reviews(pl.get('reviews')))
    return package({}, [])


def run_drip(st):
    path = os.path.join(ROOT, 'data', 'states', st, 'selected.csv')
    out = os.path.join(ROOT, 'data', 'states', st, 'reviews.json')
    if not KEY: print('GOOGLE_PLACES_API_KEY is not set: no reviews fetched.'); json.dump({}, open(out, 'w')); return
    rows = list(csv.DictReader(open(path)))
    def one(r): return r['overture_id'], reviews_for(r['name'], r['city'], st, r.get('domain') or domain_of(r.get('website')), r.get('phone_raw') or r.get('phone'), r.get('lat') or None, r.get('lng') or None)
    res = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        for oid, pkg in ex.map(one, rows):
            if pkg is not None: res[oid] = pkg
    json.dump(res, open(out, 'w'))
    good = sum(1 for p in res.values() if len(p['items']) >= WANT)
    print(f'{st}: Google reviews fetched for {len(res)} of {len(rows)} firms, {good} with {WANT} good reviews')


def run_backfill(a):
    from refresh import d1, q
    if not KEY: print('GOOGLE_PLACES_API_KEY is not set: nothing to do.'); return
    where = "status = 'live'" + (' AND state IN (' + ','.join("'" + s + "'" for s in a.states.split()) + ')' if a.states else '')
    cutoff = (datetime.date.today() - datetime.timedelta(days=a.stale_days)).isoformat()
    rows = d1(f"SELECT slug, name, city, state, data FROM firms WHERE {where} AND COALESCE(json_extract(data, '$.reviews.fetchedAt'), '') < '{cutoff}' ORDER BY slug", json_out=True)[0]['results']
    if a.limit: rows = rows[:a.limit]
    print(f'{len(rows)} firms to fetch', flush=True)
    def one(r):
        rec = json.loads(r['data'])
        return r, reviews_for(r['name'], r['city'], r['state'], domain_of(rec.get('website')), rec.get('phone'), rec.get('lat'), rec.get('lng'))
    sql = []; good = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        for r, pkg in ex.map(one, rows):
            if pkg is None: continue
            if len(pkg['items']) >= WANT: good += 1
            patch = json.dumps({'rating': pkg['rating'] or 0, 'count': pkg['count'] or 0, 'reviews': pkg}, ensure_ascii=False, separators=(',', ':'))   # data.rating / data.count are what the page shows
            sql.append(f"UPDATE firms SET rating = {float(pkg['rating'] or 0)}, review_count = {int(pkg['count'] or 0)}, data = json_patch(data, json({q(patch)})) WHERE slug = {q(r['slug'])};")
    d = os.path.join(ROOT, 'data', 'states', 'REF'); os.makedirs(d, exist_ok=True)
    p = os.path.join(d, 'reviews.sql'); open(p, 'w').write('\n'.join(sql) + '\n')
    print(f'{len(sql)} firms written, {good} with {WANT} good reviews -> {p}')
    if a.load and sql:
        for i in range(0, len(sql), 150):   # a few statements at a time keeps each wrangler call small
            chunk = os.path.join(d, 'reviews_part.sql'); open(chunk, 'w').write('\n'.join(sql[i:i + 150]) + '\n'); d1(file=chunk)
        print('loaded')


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'backfill':
        ap = argparse.ArgumentParser(); ap.add_argument('cmd'); ap.add_argument('--states', default=''); ap.add_argument('--stale-days', type=int, default=25)
        ap.add_argument('--limit', type=int, default=0); ap.add_argument('--load', action='store_true')
        run_backfill(ap.parse_args())
    elif len(sys.argv) > 1: run_drip(sys.argv[1].upper())
    else: print(__doc__)
