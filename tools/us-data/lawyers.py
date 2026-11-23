#!/usr/bin/env python3
"""Step 4 of the US firm pipeline: find the lawyers each firm shows on its own website and keep the ones that have a real profile photo.

Usage: python3 tools/us-data/lawyers.py https://lawdb.ai --out data/lawyers/FL.jsonl --sql data/lawyers/FL.sql [--limit 20] [--workers 6]
In:    the live site's address (it reads the live firms from /api/firms) or a firms.json file: a list of {"slug", "name", "site", "city", "state"}
Out:   <out>.jsonl one object per lawyer kept, and <sql> INSERT OR IGNORE statements for the `lawyers` table (migrations/0003_lawyers.sql); each lawyer keeps the firm that names them and gets the address /lawyers/<name>-<city>-<state>.

What is collected is only what the firm publishes on that lawyer's own page: name, title, photo address, a direct phone or email if the page shows one,
personal social profiles, and the practice areas the page mentions. No biography text is kept (the site writes its own, src/lib/lawyer-bio.js).
Rules that keep it honest:
 - A lawyer is kept only with a photo that passed the checks below: it downloads as a real image, is at least 200 px on each side, is not a near-blank picture,
   and is not the same picture as another lawyer's at that firm (a shared placeholder or team photo).
 - A page counts as a lawyer's only if it says so (an attorney-type title or "attorney at law", "Esq.", "admitted to the bar" ...); staff are skipped.
 - The firm's own phone, general email and social accounts (the ones on its home page) are never attached to a person.
Polite by design, as in enrich.py: robots.txt, an identifying User-Agent, one request a second per site, hard timeouts and size caps.
"""
import argparse, hashlib, io, json, os, re, sys, urllib.parse, concurrent.futures as cf
from bs4 import BeautifulSoup
import enrich as E  # Site (robots, rate limit), clean_social, jsonld, image_candidates, JUNK_IMG, PRACTICE_RX

TEAM_PATHS = ['/attorneys', '/our-attorneys', '/lawyers', '/our-lawyers', '/team', '/our-team', '/people', '/professionals', '/attorneys/']
TEAM_HINT = re.compile(r'(attorney|lawyer|our[- ]team|meet[- ]the|people|professionals|our[- ]firm/team|/team)', re.I)
PROFILE_HINT = re.compile(r'/(attorney|lawyer|team|people|professional|bio|profile|staff|our-team|our-attorneys|attorneys|lawyers)s?/[^/?#]+', re.I)
LAWYER_TITLE = re.compile(r'\b(attorney|lawyer|partner|associate|counsel|shareholder|founder|principal|managing|owner|of counsel|trial)\b', re.I)
STAFF_TITLE = re.compile(r'\b(paralegal|assistant|secretary|manager|administrator|staff|receptionist|coordinator|clerk|investigator|intake|marketing|bookkeeper|office)\b', re.I)
LAWYER_PROOF = re.compile(r'(attorney at law|esq\.?\b|admitted to (the )?(florida|texas|state|federal)|bar admission|licensed to practice|member of the (florida|texas|state) bar|j\.?d\.? from|juris doctor)', re.I)
NOT_A_NAME = re.compile(r'\b(law|llp|lawyers?|attorneys?|team|contact|about|office|group|professional|corporation|services?|practice|our|the|and|call|email|read|more|learn|view|home|news|blog|firm|staff|meet)\b', re.I)
GENERIC_MAIL = re.compile(r'^(info|contact|office|admin|hello|mail|help|support|team|law|reception|intake|inquiries|inquiry|frontdesk|sales|marketing|billing|webmaster|service|services)$', re.I)
PHOTO_HINT = re.compile(r'(headshot|portrait|attorney|lawyer|bio|profile|team|people|staff|photo)', re.I)
MIN_SIDE, MAX_IMG_BYTES = 200, 3 * 1024 * 1024
MAX_PROFILES_PER_FIRM, MAX_TEAM_PAGES = 30, 3
MAX_LAWYERS_PER_FIRM = 10   # the Firm plan lists up to ten; the firm's own order on its team page decides which

def slugify(name):
    import unicodedata
    s = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')[:60]

