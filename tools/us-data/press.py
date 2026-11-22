#!/usr/bin/env python3
"""Looks for press coverage of each firm on other websites (news sites and trade press), for the biography.

Usage:  python3 tools/us-data/press.py FL
In:     data/states/<ST>/selected.csv and enriched.jsonl
Out:    data/states/<ST>/press.json   {overture_id: [{source, year, title, url}, ...]}   (at most 3 per firm, newest first)

Source: Google News' public RSS search, one request every 1.5 seconds. Only firms whose own site was read and that have a logo and cover photo are looked up.
Rules, so coverage that goes on a profile is accurate and fair to the firm:
 - the firm's full name has to be in the headline, together with its city or a word like "law firm", so a different business with a similar name is not matched;
 - the headline has to read as good or neutral news (named, recognised, joins, opens, announces, sponsors, ...), and must not mention lawsuits, discipline, crime,
   accidents, verdicts or settlements, or use superlatives ("best", "top");
 - press-release wires, social sites and lawyer directories do not count as press;
 - coverage has to be from the last six years.
Only the outlet's name, the year and the headline are kept; no article text is copied.
"""
import csv, datetime, email.utils, json, os, re, sys, time, urllib.parse
import requests
from bs4 import BeautifulSoup

UA = 'LawDBBot/1.0 (+https://lawdb.ai)'
GOOD = re.compile(r'\b(named|recogni[sz]ed|honou?red|award(?:ed|s)?|announces?|joins?|joined|promot\w*|elected|appointed|opens?|opening|expands?|expansion|celebrates?|anniversary|sponsors?|donat\w*|scholarship|community|charity|featured|selected|inducted|finalist|launch\w*|partners? with|welcomes?)\b', re.I)
BAD = re.compile(r'\b(sued|suing|lawsuits?|disbar\w*|suspend\w*|sanction\w*|fraud|arrest\w*|charged|indict\w*|misconduct|malpractice|settle\w*|verdicts?|million|scandal|investigat\w*|convict\w*|accus\w*|alleg\w*|probe|fined|violat\w*|bankrupt\w*|dies|died|death|killed|crash|shooting|murder|victims?|best|top|leading|#1)\b', re.I)
NOT_PRESS = re.compile(r'prnewswire|einpresswire|openpr|globenewswire|businesswire|accesswire|newswire|prweb|facebook|yelp|avvo|justia|findlaw|linkedin|lawyers\.com|martindale|instagram|youtube|nolo|lawinfo', re.I)
SUFFIX = re.compile(r'\b(llp|llc|pllc|p\.?c\.?|p\.?a\.?|apc|esq\.?|attorneys? at law|law offices? of|law office of|law firm of|the)\b', re.I)


def core_name(name):
    n = SUFFIX.sub(' ', name or '')
    n = re.sub(r'[^a-z0-9 ]', ' ', n.lower().replace('&', ' and '))
    return ' '.join(n.split())


def parse(xml, name, city, today=None):
    """-> list of {source, year, title, url} that pass the rules above, newest first."""
    today = today or datetime.date.today()
    core = core_name(name); out = []
    if not core or len(core) < 8: return out
    soup = BeautifulSoup(xml, 'xml')
    for it in soup.find_all('item'):
        t = (it.find('title').get_text() if it.find('title') else '').strip()
        src = (it.find('source').get_text() if it.find('source') else '').strip()
        if src and t.endswith(' - ' + src): t = t[:-len(' - ' + src)].strip()
        if not t or not src or NOT_PRESS.search(src): continue
        tn = re.sub(r'[^a-z0-9 ]', ' ', t.lower().replace('&', ' and '))
        if core not in ' '.join(tn.split()): continue
        if not (city.lower() in t.lower() or re.search(r'law firm|attorney|lawyer|law office|legal', t, re.I)): continue
        if BAD.search(t) or not GOOD.search(t): continue
        try: d = email.utils.parsedate_to_datetime(it.find('pubDate').get_text()).date()
        except Exception: continue
        if (today - d).days > 6 * 365 or d > today: continue
        out.append({'source': src[:60], 'year': d.year, 'title': t[:160], 'url': (it.find('link').get_text() if it.find('link') else '').strip(), '_d': d})
    out.sort(key=lambda x: x['_d'], reverse=True)
    seen, final = set(), []
    for x in out:
        if x['source'] in seen: continue
        seen.add(x['source']); x.pop('_d'); final.append(x)
    return final[:3]


def main():
    st = sys.argv[1].upper(); d = os.path.join('data', 'states', st)
    rows = list(csv.DictReader(open(os.path.join(d, 'selected.csv'))))
    enr = {}
    p = os.path.join(d, 'enriched.jsonl')
    if os.path.exists(p):
        for l in open(p):
            try: j = json.loads(l); enr[j['overture_id']] = j
            except Exception: pass
    res = {}; sess = requests.Session(); sess.headers['User-Agent'] = UA; fails = 0; looked = 0
    for r in rows:
        e = enr.get(r['overture_id']) or {}
        if not (e.get('ok') and e.get('logo') and e.get('cover')): continue
        q = urllib.parse.quote(f'"{r["name"]}" {r["city"]}')
        try:
            resp = sess.get(f'https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en', timeout=15)
            looked += 1
            if resp.status_code != 200: fails += 1; print('press lookup', resp.status_code, r['name'][:40]);
            else:
                hits = parse(resp.content, r['name'], r['city'])
                if hits: res[r['overture_id']] = hits
        except Exception as ex:
            fails += 1; print('press lookup failed:', repr(ex)[:80])
        if fails >= 4 and not res: print('press lookups are not working from here; skipping the rest'); break
        time.sleep(1.5)
    json.dump(res, open(os.path.join(d, 'press.json'), 'w'), ensure_ascii=False, indent=1)
    print(f'{st} press: looked up {looked} firms, found coverage for {len(res)}')


if __name__ == '__main__':
    main()
