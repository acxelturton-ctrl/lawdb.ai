#!/usr/bin/env python3
"""Testimonials a firm publishes on its own website, read by enrich.py while it crawls the site (polite: robots.txt, one request a second).

What counts: a client's words that the firm put on its own pages, found in one of three places
  A. schema.org Review markup (reviewBody) in the page's structured data,
  B. an element the site itself labels as a testimonial or review (class or id such as testimonial, review, client-feedback, kind-words),
  C. a quotation (blockquote or q) on a page whose address or title says it is the firm's testimonials or reviews page.
Then every item must pass the same checks: 60 to 500 characters, first person plus an experience or praise word (this drops marketing copy and
"request a quote" boxes), no phone number, address, link or e-mail, not inside a form, menu or header. The author is kept only if it is a short,
name-like line next to the quote ("Maria G."); otherwise the page says "A client of the firm".

These are the firm's own words about itself, not verified by LawDB, and the page says so. They are never marked up as review structured data.
"""
import difflib
import re

MIN_CHARS, MAX_CHARS, WANT, KEEP, ENOUGH = 60, 500, 3, 5, 2   # WANT: keep looking for more until there are three; ENOUGH: two count as proof of good reviews
LABEL = re.compile(r'testimonial|review|client[-_ ]?(?:say|feedback|stor|quote|love|comment)|kind[-_ ]?words|what[-_ ]?(?:our|people|clients)[-_ ]?say|praise', re.I)
PAGE_HINT = re.compile(r'testimonial|reviews?\b|client[-_ ]?(?:say|feedback|stor)|what[-_ ]?(?:our[-_ ])?clients', re.I)
FIRST_PERSON = re.compile(r"\b(?:I|I'm|I've|I'd|I'll|my|me|we|we're|we've|our|us)\b", re.I)
PRAISE = re.compile(r'thank|recommend|helped|help me|helping|professional|excellent|great|amazing|awesome|best|grateful|highly|knowledgeable|responsive|caring|compassion|patient|honest|kind|outstanding|fantastic|wonderful|stress|relief|handled|resolved|settle|fought|above and beyond|exceeded|trust|friendly|communicat|answered|explained|worked hard|results', re.I)
BAD = re.compile(r'click here|read more|learn more|call us|call now|all rights reserved|©|privacy policy|cookies?|subscribe|newsletter|attorney advertising|https?://|www\.|@|\b\d{3}[-. )]\s?\d{3}[-. ]\d{4}\b|\blorem ipsum\b', re.I)
FORMISH = re.compile(r'best time to call|briefly,? what|what happened|morning\s+afternoon|any time\s+morning|submit|captcha|required field|your (?:name|email|phone)|send (?:us )?a message|request a (?:free )?(?:consultation|case|callback)|reach out to us|fill out|disclaimer|terms of use', re.I)
SKIP_PARENTS = ('form', 'nav', 'header', 'script', 'style', 'noscript', 'select', 'button')
AUTHOR_SEL = ['cite', 'figcaption', '[itemprop=author]', '[class*=author]', '[class*=reviewer]', '[class*=client]', '[class*=name]', 'footer', 'strong', 'b']


def clean(t):
    t = re.sub(r'\s+', ' ', t or '').strip()
    t = re.sub(r'^[“”"‘’\']+|[“”"‘’\']+$', '', t).strip()
    return t


def usable(text):
    if not (MIN_CHARS <= len(text) <= MAX_CHARS) or BAD.search(text) or FORMISH.search(text) or text.isupper(): return False
    if '?' in text[:80] or len(text.split()) < 12 or not re.search(r'[.!\u2026]', text): return False   # a question at the start, a fragment, or words with no sentence in them: a form, not a testimonial
    if GENERIC_START.search(text) or len(re.findall(r'\byou(?:r|rs)?\b', text, re.I)) >= 3 and not SINGULAR.search(text): return False   # the firm talking about itself, or to the reader
    voice = SINGULAR.search(text) or (re.search(r"\b(?:we|our|us)\b", text, re.I) and THEY.search(text))   # a client speaking: I / my / me, or "we" about them
    return bool(voice and PRAISE.search(text))


NAME_NOISE = re.compile(r'\b(?:happy|satisfied|verified|former|past|current|previous|google|yelp|facebook|avvo)?\s*(?:client|customer|review(?:er)?|testimonial)s?\b', re.I)
TOPIC_WORDS = re.compile(r'divorc|custody|conservator|guardian|probate|estate|injur|accident|dui\b|dwi\b|criminal|immigra|bankrupt|litigat|attorney|lawyer|\blaw\b|\bfirm\b|paralegal|esq|spouse|case\b|matter\b|real estate|employment|tickets?', re.I)