def clean_name(raw):
    n = re.sub(r'\s+', ' ', (raw or '')).strip()
    n = re.split(r',|\||\s[-–—]\s|\(', n)[0].strip()                       # "Jane Roe, Esq." / "Jane Roe | Smith Law" -> "Jane Roe"
    n = re.sub(r'^(Attorney|Mr|Ms|Mrs|Dr|Hon)\.?\s+', '', n, flags=re.I)
    if not re.fullmatch(r"[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+(?: [A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]*){1,3}", n) or NOT_A_NAME.search(n): return None
    return n

def digits10(s):
    d = re.sub(r'\D', '', s or '')
    if len(d) == 11 and d[0] == '1': d = d[1:]
    return d if len(d) == 10 else ''

def check_image(site, url):
    """download and verify a photo: (final_url, sha1) or None. Real image, >=200px each side, sensible shape, not near-blank, <=3MB."""
    got = site.get(url, binary=True)
    if not got or len(got[1]) > MAX_IMG_BYTES or len(got[1]) < 4000: return None
    try:
        from PIL import Image, ImageStat
        im = Image.open(io.BytesIO(got[1])); im.load()
        w, h = im.size
        if min(w, h) < MIN_SIDE or not (0.55 <= w / h <= 1.8): return None
        small = im.convert('L').resize((32, 32))
        if ImageStat.Stat(small).stddev[0] < 10: return None                  # a flat colour or blank placeholder
    except Exception:
        return None
    if not got[0].startswith('https://') and not os.environ.get('LAWYERS_ALLOW_HTTP'): return None  # tests run against a local http server
    return got[0], hashlib.sha1(got[1]).hexdigest()

def photo_for(site, soup, base, name):
    """the best checked photo on a lawyer's page, or None"""
    toks = [t.lower() for t in re.findall(r"[A-Za-z]{3,}", name)]
    cands = []
    for d in E.jsonld(soup):
        if d.get('@type') == 'Person' or (isinstance(d.get('@type'), list) and 'Person' in d['@type']):
            im = d.get('image'); im = im.get('url') if isinstance(im, dict) else (im[0] if isinstance(im, list) and im else im)
            if isinstance(im, str): cands.append((urllib.parse.urljoin(base, im), 'jsonld', 6))
    for u, hint in E.image_candidates(soup, base):
        if E.JUNK_IMG.search(u) or E.JUNK_IMG.search(hint.replace(' ', '-')) and not any(t in hint for t in toks): continue
        score = (3 if any(t in hint or t in u.lower() for t in toks) else 0) + (2 if PHOTO_HINT.search(hint + ' ' + u) else 0)
        if score: cands.append((u, hint, score))
    og = soup.find('meta', property='og:image')
    if og and og.get('content'): cands.append((urllib.parse.urljoin(base, og['content']), 'og', 1))
    seen = set()
    for u, _, _ in sorted(cands, key=lambda c: -c[2]):
        if u in seen: continue
        seen.add(u)
        if len(seen) > 6: break
        ok = check_image(site, u)
        if ok: return ok
    return None

def parse_profile(site, url, soup, firm):
    """one lawyer's record from their page, or None (not a lawyer, no name, or no valid photo)"""
    ld = [d for d in E.jsonld(soup) if d.get('@type') == 'Person' or (isinstance(d.get('@type'), list) and 'Person' in d['@type'])]
    h1 = soup.find('h1')
    name = clean_name((ld[0].get('name') if ld else '') or (h1.get_text(' ') if h1 else ''))
    if not name: return None
    title = ''
    jt = ld[0].get('jobTitle') if ld else ''
    if isinstance(jt, str): title = jt.strip()
    if not title and h1:
        for el in list(h1.find_all_next(['h2', 'h3', 'p', 'div', 'span'], limit=8)):
            t = re.sub(r'\s+', ' ', el.get_text(' ')).strip()
            if 3 <= len(t) <= 60 and (LAWYER_TITLE.search(t) or STAFF_TITLE.search(t)) and len(t.split()) <= 8: title = t; break
    title = re.sub(r'\s+', ' ', title)[:60]
    page_text = E.text_of(BeautifulSoup(str(soup), 'html.parser'))
    if STAFF_TITLE.search(title) and not re.search(r'\battorney\b', title, re.I): return None
    if not (LAWYER_TITLE.search(title) or LAWYER_PROOF.search(page_text)): return None
    photo = photo_for(site, soup, url, name)
    if not photo: return None
    phone, email = '', ''
    for a in soup.find_all('a', href=True):
        h = a['href']
        if h.startswith('tel:') and not phone:
            p = digits10(urllib.parse.unquote(h[4:]))
            if p and p not in firm['phones']: phone = p
        if h.startswith('mailto:') and not email:
            m = urllib.parse.unquote(h[7:]).split('?')[0].strip().lower()
            if re.fullmatch(r'[a-z0-9._%+-]{2,60}@[a-z0-9.-]{3,80}\.[a-z]{2,10}', m) and not GENERIC_MAIL.match(m.split('@')[0]) and m not in firm['emails']: email = m
    socials = {}
    for a in soup.find_all('a', href=True):
        for net in E.SOCIAL:
            u = E.clean_social(net, a['href'])
            if u and u not in firm['socials'] and net not in socials and not (net == 'linkedin' and '/in/' not in u): socials[net] = u
    areas = [n for n, rx in E.PRACTICE_RX if rx.search(page_text)][:6]
    return {'firm_slug': firm['slug'], 'slug': slugify(name), 'name': name, 'title': title, 'photo_url': photo[0], 'sha1': photo[1], 'phone': phone, 'email': email,
            'socials': socials, 'areas': areas, 'source_url': url}

