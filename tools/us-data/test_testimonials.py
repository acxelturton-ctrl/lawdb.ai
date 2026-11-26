"""Tests for the testimonial reader: python3 tools/us-data/test_testimonials.py  (needs beautifulsoup4 and lxml)"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from bs4 import BeautifulSoup
import testimonials as T

n = 0
def ok(c, m):
    global n; assert c, m; n += 1
def soup(h): return BeautifulSoup(h, 'lxml')
def page(h, url='https://firm.test/', title=''): return T.from_page(soup(h), url, title)

Q1 = 'I could not have asked for a better lawyer. She answered every question, explained each step and I felt supported the whole time.'
Q2 = 'Our family is so grateful. The team handled our case with real compassion and I would recommend them to anyone going through a divorce.'
Q3 = 'They were professional, responsive and honest with me from the first call. Highly recommend this firm for a car accident case.'

# a labelled card with the author in its own element
r = page(f'<div class="testimonial-card"><p>{Q1}</p><span class="name">Maria G.</span></div>')
ok(len(r) == 1 and r[0]['text'] == Q1 and r[0]['author'] == 'Maria G.', 'a labelled card with an author')

# a wrapper around three cards gives three items, not one lump
r = page(f'<section class="testimonials"><div class="testimonial"><p>{Q1}</p><cite>Maria G.</cite></div><div class="testimonial"><p>{Q2}</p><cite>The Okafor family</cite></div><div class="testimonial"><p>{Q3}</p></div></section>')
ok(len(r) == 3, f'three cards, three items (got {len(r)})')
ok({x['author'] for x in r} == {'Maria G.', 'The Okafor family', ''}, 'each keeps its own author, and a missing one stays empty')

# a quotation on the firm's testimonials page counts; on any other page it does not
html = f'<blockquote>{Q1}<cite>- John Smith</cite></blockquote>'
r = page(html, 'https://firm.test/testimonials')
ok(len(r) == 1 and r[0]['author'] == 'John Smith', 'a blockquote on the testimonials page, dash removed from the author')
ok(page(html, 'https://firm.test/about-us') == [], 'a blockquote on an ordinary page is not taken')
ok(len(page(html, 'https://firm.test/our-work', 'What Our Clients Say | Firm')) == 1, 'a page titled "What Our Clients Say" counts')

# two quotations in one box: the one with no name does not borrow the other's
r = page(f'<div class="wrap"><blockquote>{Q1}<cite>Maria G.</cite></blockquote><blockquote>{Q2}</blockquote></div>', 'https://firm.test/testimonials')
ok(len(r) == 2 and sorted(x['author'] for x in r) == ['', 'Maria G.'], 'a quotation without a name stays without one')

# bare quotations straight in the page, names on only some: each name stays with its own quote
r = page(f'<blockquote>{Q1}<cite>Pat R.</cite></blockquote><blockquote>{Q2}</blockquote><blockquote>{Q3}<cite>Lee S.</cite></blockquote>', 'https://firm.test/testimonials')
by = {x['text']: x['author'] for x in r}
ok(by == {Q1: 'Pat R.', Q2: '', Q3: 'Lee S.'}, f'names stay with their own quotes ({by})')
r = page(f'<figure><blockquote>{Q1}</blockquote><figcaption>Sandra T.</figcaption></figure><figure><blockquote>{Q2}</blockquote></figure>', 'https://firm.test/reviews')
by = {x['text']: x['author'] for x in r}
ok(by == {Q1: 'Sandra T.', Q2: ''}, f'a figcaption belongs to its own figure ({by})')
ok(all(x['text'] and 'Pat R' not in x['text'] for x in page(f'<blockquote>{Q1}<cite>Pat R.</cite></blockquote>', 'https://firm.test/testimonials')), 'the citation line is not part of the quote')

# marketing copy, boxes and contact details are refused
ok(page('<div class="review-cta"><p>Read our reviews on Google! Call us today for a free consultation and learn more about our team.</p></div>') == [], 'a review-us box is not a testimonial')
ok(page('<form><div class="quote-box"><p>Request a free quote and we will respond to your message within one business day, thank you.</p></div></form>') == [], 'nothing inside a form')
ok(page('<nav><div class="testimonial"><p>' + Q1 + '</p></div></nav>') == [], 'nothing inside the menu')
ok(page(f'<div class="testimonial"><p>{Q1} Call me at (305) 555-0142.</p></div>') == [], 'a phone number is refused')
ok(page(f'<div class="testimonial"><p>{Q1} See https://x.test for more.</p></div>') == [], 'a link is refused')
ok(page('<div class="testimonial"><p>Great lawyer, thank you so much for all of your help.</p></div>') == [], 'too short is refused')
ok(page('<div class="testimonial"><p>' + ('I recommend them, they helped me a great deal. ' * 20) + '</p></div>') == [], 'too long is refused')
ok(page('<div class="testimonial"><p>We fight for the maximum compensation you deserve in every personal injury case that we take on.</p></div>') == [], 'firm marketing copy (no praise from a client) is refused')

# authors: dates and review-site labels are cleaned or dropped
r = page(f'<div class="review"><p>{Q1}</p><span class="author">Maria G. · 3 months ago</span></div>')
ok(r and r[0]['author'] == 'Maria G.', 'a date after the name is dropped')
r = page(f'<div class="review"><p>{Q1}</p><span class="author">Google Review, 5 stars</span></div>')
ok(r and r[0]['author'] == '', 'a label that is not a name is not used as one')
r = page(f'<div class="testimonial"><p>{Q1}</p><p>&mdash; Sandra T.</p></div>')
ok(r and r[0]['author'] == 'Sandra T.', 'a trailing dash and name is found')

# structured data
ld = [{'@type': 'Review', 'reviewBody': Q2, 'author': {'@type': 'Person', 'name': 'Chris P.'}}, {'@type': 'Review', 'reviewBody': 'Nice.', 'author': 'X'}, {'@type': 'LocalBusiness', 'name': 'Firm'}]
r = T.from_jsonld(ld, 'https://firm.test/')
ok(len(r) == 1 and r[0]['author'] == 'Chris P.', 'schema.org Review markup is read, short ones are not')

# picking
items = [{'text': Q3, 'author': '', 'url': 'u'}, {'text': Q1, 'author': 'Maria G.', 'url': 'u'}, {'text': Q1, 'author': 'Maria G.', 'url': 'u2'}] + [{'text': (f'I recommend them, they helped me a great deal number {i}. ' * 3).strip(), 'author': 'A', 'url': 'u'} for i in range(8)]
p = T.pick(items)
ok(len(p) == T.KEEP and len({x['text'] for x in p}) == T.KEEP, 'at most five, no duplicates')
ok(all(x['author'] for x in p), 'named authors come first')
ok(T.has_enough(p) and not T.has_enough(p[:2]), 'three are enough')

print(f'testimonials: ok ({n} checks)')
