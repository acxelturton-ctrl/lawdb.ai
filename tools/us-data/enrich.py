#!/usr/bin/env python3
"""Step 3 of the US firm pipeline: visit each selected firm's own website and collect FACTS about it.

Usage: python3 tools/us-data/enrich.py FL [--limit 12] [--seed 1] [--workers 6]
In:    data/states/<ST>/selected.csv          Out: data/states/<ST>/enriched.jsonl (one JSON object per firm)

Collected (public information the firm publishes itself): business emails, social profile links, logo candidates, practice areas, languages,
blog/RSS feed address, a few plain facts (years in practice, free consultation, etc.), and a short `facts_text` that is ONLY for writing a new,
original description. We never copy a firm's own wording into the site.
Polite by design: obeys robots.txt, identifies itself, one request at a time per site, at most 6 pages per site, hard timeouts and size caps.
"""
import argparse, csv, json, os, random, re, sys, time, urllib.parse, urllib.robotparser, concurrent.futures as cf
import requests
from bs4 import BeautifulSoup
import opening_hours as OH
import bar as BAR

UA = 'LawDBBot/1.0 (+https://lawdb.ai/bot; info@lawdb.ai)'
MAX_BYTES = 1_500_000
S = requests.Session(); S.headers.update({'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5', 'Accept-Language': 'en-US,en;q=0.8'})