def links(soup, base, host):
    out = []
    for a in soup.find_all('a', href=True):
        u = urllib.parse.urljoin(base, a['href'].split('#')[0])
        p = urllib.parse.urlparse(u)
        if p.scheme in ('http', 'https') and (p.hostname or '').removeprefix('www.') == host.removeprefix('www.'):
            out.append((u.rstrip('/'), re.sub(r'\s+', ' ', a.get_text(' ')).strip()))
    return out

def crawl_firm(firm):
    base = firm['site'].rstrip('/')
    host = urllib.parse.urlparse(base).hostname or ''
    site = E.Site(base + '/')
    home = site.get(base + '/')
    if not home: return []
    hsoup = BeautifulSoup(home[1], 'html.parser')
    firm = {**firm, 'phones': set(), 'emails': set(), 'socials': set()}
    for a in hsoup.find_all('a', href=True):
        if a['href'].startswith('tel:'):
            d = digits10(urllib.parse.unquote(a['href'][4:])); d and firm['phones'].add(d)
        if a['href'].startswith('mailto:'): firm['emails'].add(urllib.parse.unquote(a['href'][7:]).split('?')[0].strip().lower())
        for net in E.SOCIAL:
            u = E.clean_social(net, a['href']); u and firm['socials'].add(u)
    team = []
    for u, text in links(hsoup, home[0], host):
        if TEAM_HINT.search(urllib.parse.urlparse(u).path) or TEAM_HINT.search(text): team.append(u)
    team = sorted(set(team), key=lambda u: (len(u), u))[:MAX_TEAM_PAGES]
    if not team: team = [base + p for p in TEAM_PATHS[:4]]
    profiles, listing = [], set(team)
    for tu in team:
        got = site.get(tu)
        if not got: continue
        tsoup = BeautifulSoup(got[1], 'html.parser')
        tpath = urllib.parse.urlparse(got[0]).path.rstrip('/')
        for u, _ in links(tsoup, got[0], host):
            path = urllib.parse.urlparse(u).path.rstrip('/')
            if u in listing or u in profiles or path == tpath or path in ('', '/'): continue
            if (path.startswith(tpath + '/') and path.count('/') > tpath.count('/')) or PROFILE_HINT.search(path):
                if not re.search(r'/(page|category|tag|author|feed)/|\.(pdf|jpg|png)$', path, re.I): profiles.append(u)
        if len(profiles) >= MAX_PROFILES_PER_FIRM: break
    out, seen_slugs = [], set()
    for pu in profiles[:MAX_PROFILES_PER_FIRM]:
        got = site.get(pu)
        if not got: continue
        try: rec = parse_profile(site, got[0], BeautifulSoup(got[1], 'html.parser'), firm)
        except Exception: rec = None
        if not rec: continue
        # a lawyer's address is global (/lawyers/<slug>), so it carries the place: jane-roe-miami-fl
        base = '-'.join(x for x in (rec['slug'], slugify(firm.get('city') or ''), (firm.get('state') or '').lower()) if x)[:80]
        s = base; n = 2
        while s in seen_slugs: s = f"{base}-{n}"; n += 1
        rec['slug'] = s; rec['city'] = firm.get('city') or ''; rec['state'] = firm.get('state') or ''; seen_slugs.add(s); out.append(rec)
    # the same picture on two or more lawyers is a shared placeholder or a group photo: none of them keeps it
    count = {}
    for r in out: count[r['sha1']] = count.get(r['sha1'], 0) + 1
    out = [r for r in out if count[r['sha1']] == 1]
    # two lawyers sharing one phone or email at a firm means it is the firm's: drop it from all of them
    for k in ('phone', 'email'):
        c = {}
        for r in out:
            if r[k]: c[r[k]] = c.get(r[k], 0) + 1
        for r in out:
            if r[k] and c[r[k]] > 1: r[k] = ''
    for r in out: r.pop('sha1', None)
    return out[:MAX_LAWYERS_PER_FIRM]