def author_ok(a):
    """a person's name as the page shows it: the first part of "Maria G. - Divorce" or "Angelo L., Litigation Attorney", without labels such as HAPPY CLIENT, and never a topic or heading"""
    a = clean(re.sub(r'^(?:[-\u2013\u2014~]+\s*|by\s+|posted by\s+|reviewed by\s+|client:?\s+)', '', clean(a), flags=re.I))
    a = re.sub(r'\s*[\u00b7|,]\s*(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.? \d{1,2},? \d{4}|\d+ (?:day|week|month|year)s? ago).*$', '', a, flags=re.I)
    a = clean(re.split(r'\s+[-\u2013\u2014|\u00b7]\s+|\s*\|\s*|,\s+(?!(?i:jr|sr|ii|iii))', a, maxsplit=1)[0])   # only the part before a dash, bar or comma
    a = clean(NAME_NOISE.sub('', a))
    m = re.match(r"^([A-Z]{2,3})\s+(.+)$", a)   # an avatar's initials in front of the name: "SO Sandra O."
    if m:
        initials = ''.join(w[0] for w in re.findall(r"[A-Za-z][\w'\u2019.-]*", m.group(2))).upper()
        if initials.startswith(m.group(1)): a = m.group(2)
    if not a or len(a) > 60 or len(a.split()) > 5 or TOPIC_WORDS.search(a) or re.search(r'\d|@|http|www|stars?|read more|google|yelp|avvo|facebook', a, re.I): return ''
    return a if re.fullmatch(r"[A-Za-z][A-Za-z .,'\u2019-]*", a) else ''


def quote_text(q):
    """the words of a quotation without its citation line (cite, footer, figcaption inside it)"""
    keep = []
    for t in q.find_all(string=True):
        skip = False
        for p in t.parents:
            if p is q: break
            if p.name in ('cite', 'footer', 'figcaption'): skip = True; break
        if not skip: keep.append(str(t))
    return clean(' '.join(keep))


WIDGET_HEAD = re.compile(r"^\s*([A-Z][A-Za-z'\u2019.-]+(?: [A-Z][A-Za-z'\u2019.-]+){0,3})\s+(?:\d+|an?|one)\s+(?:minute|hour|day|week|month|year)s?\s+ago\b[\s:,.-]*")
STARS = re.compile(r'[\s\u2605\u2606\u2B50\uFE0F\u2729\u272D*]+$')


ARTIFACT_HEAD = re.compile(r'^[A-Z]+(?:[-_][A-Z]+)+\s+(?=[A-Z])')   # "R-CONTENT Attorney Natalie ..." (a widget's label stuck to the words)
GENERIC_START = re.compile(r"^(?:the best way|when you|if you|are you|looking for|at our firm|our (?:firm|team|attorneys|lawyers|clients|goal|mission)|we (?:are|will|believe|offer|provide|pride|fight|help|understand|know)|you (?:deserve|need|can|should)|call us|contact us)\b", re.I)
SINGULAR = re.compile(r"\b(?:I|I'm|I've|I'd|I'll|my|me)\b")
THEY = re.compile(r'\b(?:they|he|she|him|her|them|his|their|team|staff|firm|attorneys?|lawyers?)\b', re.I)


def unwidget(text):
    """a review widget puts the reviewer and the time in front of the words ("Karina Rangel 5 years ago Jenny is the best ...") and stars after them: returns (reviewer or '', the words alone)"""
    text = clean(text)
    text = ARTIFACT_HEAD.sub('', text)
    m = WIDGET_HEAD.match(text)
    who = ''
    if m: who, text = m.group(1), text[m.end():]
    return who, clean(STARS.sub('', text))


def item(text, author, url):
    who, text = unwidget(text)
    return {'text': text, 'author': author_ok(who) or author_ok(author), 'url': url[:300]} if usable(text) else None


def _inside_skipped(el):
    return any(p.name in SKIP_PARENTS for p in el.parents)


def _owner(a, item_ids):
    """the nearest testimonial (quote or box) an element sits in, or None"""
    for x in [a, *a.parents]:
        if id(x) in item_ids: return id(x)
    return None


def _author_near(box, quote_el, own_ids, item_ids, labelled):
    """a short name-like line that belongs to THIS quote: in its own box, or in a box around it that holds only this testimonial. A name that sits inside another testimonial is never borrowed."""
    scope = box
    for _ in range(3):
        if scope is None or scope.name in (None, '[document]', 'body', 'html', 'main'): break
        for sel in AUTHOR_SEL:
            for a in scope.select(sel):
                if a is quote_el: continue
                if quote_el is not None and quote_el in a.parents and a.name not in ('cite', 'footer', 'figcaption'): continue   # inside the quote itself only a citation line can be the author
                if _owner(a, item_ids) not in (None, *own_ids): continue   # it belongs to a different testimonial
                got = author_ok(a.get_text(' '))
                if got: return got
        if len(scope.get_text(' ', strip=True)) > 1500: break
        scope = scope.parent
    if labelled:   # "... — Maria G." at the end of the box's text
        m = re.search(r'[\u2014\u2013-]\s*([A-Z][A-Za-z .\'\u2019-]{1,40})\s*$', clean(box.get_text(' ')))
        return author_ok(m.group(1)) if m else ''
    return ''