PRACTICES = [
 ('Personal injury', r'personal injury|injury (law|lawyer|attorney)|accident (law|lawyer|attorney)|slip and fall|premises liability|dog bite|catastrophic injur'),
 ('Car accidents', r'car accident|auto accident|motor vehicle|motorcycle accident|truck accident|vehicle collision|rideshare|uber accident'),
 ('Criminal defense', r'criminal defen[sc]e|criminal law|felony|misdemeanor|drug (crimes|charges|trafficking)|white.collar|theft|assault|expunge|record sealing'),
 ('DUI', r'\bdui\b|\bdwi\b|drunk driving|impaired driving'),
 ('Family law', r'family law|divorce|child custody|custody|child support|alimony|paternity|prenup|domestic violence|adoption|timesharing|parenting plan'),
 ('Immigration', r'immigration|visa (application|petition|lawyer|attorney)|work visa|student visa|investor visa|\bh-?1b\b|\bk-?1\b|\beb-?[1-5]\b|green card|citizenship|naturalization|asylum|deportation|removal defen[sc]e|\bdaca\b'),
 ('Wills, trusts & probate', r'estate planning|\bwills\b|last will|living will|living trusts?|revocable|trust (administration|litigation)|probate|guardianship|power of attorney|estate administration|asset protection'),
 ('Elder law', r'elder law|medicaid planning|nursing home|long.term care'),
 ('Real estate', r'real estate|real estate closings?|title (issues|insurance|search)|landlord|tenant|eviction|foreclosure|zoning|condo(minium)? (law|association)'),
 ('Employment', r'employment (law|lawyer|attorney)|wrongful termination|discrimination|harassment|wage and hour|unpaid wages|retaliation|fmla|severance'),
 ('Workers’ compensation', r'workers.? comp'),
 ('Bankruptcy', r'bankruptcy|chapter 7|chapter 13|debt (relief|settlement)|creditor'),
 ('Business & corporate', r'business (law|lawyer|attorney)|corporate law|business formation|contract (law|disputes|drafting|review)|mergers|llc formation|commercial (law|litigation)|shareholder'),
 ('Medical malpractice', r'medical malpractice|medical negligence|birth injur|nursing home abuse'),
 ('Wrongful death', r'wrongful death'),
 ('Social Security disability', r'social security|disability (benefits|claim|insurance)|\bssdi\b|\bssi\b|long.term disability'),
 ('Traffic tickets', r'traffic (ticket|violation|court)|speeding ticket|reckless driving|license suspension|driver.?s license'),
 ('Civil litigation', r'civil litigation|business litigation|commercial litigation|appeals? (attorney|lawyer|court)|appellate'),
 ('Intellectual property', r'intellectual property|trademark|patent (law|attorney|lawyer|application)|copyright (law|infringement|registration|attorney|lawyer)'),
 ('Tax law', r'tax (law|attorney|lawyer|controvers|resolution|debt)|\birs\b'),
 ('Insurance claims', r'insurance (claim|dispute|denial|bad faith)|property damage|hurricane (claim|damage)|first.party'),
]
PRACTICE_RX = [(n, re.compile(p, re.I)) for n, p in PRACTICES]
LANGS = {'Spanish': r'se habla espa|habla espa|spanish', 'Haitian Creole': r'creole|krey[oò]l', 'Portuguese': r'portugu', 'French': r'parlons fran|\bfrench\b', 'Russian': r'russian|\bрусск', 'Arabic': r'arabic', 'Mandarin': r'mandarin|chinese', 'Hebrew': r'hebrew'}
SOCIAL = {
 'facebook': (r'^(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.com)$', {'sharer', 'sharer.php', 'share', 'share.php', 'dialog', 'plugins', 'tr', 'login', 'login.php', 'policies', 'privacy', 'help', 'l.php', 'watch', 'events', 'groups', 'hashtag', 'marketplace', 'gaming', 'people', 'public'}),
 'instagram': (r'^(?:www\.)?instagram\.com$', {'p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'tv', 'direct', 'about', 'legal', 'share', 'web', 'developer'}),
 'linkedin': (r'^(?:[a-z]{2,3}\.|www\.)?linkedin\.com$', set()),
 'x': (r'^(?:www\.|mobile\.)?(?:twitter\.com|x\.com)$', {'intent', 'share', 'home', 'search', 'hashtag', 'i', 'login', 'explore', 'settings', 'privacy', 'tos', 'about', 'widgets.js', 'messages', 'notifications'}),
 'youtube': (r'^(?:www\.|m\.)?youtube\.com$', set()),
}
BAD_EMAIL = re.compile(r'(example\.|sentry|wixpress|\.png|\.jpg|\.gif|\.webp|\.svg|@2x|noreply|no-reply|donotreply|u003e|godaddy|domain\.com|yourdomain|email\.com$|test@)', re.I)
PATH_HINTS = re.compile(r'(about|attorney|lawyer|team|people|practice|areas?|services|contact|blog|news|resources|why)', re.I)

class Site:
    def __init__(self, base):
        self.base = base; self.rp = urllib.robotparser.RobotFileParser(); self.ok = True; self.last = 0
        try:
            r = S.get(urllib.parse.urljoin(base, '/robots.txt'), timeout=8)
            if r.status_code == 200 and len(r.text) < 200000: self.rp.parse(r.text.splitlines())
            else: self.rp.parse([])
        except Exception: self.rp.parse([])
    def get(self, url, binary=False):
        if not self.rp.can_fetch(UA, url): return None
        wait = 1.0 - (time.time() - self.last)
        if wait > 0: time.sleep(wait)
        try:
            r = S.get(url, timeout=12, stream=True, allow_redirects=True)
            self.last = time.time()
            if r.status_code != 200: return None
            ct = r.headers.get('content-type', '')
            if not binary and 'html' not in ct and 'xml' not in ct and 'text' not in ct: return None
            data = b''
            for chunk in r.iter_content(65536):
                data += chunk
                if len(data) > MAX_BYTES: break
            return r.url, data
        except Exception: self.last = time.time(); return None

def text_of(soup):
    for t in soup(['script', 'style', 'noscript', 'svg']): t.decompose()
    return re.sub(r'\s+', ' ', soup.get_text(' ')).strip()

def clean_social(net, href):
    try: u = urllib.parse.urlparse(href.strip())
    except Exception: return None
    host = (u.hostname or '').lower(); pat, bad = SOCIAL[net]
    if u.scheme not in ('http', 'https') or not re.match(pat, host): return None
    seg = [x for x in u.path.split('/') if x]
    if not seg or not re.fullmatch(r'[A-Za-z0-9._\-@+%]{1,80}', seg[0]): return None
    first = seg[0].lower()
    if first in bad: return None
    if net == 'linkedin' and (first not in ('company', 'in', 'school', 'showcase') or len(seg) != 2): return None
    if net == 'youtube' and not (first.startswith('@') or (first in ('channel', 'c', 'user') and len(seg) == 2)): return None
    if net in ('instagram', 'x') and len(seg) != 1: return None
    if net == 'facebook' and first == 'profile.php': return None
    path = '/'.join(seg if net in ('linkedin', 'youtube', 'facebook') and (first in ('company', 'in', 'school', 'showcase', 'channel', 'c', 'user', 'pages')) else seg[:1])
    base = {'facebook': 'https://www.facebook.com', 'instagram': 'https://www.instagram.com', 'linkedin': 'https://www.linkedin.com', 'x': 'https://x.com', 'youtube': 'https://www.youtube.com'}[net]
    return f'{base}/{path}'

def jsonld(soup):
    out = []
    for s in soup.find_all('script', type=re.compile('ld\\+json', re.I)):
        try: d = json.loads(s.string or s.get_text() or '')
        except Exception: continue
        stack = [d]
        while stack:
            x = stack.pop()
            if isinstance(x, list): stack += x
            elif isinstance(x, dict):
                out.append(x)
                for v in x.values():
                    if isinstance(v, (list, dict)): stack.append(v)
    return out


JUNK_IMG = re.compile(r'(logo|icon|sprite|favicon|avatar|gravatar|badge|seal|award|payment|visa|mastercard|bbb|avvo|superlawyers|martindale|lawyers\.com|justia|findlaw|facebook|twitter|linkedin|instagram|youtube|google|yelp|pixel|spacer|blank|placeholder|loading|arrow|star|rating|review|emoji|1x1|captcha|qr)', re.I)

def size_stem(u):
    """the same picture at different sizes shares a stem: photo-300x200.jpg -> photo.jpg"""
    path = urllib.parse.urlparse(u).path
    return re.sub(r'-\d{2,4}x\d{2,4}(?=\.\w+$)|@\dx(?=\.\w+$)', '', path.lower())

def probe(site, u):
    """download an image and return (final_url, w, h, bytes) or None"""
    got = site.get(u, binary=True)
    if not got: return None
    try:
        from PIL import Image; import io
        im = Image.open(io.BytesIO(got[1])); return got[0], im.size[0], im.size[1], len(got[1])
    except Exception: return None

def image_candidates(soup, base):
    """(url, hint) for pictures on a page: <img>, lazy-load attributes, <picture>, and CSS background images"""
    out = []
    def add(u, hint):
        if u and not u.startswith('data:'): out.append((urllib.parse.urljoin(base, u.strip()), hint))
    for img in soup.find_all('img'):
        cls = ' '.join(img.get('class', [])) + ' ' + (img.get('id') or '')
        srcset = img.get('srcset') or img.get('data-srcset') or ''
        best = ''
        if srcset:
            parts = [x.strip().split(' ') for x in srcset.split(',') if x.strip()]
            try: best = sorted(parts, key=lambda x: int(re.sub(r'\D', '', x[1]) or 0) if len(x) > 1 else 0)[-1][0]
            except Exception: best = parts[-1][0] if parts else ''
        add(best or img.get('data-src') or img.get('data-lazy-src') or img.get('src'), (cls + ' ' + (img.get('alt') or '')).lower())
    for el in soup.find_all(style=True):
        m = re.search(r'url\(["\']?([^"\')]+)', el['style'])
        if m: add(m.group(1), ('bg ' + ' '.join(el.get('class', []))).lower())
    for m in re.finditer(r'url\(["\']?(https?:[^"\')]+\.(?:jpe?g|png|webp))', str(soup)[:400000]):
        add(m.group(1), 'css')
    return out

def parse_feed(site, feed_url, limit=6):
    got = site.get(feed_url)
    if not got: return []
    try: x = BeautifulSoup(got[1][:600000], 'lxml-xml')
    except Exception: return []
    posts = []
    for it in (x.find_all('item') or x.find_all('entry'))[:limit]:
        def tx(n):
            e = it.find(n); return e.get_text(' ').strip() if e else ''
        title = tx('title'); link = tx('link') or (it.find('link').get('href') if it.find('link') else '')
        date = tx('pubDate') or tx('published') or tx('updated') or tx('dc:date')
        body = tx('encoded') or tx('content') or tx('description') or tx('summary')
        bs = BeautifulSoup(body, 'lxml')
        txt = re.sub(r'\s+', ' ', bs.get_text(' ')).strip()
        txt = re.sub(r'\s*The post .{1,300} appeared first on .{1,200}$', '', txt, flags=re.I)[:170]
        img = ''
        for n in ('media:content', 'media:thumbnail', 'enclosure'):
            e = it.find(n)
            if e and (e.get('url') and (not e.get('type') or 'image' in e.get('type', '') or n != 'enclosure')): img = e.get('url'); break
        if not img:
            i = bs.find('img')
            if i: img = i.get('src') or i.get('data-src') or ''
        if title and link: posts.append({'title': title[:200], 'url': link, 'date': date, 'excerpt': txt, 'image': urllib.parse.urljoin(feed_url, img) if img else ''})
    return posts

def post_image(site, url):
    got = site.get(url)
    if not got: return ''
    try: sp = BeautifulSoup(got[1][:500000], 'lxml')
    except Exception: return ''
    og = sp.find('meta', property='og:image')
    return urllib.parse.urljoin(got[0], og['content']) if og and og.get('content') else ''

def enrich(row):
    site_url = row['website']; dom = row['domain']; base = site_url
    res = {'name': row['name'], 'city': row['city'], 'domain': dom, 'website': site_url, 'overture_id': row['overture_id'], 'pages': [], 'ok': False}
    site = Site(base)
    first = site.get(site_url) or site.get(site_url.replace('https://', 'http://'))
    if not first: res['error'] = 'site did not load (or robots.txt blocks us)'; return res
    final_url, data = first; res['final_url'] = final_url
    soups = {}; queue = [final_url]; seen = set()
    emails, socials, logos, feeds = {}, {}, [], []
    texts, nav_text = [], []; ld_objs = []; imgs = []; pages_text = []; page_hours = None
    directories = {}; booking = ''; contact_form = False
    host = urllib.parse.urlparse(final_url).hostname or ''
    pages = 0
    cache = {final_url: data}
    while queue and pages < 8:
        url = queue.pop(0)
        if url in seen: continue
        seen.add(url)
        got = (final_url, cache[final_url]) if url == final_url else site.get(url)
        if not got: continue
        u2, raw = got; pages += 1; res['pages'].append(u2)
        try: soup = BeautifulSoup(raw, 'lxml')
        except Exception: continue
        ld_objs += jsonld(soup)
        if not contact_form and any(f.find('textarea') for f in soup.find_all('form')): contact_form = True
        imgs += [(u, h, 'home' if u2 == final_url else 'inner') for u, h in image_candidates(soup, u2)]
        # links
        for a in soup.find_all('a', href=True):
            h = a['href'].strip()
            if h.lower().startswith('mailto:'):
                e = h[7:].split('?')[0].strip().lower()
                if re.fullmatch(r'[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}', e) and not BAD_EMAIL.search(e): emails[e] = emails.get(e, 0) + 3
                continue
            full = urllib.parse.urljoin(u2, h)
            hh = (urllib.parse.urlparse(full).hostname or '').lower().replace('www.', '')
            for dh, dn in BAR.DIRECTORIES.items():   # a link to the firm's profile on a legal directory (not the directory's home page)
                if (hh == dh or hh.endswith('.' + dh)) and len(urllib.parse.urlparse(full).path.strip('/')) > 3 and dn not in directories: directories[dn] = full.split('#')[0][:300]
            if not booking and re.search(BAR.BOOKING_HOSTS, hh): booking = full.split('#')[0][:300]
            for net in SOCIAL:
                c = clean_social(net, full)
                if c and net not in socials: socials[net] = c
            p = urllib.parse.urlparse(full)
            if (p.hostname or '').replace('www.', '') == host.replace('www.', '') and PATH_HINTS.search(p.path + ' ' + a.get_text(' ')) and not re.search(r'\.(pdf|jpg|png|zip)$', p.path, re.I):
                nav_text.append(a.get_text(' ').strip()[:80])
                if full.split('#')[0] not in seen and len(queue) < 16:
                    (queue.insert(0, full.split('#')[0]) if re.search(r'about|attorney|lawyer|team|people|award|recogni|why|bio|firm|profile', p.path, re.I) else queue.append(full.split('#')[0]))
        # feeds
        for l in soup.find_all('link', rel=True, href=True):
            if 'alternate' in [x.lower() for x in l.get('rel', [])] and re.search(r'rss|atom', l.get('type', ''), re.I):
                feeds.append(urllib.parse.urljoin(u2, l['href']))
        # logos
        if url == final_url or not logos:
            for img in soup.find_all('img'):
                blob = ' '.join([' '.join(img.get('class', [])), img.get('id', ''), img.get('alt', ''), img.get('src', '') or img.get('data-src', '')]).lower()
                par = img.find_parent(['header', 'nav', 'a'])
                if 'logo' in blob or (par is not None and par.name == 'a' and par.get('href') in ('/', final_url, site_url) and img.get('src')):
                    src = img.get('src') or img.get('data-src') or ''
                    if src and not src.startswith('data:'): logos.append(('img', urllib.parse.urljoin(u2, src)))
            for l in soup.find_all('link', rel=True, href=True):
                r = ' '.join(l.get('rel', [])).lower()
                if 'apple-touch-icon' in r: logos.append(('apple-touch-icon', urllib.parse.urljoin(u2, l['href'])))
            og = soup.find('meta', property='og:image')
            if og and og.get('content'): res.setdefault('photo_candidate', urllib.parse.urljoin(u2, og['content']))
        # text (visible) and emails in text
        meta = soup.find('meta', attrs={'name': 'description'})
        t = text_of(soup)
        if page_hours is None: page_hours = OH.from_text(t)   # the whole page text: hours are often in the footer
        pages_text.append({'url': u2, 'title': ((soup.title.string or '') if soup.title else '').strip()[:160], 'text': t[:7000]})
        texts.append(((soup.title.string or '') if soup.title else '') + ' | ' + ((meta.get('content') if meta else '') or '') + ' | ' + t[:6000])
        for m in re.findall(r'[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}', t):
            e = m.lower()
            if not BAD_EMAIL.search(e): emails[e] = emails.get(e, 0) + 1
        if 'home_title' not in res:
            res['home_title'] = (soup.title.string or '').strip()[:160] if soup.title else ''
            res['home_meta'] = ((meta.get('content') if meta else '') or '').strip()[:300]
            h1 = soup.find('h1'); res['home_h1'] = h1.get_text(' ').strip()[:160] if h1 else ''
    # Opening hours are the most common reason a firm fails the bar. If none turned up, ask for the usual contact / location pages directly
    # (still polite: robots.txt and one request a second per site; at most five extra requests).
    if not (OH.from_jsonld(ld_objs) or page_hours):
        tried = 0
        for path in ('/contact', '/contact-us', '/contact-us/', '/contact/', '/locations', '/about-us'):
            full = urllib.parse.urljoin(final_url, path)
            if full in seen or full.rstrip('/') in seen or tried >= 5: continue
            seen.add(full); tried += 1
            got = site.get(full)
            if not got: continue
            u2, raw = got; res['pages'].append(u2)
            try: soup = BeautifulSoup(raw, 'lxml')
            except Exception: continue
            ld_objs += jsonld(soup)
            t = text_of(soup)
            page_hours = OH.from_text(t)
            pages_text.append({'url': u2, 'title': ((soup.title.string or '') if soup.title else '').strip()[:160], 'text': t[:7000]})
            if page_hours or OH.from_jsonld(ld_objs): break
    # people named in structured data (name, job title)
    people_ld = []
    for o in ld_objs:
        ty = o.get('@type'); ty = ' '.join(ty) if isinstance(ty, list) else str(ty or '')
        if 'Person' in ty and o.get('name') and isinstance(o.get('name'), str):
            people_ld.append({'name': o['name'].strip()[:80], 'title': str(o.get('jobTitle') or '')[:60]})
    res['people_ld'] = people_ld[:20]
    res['hours'] = OH.from_jsonld(ld_objs) or page_hours   # {"1": [["09:00","17:00"]], ...} or None
    res['pages_text'] = pages_text
    res['directories'] = [{'name': k, 'url': v} for k, v in directories.items()]; res['booking'] = booking; res['contact_form'] = contact_form
    res['nav_labels'] = [x[:80] for x in nav_text][:80]
    # schema.org
    for o in ld_objs:
        ty = o.get('@type'); ty = ' '.join(ty) if isinstance(ty, list) else str(ty or '')
        if re.search(r'LegalService|Attorney|LocalBusiness|Organization|ProfessionalService', ty):
            lg = o.get('logo'); lg = lg.get('url') if isinstance(lg, dict) else lg
            if isinstance(lg, str): logos.insert(0, ('schema.org', urllib.parse.urljoin(final_url, lg)))
            sa = o.get('sameAs'); sa = [sa] if isinstance(sa, str) else (sa or [])
            for h in sa:
                for net in SOCIAL:
                    c = clean_social(net, str(h))
                    if c and net not in socials: socials[net] = c
            if o.get('email'): e = str(o['email']).replace('mailto:', '').lower(); emails[e] = emails.get(e, 0) + 4 if not BAD_EMAIL.search(e) else 0
            if o.get('foundingDate'): res['founded'] = str(o['foundingDate'])[:10]
    blob = ' '.join(texts) + ' ' + ' '.join(nav_text)
    # practice areas: weight nav + titles + first part of the home page above the long tail of text
    heads = ' '.join(nav_text) + ' ' + ' '.join(t.split('|')[0] + ' ' + t.split('|')[1] if '|' in t else t for t in texts)
    counts = []
    for name, rx in PRACTICE_RX:
        h = len(rx.findall(heads)); b = len(rx.findall(blob))
        score = h * 3 + b
        if (h >= 1 and b >= 2) or b >= 8: counts.append((score, name))
    res['practice_areas'] = [n for _, n in sorted(counts, reverse=True)[:7]]
    res['languages'] = [n for n, rx in LANGS.items() if re.search(rx, blob, re.I)]
    # facts
    facts = {}
    m = re.search(r'(?:since|established in|founded in|serving [a-z ]+ since)\s+((?:19|20)\d\d)', blob, re.I)
    if m: facts['since'] = int(m.group(1))
    m = re.search(r'(\d{2})\+?\s+years of (?:legal )?experience', blob, re.I)
    if m: facts['years_experience'] = int(m.group(1))
    if re.search(r'free (initial |case )?(consultation|case evaluation|case review)', blob, re.I): facts['free_consultation'] = True
    if re.search(r'no fee unless|no win,? no fee|contingency|you don.?t pay unless', blob, re.I): facts['contingency'] = True
    if re.search(r'24/7|24 hours|available 24', blob, re.I): facts['available_24_7'] = True
    if re.search(r'board certified', blob, re.I): facts['board_certified'] = True
    if re.search(r'virtual consultation|zoom|video (consult|call)', blob, re.I): facts['virtual_consultations'] = True
    res['facts'] = facts
    # emails: prefer the firm's own domain
    own = sorted([(c, e) for e, c in emails.items() if c > 0 and e.split('@')[1].replace('www.', '').endswith(dom.replace('www.', ''))], reverse=True)
    other = sorted([(c, e) for e, c in emails.items() if c > 0 and e not in [x[1] for x in own] and e.split('@')[1] in ('gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'aol.com', 'icloud.com')], reverse=True)
    res['emails'] = [e for _, e in own[:3]]; res['emails_personal_domain'] = [e for _, e in other[:1]]
    res['socials'] = socials
    # logo: first candidate that downloads as a real image of useful size
    best = None
    seen_l = set()
    order = {'schema.org': 0, 'img': 1, 'apple-touch-icon': 2, 'og:image': 3}
    for kind, u in sorted(logos, key=lambda x: order.get(x[0], 9)):
        if u in seen_l or len(seen_l) > 8: continue
        seen_l.add(u)
        got = site.get(u, binary=True)
        if not got: continue
        try:
            from PIL import Image; import io
            im = Image.open(io.BytesIO(got[1])); w, h = im.size
        except Exception:
            if u.lower().endswith('.svg'): best = {'url': u, 'kind': kind, 'w': None, 'h': None}; break
            continue
        if w >= 80 and h >= 30 and (kind != 'apple-touch-icon' or w >= 120): best = {'url': got[0], 'kind': kind, 'w': w, 'h': h}; break
    res['logo'] = best
    # blog feed
    feed = None
    cand = list(dict.fromkeys(feeds + [urllib.parse.urljoin(final_url, p) for p in ('/feed/', '/blog/feed/', '/feed', '/rss.xml', '/blog/rss.xml', '/feed.xml', '/atom.xml')]))
    for f in cand[:7]:
        got = site.get(f)
        if not got: continue
        body = got[1][:400000].decode('utf-8', 'ignore')
        if re.search(r'<(rss|feed|rdf:RDF)\b', body[:2000], re.I):
            items = len(re.findall(r'<(item|entry)\b', body))
            dates = re.findall(r'<(?:pubDate|published|updated|dc:date)>([^<]+)<', body)
            if items:
                feed = {'url': got[0], 'items': items, 'latest': dates[0].strip() if dates else None}; break
    res['blog_feed'] = feed

    # cover photo and company photos: probe the most promising pictures, keep real photographs (big enough, not logos or badges)
    og_img = res.get('photo_candidate')
    cand, seen_i = [], set()
    if og_img: cand.append((og_img, 'og', 'home'))
    for u, h, where in imgs:
        if JUNK_IMG.search(u) or JUNK_IMG.search(h.replace('bg ', '')) or not re.search(r'\.(jpe?g|png|webp)(\?|$)', u, re.I): continue
        k = size_stem(u)
        if k in seen_i: continue
        seen_i.add(k); cand.append((u, h, where))
    def prio(c):
        u, h, where = c
        return (0 if re.search(r'hero|banner|slider|cover|header|masthead|jumbotron', h) else 1 if c[1] == 'og' else 2, 0 if where == 'home' else 1)
    cand.sort(key=prio)
    probed = []
    for u, h, where in cand[:16]:
        pr = probe(site, u)
        if pr and pr[1] >= 500 and pr[2] >= 280: probed.append({'url': pr[0], 'w': pr[1], 'h': pr[2], 'hint': h[:40], 'where': where})
    probed = [p for p in probed if size_stem(p['url']) != size_stem((best or {}).get('url', ''))]
    wide = [p for p in probed if 1.4 <= p['w'] / p['h'] <= 3.6 and p['w'] >= 1000]
    res['cover'] = (sorted(wide, key=lambda p: (0 if re.search(r'hero|banner|slider|cover|header|masthead', p['hint']) or p['hint'] == 'og' else 1, -p['w'] * p['h']))[:1] or [None])[0]
    cu = (res['cover'] or {}).get('url')
    res['photos'] = [p for p in sorted(probed, key=lambda p: -p['w'] * p['h']) if p['url'] != cu][:8]
    # blog posts (title, link, date, short excerpt, picture) from the feed we found
    posts = parse_feed(site, feed['url']) if feed else []
    for pst in posts[:4]:
        if not pst['image'] and pst['url']: pst['image'] = post_image(site, pst['url'])
    res['posts'] = posts
    res['facts_text'] = ' '.join((texts[0] if texts else '').split('|')[2:])[:700]
    res['ok'] = True
    return res

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('state'); ap.add_argument('--limit', type=int, default=0); ap.add_argument('--seed', type=int, default=1); ap.add_argument('--workers', type=int, default=6)
    ap.add_argument('--out', default='enriched.jsonl'); a = ap.parse_args()
    d = os.path.join('data', 'states', a.state.upper()); rows = list(csv.DictReader(open(os.path.join(d, 'selected.csv'))))
    if a.limit: random.Random(a.seed).shuffle(rows); rows = rows[:a.limit]
    done = {}
    out_p = os.path.join(d, a.out)
    if os.path.exists(out_p):
        for l in open(out_p): 
            try: j = json.loads(l); done[j['overture_id']] = j
            except Exception: pass
    todo = [r for r in rows if r['overture_id'] not in done]
    print(f'{len(todo)} firms to visit ({len(done)} already done)')
    with open(out_p, 'a') as f, cf.ThreadPoolExecutor(a.workers) as ex:
        futs = {ex.submit(enrich, r): r for r in todo}
        for i, fu in enumerate(cf.as_completed(futs), 1):
            try: r = fu.result()
            except Exception as e: r = {'name': futs[fu]['name'], 'overture_id': futs[fu]['overture_id'], 'ok': False, 'error': repr(e)[:200]}
            f.write(json.dumps(r) + '\n'); f.flush()
            print(f"[{i}/{len(todo)}] {'ok ' if r.get('ok') else 'ERR'} {r['name'][:40]}", flush=True)
if __name__ == '__main__': main()
