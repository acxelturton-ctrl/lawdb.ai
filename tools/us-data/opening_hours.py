"""Opening hours from a firm's own pages, in the format the site stores (src/lib/firm-edit.js): {"1": [["09:00","17:00"]], ...} with 1 = Monday ... 7 = Sunday;
a day that is not listed is closed. Read from schema.org data (openingHoursSpecification, openingHours) first, then from plain text such as
"Monday - Friday: 9:00 AM - 5:00 PM". A schedule counts only if it has at least three open days and every interval is plausible."""
import re

DAYS = {'mo': 1, 'tu': 2, 'we': 3, 'th': 4, 'fr': 5, 'sa': 6, 'su': 7}   # keyed by the first two letters: Monday, Mon and Mo all work
_D = r'(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?'
_T = r'(\d{1,2})(?::(\d\d))?\s*(a\.?m\.?|p\.?m\.?)?'
TEXT_RX = re.compile(_D + r'(?:\s*(?:-|–|—|to|through|thru)\s*' + _D + r')?\s*[:,\-–—]?\s*' + _T + r'\s*(?:-|–|—|to|until)\s*' + _T, re.I)
TEXT_RX_B = re.compile(_T + r'\s*(?:-|–|—|to|until)\s*' + _T + r'\s*[,:;]?\s*(?:open\s+)?' + _D + r'(?:\s*(?:-|–|—|to|through|thru)\s*' + _D + r')?(?!\s*[:,\-–—]?\s*(?:closed|\d))', re.I)
MIN_DAYS = 3

def _hm(h, m):
    return f'{h:02d}:{m:02d}'

def _to_minutes(h, m, ap):
    h = int(h); m = int(m or 0)
    if ap:
        pm = ap.lower().startswith('p')
        if h == 12: h = 12 if pm else 0
        elif pm: h += 12
    return h * 60 + m

def _plausible(a, b):
    return 5 * 60 <= a < b <= 23 * 60 + 30 and b - a >= 3 * 60

def _days(d1, d2):
    a = DAYS[d1.lower()[:2]]
    if not d2: return [a]
    b = DAYS[d2.lower()[:2]]
    out = [a]
    while out[-1] != b and len(out) < 7: out.append(out[-1] % 7 + 1)
    return out

def _finish(sched):
    open_days = {d: v for d, v in sched.items() if v}
    return {str(d): v for d, v in sorted(open_days.items())} if len(open_days) >= MIN_DAYS else None

def _interval(h1, m1, ap1, h2, m2, ap2):
    """(start, end) in minutes from the two times as written, or None"""
    h1i, h2i = int(h1), int(h2)
    if h1i > 24 or h2i > 24: return None
    if not ap2 and not ap1:
        if h2i >= 13: pass                                    # 24-hour clock: 08:00-17:00
        elif 6 <= h1i <= 11 and 1 <= h2i <= 7: ap1, ap2 = 'am', 'pm'   # 8:30-5:00 reads as 8:30 am to 5:00 pm
        else: return None
    if ap2 and not ap1:
        if ap2.lower().startswith('p'): ap1 = 'pm' if ((h1i < h2i and h2i != 12) or h1i == 12) else 'am'
        else: ap1 = 'am'
    a = _to_minutes(h1, m1, ap1); b = _to_minutes(h2, m2, ap2)
    return (a, b) if _plausible(a, b) else None

def from_text(text):
    sched = {}
    def add(d1, d2, iv):
        v = [_hm(iv[0] // 60, iv[0] % 60), _hm(iv[1] // 60, iv[1] % 60)]
        for d in _days(d1, d2): sched.setdefault(d, [v])
    for m in TEXT_RX.finditer(text or ''):
        d1, d2, h1, m1, ap1, h2, m2, ap2 = m.groups()
        iv = _interval(h1, m1, ap1, h2, m2, ap2)
        if iv: add(d1, d2, iv)
    for m in TEXT_RX_B.finditer(text or ''):
        h1, m1, ap1, h2, m2, ap2, d1, d2 = m.groups()
        iv = _interval(h1, m1, ap1, h2, m2, ap2)
        if iv: add(d1, d2, iv)
    return _finish(sched)

def _day_name(x):
    x = str(x).rsplit('/', 1)[-1][:2].lower()
    return DAYS.get(x)

def from_jsonld(objs):
    sched = {}
    for o in objs:
        spec = o.get('openingHoursSpecification')
        for s in (spec if isinstance(spec, list) else [spec] if isinstance(spec, dict) else []):
            if not isinstance(s, dict): continue
            days = s.get('dayOfWeek'); days = days if isinstance(days, list) else [days]
            op, cl = str(s.get('opens') or ''), str(s.get('closes') or '')
            mo, mc = re.match(r'(\d{1,2}):(\d\d)', op), re.match(r'(\d{1,2}):(\d\d)', cl)
            if not (mo and mc): continue
            a = int(mo.group(1)) * 60 + int(mo.group(2)); b = int(mc.group(1)) * 60 + int(mc.group(2))
            if not _plausible(a, b): continue
            for d in days:
                n = _day_name(d)
                if n: sched.setdefault(n, [[_hm(a // 60, a % 60), _hm(b // 60, b % 60)]])
        oh = o.get('openingHours')
        for line in (oh if isinstance(oh, list) else [oh] if isinstance(oh, str) else []):
            for m in re.finditer(r'(Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su))?[\s,]+(\d{1,2}):(\d\d)\s*-\s*(\d{1,2}):(\d\d)', str(line)):
                d1, d2, h1, m1, h2, m2 = m.groups()
                a = int(h1) * 60 + int(m1); b = int(h2) * 60 + int(m2)
                if not _plausible(a, b): continue
                for d in _days(d1, d2): sched.setdefault(d, [[_hm(a // 60, a % 60), _hm(b // 60, b % 60)]])
    return _finish(sched)