def q(v):
    return 'NULL' if v in (None, '', [], {}) else "'" + str(v).replace("'", "''") + "'"

def to_sql(r):
    return ("INSERT OR IGNORE INTO lawyers (firm_slug, slug, name, title, city, state, photo_url, phone, email, socials, areas, source_url) VALUES ("
            f"{q(r['firm_slug'])}, {q(r['slug'])}, {q(r['name'])}, {q(r['title'])}, {q(r.get('city'))}, {q(r.get('state'))}, {q(r['photo_url'])}, {q(r['phone'])}, {q(r['email'])}, "
            f"{q(json.dumps(r['socials']) if r['socials'] else '')}, {q(json.dumps(r['areas']) if r['areas'] else '')}, {q(r['source_url'])});")

def load_firms(src):
    """a firms.json file, or the live site's list (https://lawdb.ai: pages through /api/firms, 500 at a time)"""
    if src.startswith('http'):
        import requests
        rows, off = [], 0
        while True:
            batch = requests.get(src.rstrip('/') + f'/api/firms?limit=500&offset={off}', timeout=30, headers={'User-Agent': E.UA}).json()
            rows += batch
            if len(batch) < 500: break
            off += 500
        rows = [{'slug': r.get('slug'), 'name': r.get('name'), 'site': r.get('website') or '', 'city': r.get('city'), 'state': r.get('state')} for r in rows]
    else:
        rows = json.load(open(src))
    return [f for f in rows if f.get('slug') and (f.get('site') or '').startswith('http')]

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('firms'); ap.add_argument('--out', required=True); ap.add_argument('--sql'); ap.add_argument('--limit', type=int, default=0); ap.add_argument('--workers', type=int, default=6)
    a = ap.parse_args()
    firms = load_firms(a.firms)
    if a.limit: firms = firms[:a.limit]
    done = set()
    if os.path.exists(a.out):
        for l in open(a.out):
            try: done.add(json.loads(l)['firm_slug'])
            except Exception: pass
    todo = [f for f in firms if f['slug'] not in done]
    print(f'{len(todo)} firms to visit')
    os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True)
    kept = 0
    with open(a.out, 'a') as fh, cf.ThreadPoolExecutor(a.workers) as ex:
        futs = {ex.submit(crawl_firm, f): f for f in todo}
        for i, fu in enumerate(cf.as_completed(futs), 1):
            f = futs[fu]
            try: rows = fu.result()
            except Exception as e: rows = []; print('ERR', f['slug'], repr(e)[:120], file=sys.stderr)
            for r in rows: fh.write(json.dumps(r) + '\n'); kept += 1
            fh.flush()
            print(f"[{i}/{len(todo)}] {f['slug'][:48]}: {len(rows)} lawyers", flush=True)
    if a.sql:
        rows = [json.loads(l) for l in open(a.out) if l.strip()]
        # an address is global: two firms in one city can each have a lawyer of the same name, so a repeat gets its firm's name added (the first keeps the plain address)
        taken = set()
        for r in rows:
            if r['slug'] in taken: r['slug'] = (r['slug'] + '-' + r['firm_slug'])[:100]
            taken.add(r['slug'])
        with open(a.sql, 'w') as sf:
            sf.write('-- generated by tools/us-data/lawyers.py; run: wrangler d1 execute DB --remote --file=' + a.sql + '\n')
            for r in rows: sf.write(to_sql(r) + '\n')
        print(f'{len(rows)} lawyers written to {a.sql}')
    print(f'{kept} new lawyers kept')

if __name__ == '__main__': main()
