"""Tests the lawyer crawler against a small local site: python3 tools/us-data/test_lawyers.py  (needs requests, beautifulsoup4, Pillow; takes ~40 s because it is polite)."""
import io, json, os, random, sys, threading, http.server
os.environ['LAWYERS_ALLOW_HTTP'] = '1'
sys.path.insert(0, os.path.dirname(__file__))
from PIL import Image
import lawyers as L

def photo(seed, size=(400, 500)):
    # blocks of different colours (like a real picture, unlike random noise, which averages to flat grey when shrunk)
    from PIL import ImageDraw
    r = random.Random(seed); im = Image.new('RGB', size, (r.randrange(256), r.randrange(256), r.randrange(256))); d = ImageDraw.Draw(im)
    for _ in range(40):
        x, y = r.randrange(size[0]), r.randrange(size[1])
        d.rectangle([x, y, x + r.randrange(20, 160), y + r.randrange(20, 160)], fill=(r.randrange(256), r.randrange(256), r.randrange(256)))
    for _ in range(20000): im.putpixel((r.randrange(size[0]), r.randrange(size[1])), (r.randrange(256), r.randrange(256), r.randrange(256)))  # grain, so the file is a realistic size
    b = io.BytesIO(); im.save(b, 'PNG'); return b.getvalue()
def flat(size=(400, 500)):
    b = io.BytesIO(); Image.new('RGB', size, (200, 200, 200)).save(b, 'PNG'); return b.getvalue()

IMG = {'/img/jane.png': photo(1), '/img/john.png': photo(2, (300, 300)), '/img/tiny.png': photo(3, (90, 90)), '/img/blank.png': flat(), '/img/group.png': photo(4), '/img/logo.png': photo(5)}
def prof(name, title, img, extra='', ld=False):
    j = f'<script type="application/ld+json">{json.dumps({"@type": "Person", "name": name, "jobTitle": title})}</script>' if ld else ''
    return f'<html><head>{j}</head><body><h1>{name}, Esq.</h1><div class="role">{title}</div><img class="headshot" alt="{name}" src="{img}">{extra}<p>Handles personal injury and car accident cases.</p></body></html>'
PAGES = {
 '/': '<html><body><a href="tel:+17865550000">Call</a><a href="mailto:info@firm.test">Email</a><a href="https://www.facebook.com/firmpage">fb</a><a href="/attorneys">Our Attorneys</a></body></html>',
 '/attorneys': ''.join(f'<a href="/attorneys/{s}">{s}</a>' for s in ['jane-roe', 'john-doe', 'tiny-photo', 'blank-photo', 'pat-staff', 'group-a', 'group-b', 'no-photo']),
 '/attorneys/jane-roe': prof('Jane Roe', 'Partner', '/img/jane.png', '<a href="tel:+17865551234">direct</a><a href="mailto:jane@firm.test">mail</a><a href="https://www.linkedin.com/in/jane-roe">in</a><a href="https://www.facebook.com/firmpage">fb</a><a href="tel:+17865550000">main</a>'),
 '/attorneys/john-doe': prof('John Doe', 'Associate Attorney', '/img/john.png', '<a href="mailto:info@firm.test">general</a>', ld=True),
 '/attorneys/tiny-photo': prof('Tim Small', 'Attorney', '/img/tiny.png'),
 '/attorneys/blank-photo': prof('Bea Blank', 'Attorney', '/img/blank.png'),
 '/attorneys/pat-staff': prof('Pat Staff', 'Paralegal', '/img/jane.png'),
 '/attorneys/group-a': prof('Gus Alpha', 'Attorney', '/img/group.png'),
 '/attorneys/group-b': prof('Gia Bravo', 'Attorney', '/img/group.png'),
 '/attorneys/no-photo': '<html><body><h1>Nora Nophoto</h1><div>Attorney</div></body></html>',
}
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path in IMG: body, ct = IMG[self.path], 'image/png'
        elif self.path in PAGES: body, ct = PAGES[self.path].encode(), 'text/html'
        else: self.send_response(404); self.end_headers(); return
        self.send_response(200); self.send_header('content-type', ct); self.send_header('content-length', str(len(body))); self.end_headers(); self.wfile.write(body)
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
rows = L.crawl_firm({'slug': 'test-firm', 'name': 'Test Firm', 'site': f'http://127.0.0.1:{srv.server_port}', 'city': 'Miami', 'state': 'FL'})
by = {r['name']: r for r in rows}
assert sorted(by) == ['Jane Roe', 'John Doe'], sorted(by)           # tiny, blank, shared, staff and photo-less lawyers are all left out
jane = by['Jane Roe']
assert jane['title'] == 'Partner' and jane['phone'] == '7865551234' and jane['email'] == 'jane@firm.test', jane   # direct phone kept, firm main number dropped
assert jane['socials'] == {'linkedin': 'https://www.linkedin.com/in/jane-roe'}, jane['socials']                   # firm's facebook is not hers
assert jane['areas'] == ['Personal injury', 'Car accidents'] or 'Personal injury' in jane['areas'], jane['areas']
john = by['John Doe']
assert john['title'] == 'Associate Attorney' and john['email'] == '' and john['phone'] == '', john               # general office email is not a lawyer's
assert jane['slug'] == 'jane-roe-miami-fl' and jane['city'] == 'Miami' and jane['state'] == 'FL', jane['slug']   # a lawyer's address is global, so it carries the place
assert 'INSERT OR IGNORE INTO lawyers' in L.to_sql(jane) and "O''Brien" in L.to_sql({**jane, 'name': "O'Brien"})
print('lawyers crawler: ok', len(rows), 'kept')