def from_jsonld(ld_objs, url):
    out = []
    for o in ld_objs or []:
        ty = o.get('@type'); ty = ' '.join(ty) if isinstance(ty, list) else str(ty or '')
        if 'Review' in ty and isinstance(o.get('reviewBody'), str):
            a = o.get('author'); a = a.get('name', '') if isinstance(a, dict) else (a if isinstance(a, str) else '')
            it = item(o['reviewBody'], a, url)
            if it: out.append(it)
    return out


def from_page(soup, url, title=''):
    """items from one parsed page (B and C above); structured data (A) is read once for the whole site by from_jsonld"""
    entries = []   # (box, quote element, text, is a labelled box)
    labelled = [el for el in soup.find_all(True) if LABEL.search(' '.join(el.get('class', [])) + ' ' + (el.get('id') or '')) and not _inside_skipped(el)]
    ids = {id(e) for e in labelled}
    for el in labelled:
        if any(id(d) in ids for d in el.find_all(True)): continue   # a wrapper around the real items: its children are read instead
        quote_el = el.find(['blockquote', 'q']) or None
        if quote_el is None:
            ps = [p for p in el.find_all(['p', 'div', 'span']) if MIN_CHARS <= len(clean(p.get_text(' '))) <= MAX_CHARS]
            quote_el = max(ps, key=lambda p: len(clean(p.get_text(' ')))) if ps else el
        who, text = unwidget(quote_text(quote_el))
        if usable(text): entries.append((el, quote_el, text, True, who))
    if PAGE_HINT.search(urlpath(url) + ' ' + title):
        for q in soup.find_all(['blockquote', 'q']):
            if _inside_skipped(q) or any(q is e[1] for e in entries): continue
            who, text = unwidget(quote_text(q))
            if usable(text): entries.append((q, q, text, False, who))
    item_ids = {id(e[1]) for e in entries} | {id(e[0]) for e in entries if e[3]}
    out = []
    for box, quote_el, text, lab, who in entries:
        own = {id(quote_el)} | ({id(box)} if lab else set())
        out.append({'text': text, 'author': author_ok(who) or _author_near(box, quote_el, own, item_ids, lab), 'url': url[:300]})   # a reviewer named in front of the words beats a name found elsewhere in the box
    return out


def urlpath(url):
    return re.sub(r'^https?://[^/]+', '', url or '')


def _norm(t):
    return re.sub(r'[^a-z0-9]+', '', (t or '').lower())


def same(a, b):
    """the same testimonial, even when one copy is shorter (a slider's clone, a version cut short, a heading in front): equal, one inside the other, the same opening, or nearly the same text"""
    na, nb = _norm(a), _norm(b)
    if not na or not nb: return False
    if na == nb or na in nb or nb in na: return True
    k = min(40, len(na), len(nb))
    if k >= 25 and na[:k] == nb[:k]: return True                      # the same opening words
    if len(na) >= 25 and len(nb) >= 25 and na[-25:] == nb[-25:]: return True   # the same closing words
    return difflib.SequenceMatcher(None, na, nb).ratio() >= 0.8


def pick(items, n=KEEP):
    """de-duplicated (see same()), best first: named authors first, then lengths that read well (about 120 to 320 characters). Of two copies the one with a name, then the longer, is kept."""
    kept = []
    for it in sorted(items, key=lambda it: (0 if it['author'] else 1, -len(it['text']))):
        if any(same(it['text'], k['text']) for k in kept): continue
        kept.append(it)
    # the same person never twice: of two testimonials with one name the better is kept. A name on three or more is a label shared by the whole box (an owner or page name), not a reviewer: the name is dropped, the words stay.
    names = {}
    for it in kept:
        if it['author']: names[it['author'].lower()] = names.get(it['author'].lower(), 0) + 1
    seen, out = set(), []
    for it in kept:
        a = it['author'].lower()
        if a and names[a] >= 3: out.append({**it, 'author': ''}); continue
        if a and a in seen: continue
        if a: seen.add(a)
        out.append(it)
    out.sort(key=lambda it: (0 if it['author'] else 1, abs(len(it['text']) - 220)))
    return out[:n]


def has_enough(items):
    return len(items or []) >= WANT   # stop looking for more pages when there are three


if __name__ == '__main__':
    import json, sys
    from bs4 import BeautifulSoup
    html = open(sys.argv[1]).read() if len(sys.argv) > 1 else sys.stdin.read()
    print(json.dumps(from_page(BeautifulSoup(html, 'lxml'), 'https://example.test/testimonials'), indent=1))
