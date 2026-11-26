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
import re

MIN_CHARS, MAX_CHARS, WANT, KEEP = 60, 500, 3, 5
LABEL = re.compile(r'testimonial|review|client[-_ ]?(?:say|feedback|stor|quote|love|comment)|kind[-_ ]?words|what[-_ ]?(?:our|people|clients)[-_ ]?say|praise', re.I)
PAGE_HINT = re.compile(r'testimonial|reviews?\b|client[-_ ]?(?:say|feedback|stor)|what[-_ ]?(?:our[-_ ])?clients', re.I)
FIRST_PERSON = re.compile(r"\b(?:I|I'm|I've|I'd|I'll|my|me|we|we're|we've|our|us)\b", re.I)
PRAISE = re.compile(r'thank|recommend|helped|help me|helping|professional|excellent|great|amazing|awesome|best|grateful|highly|knowledgeable|responsive|caring|compassion|patient|honest|kind|outstanding|fantastic|wonderful|stress|relief|handled|resolved|settle|fought|above and beyond|exceeded|trust|friendly|communicat|answered|explained|worked hard|results', re.I)
BAD = re.compile(r'click here|read more|learn more|call us|call now|all rights reserved|©|privacy policy|cookies?|subscribe|newsletter|attorney advertising|https?://|www\.|@|\b\d{3}[-. )]\s?\d{3}[-. ]\d{4}\b|\blorem ipsum\b', re.I)
SKIP_PARENTS = ('form', 'nav', 'header', 'script', 'style', 'noscript', 'select', 'button')
AUTHOR_SEL = ['cite', 'figcaption', '[itemprop=author]', '[class*=author]', '[class*=reviewer]', '[class*=client]', '[class*=name]', 'footer', 'strong', 'b']


def clean(t):
    t = re.sub(r'\s+', ' ', t or '').strip()
    t = re.sub(r'^[“”"‘’\']+|[“”"‘’\']+$', '', t).strip()
    return t


def usable(text):
    return MIN_CHARS <= len(text) <= MAX_CHARS and not BAD.search(text) and FIRST_PERSON.search(text) and PRAISE.search(text) and ' ' in text and not text.isupper()


def author_ok(a):
    a = clean(re.sub(r'^(?:[-–—~]+\s*|by\s+|posted by\s+|reviewed by\s+|client:?\s+)', '', clean(a), flags=re.I))
    a = re.sub(r'\s*[·|,]\s*(?:\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\.? \d{1,2},? \d{4}|\d+ (?:day|week|month|year)s? ago).*$', '', a, flags=re.I)
    if not a or len(a) > 60 or len(a.split()) > 6 or re.search(r'\d|@|http|www|stars?|review|testimonial|read more|google|yelp|avvo|facebook', a, re.I): return ''
    return a if re.fullmatch(r"[A-Za-z][A-Za-z .,'’-]*", a) else ''


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


def item(text, author, url):
    text = clean(text)
    return {'text': text, 'author': author_ok(author), 'url': url[:300]} if usable(text) else None


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
        text = quote_text(quote_el)
        if usable(text): entries.append((el, quote_el, text, True))
    if PAGE_HINT.search(urlpath(url) + ' ' + title):
        for q in soup.find_all(['blockquote', 'q']):
            if _inside_skipped(q) or any(q is e[1] for e in entries): continue
            text = quote_text(q)
            if usable(text): entries.append((q, q, text, False))
    item_ids = {id(e[1]) for e in entries} | {id(e[0]) for e in entries if e[3]}
    out = []
    for box, quote_el, text, lab in entries:
        own = {id(quote_el)} | ({id(box)} if lab else set())
        out.append({'text': text, 'author': _author_near(box, quote_el, own, item_ids, lab), 'url': url[:300]})
    return out


def urlpath(url):
    return re.sub(r'^https?://[^/]+', '', url or '')


def pick(items, n=KEEP):
    """de-duplicated, best first: named authors first, then lengths that read well (about 120 to 320 characters)"""
    seen, out = set(), []
    for it in items:
        key = re.sub(r'\W+', '', it['text'].lower())[:80]
        if key in seen: continue
        seen.add(key); out.append(it)
    out.sort(key=lambda it: (0 if it['author'] else 1, abs(len(it['text']) - 220)))
    return out[:n]


def has_enough(items):
    return len(items or []) >= WANT


if __name__ == '__main__':
    import json, sys
    from bs4 import BeautifulSoup
    html = open(sys.argv[1]).read() if len(sys.argv) > 1 else sys.stdin.read()
    print(json.dumps(from_page(BeautifulSoup(html, 'lxml'), 'https://example.test/testimonials'), indent=1))
