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
items = [{'text': Q3, 'author': '', 'url': 'u'}, {'text': Q1, 'author': 'Maria G.', 'url': 'u'}, {'text': Q1, 'author': 'Maria G.', 'url': 'u2'}] + [{'text': t, 'author': 'Client ' + 'ABCDEFGH'[i], 'url': 'u'} for i, t in enumerate([
    'My divorce was handled quickly and kindly, and I never felt rushed. I recommend this firm to anyone who needs a calm, honest advocate.',
    'After my car accident I did not know where to turn. They fought the insurer for me and I am grateful for every phone call they returned.',
    'We needed a will and a trust for our two kids. The attorney explained every option in plain words and our whole family felt at ease.',
    'I was charged with a DUI and was terrified. My lawyer was professional, answered my calls at night and got the charge reduced. Highly recommend.',
    'They helped our small business through a contract dispute with a vendor, and I trust their judgment completely. Great communication throughout.',
    'The immigration team guided my wife and me through each form and interview. We are so thankful for their patience and kindness.',
    'I was fired without warning and they took my case seriously from day one. I would recommend them to anybody facing the same thing.',
    'Buying our first house felt overwhelming until this firm walked us through closing. They were friendly, responsive and thorough with us.'])]
p = T.pick(items)
ok(len(p) == T.KEEP and len({x['text'] for x in p}) == T.KEEP, 'at most five, no duplicates')
ok(all(x['author'] for x in p), 'named authors come first')
ok(T.has_enough(p) and not T.has_enough(p[:2]), 'three are enough')

# duplicates: the same testimonial twice, however the copies differ
A = 'Roy and especially America gave me 100% amazing service and I was so relieved. They explained everything so clearly. I will absolutely be recommending them to anyone who is looking for a firm who treats you like family and not a number.'
B = 'Roy and especially America gave me 100% amazing service and I was so relieved. I will absolutely be recommending them to anyone who is looking for a firm who treats you like family and not a number.'
C = 'Great experience. ' + A                                  # a heading or lead-in added in front
D = A.upper().replace('.', '')                               # shouting, no punctuation
E = A[:120]                                                  # cut short by a slider
one = lambda xs: len(T.pick([{'text': x, 'author': 'Sheila V.', 'url': 'u'} for x in xs])) == 1
ok(one([A, A]), 'the same text twice is one')
ok(one([A, B]), 'a copy with a sentence missing (the one in the screenshot) is one')
ok(one([A, C]) and one([A, D]) and one([A, E]), 'a lead-in, different case or punctuation, or a cut-short copy are one')
ok(T.same(A, B) and T.same(B, A), 'sameness does not depend on the order')
ok(not T.same(Q1, Q2) and not T.same(Q2, Q3) and not T.same(Q1, Q3), 'different testimonials stay different')
kept = T.pick([{'text': B, 'author': '', 'url': 'u'}, {'text': A, 'author': 'Sheila V.', 'url': 'u'}, {'text': Q1, 'author': 'Maria G.', 'url': 'u'}, {'text': E, 'author': '', 'url': 'u'}])
ok(len(kept) == 2 and {x['author'] for x in kept} == {'Sheila V.', 'Maria G.'}, 'of two copies the one with a name is kept')
two_pages = page(f'<div class="testimonial"><p>{A}</p><span class="name">Sheila V.</span></div><div class="testimonial"><p>{B}</p><span class="name">Sheila V.</span></div>')
ok(len(T.pick(two_pages)) == 1, 'slider clones on a page become one')

# a review widget: the reviewer and the time are in front of the words, stars after them, and one owner name sits in every box (the screenshot)
W = [('Karina Rangel', '5 years ago', "Jenny is simply the best ! She is very professional and attentive. She answers all your questions and works with you to make sure you understand every step of the process. I highly recommend them !"),
     ('Nancy Aragon', '6 years ago', 'it took a little longer than expected but she cooperated good with us, and made sure we were satisfied with the results, and at the end we got what we wanted and left here happy.'),
     ('Alena Escalante', '7 years ago', 'Jenny is amazing. She responded super fast. Office as well as Jenny is very organized. They were very detailed during the whole process and it was super easy. I would highly recommend it to everybody.')]
html = ''.join(f'<div class="review-item"><p>{who} {when} {body} \u2b50\u2b50\u2b50\u2b50\u2b50</p><span class="name">Bee Lopez</span></div>' for who, when, body in W)
r = T.pick(page(html))
ok(sorted(x['author'] for x in r) == ['Alena Escalante', 'Karina Rangel', 'Nancy Aragon'], f'the reviewer in front of the words is the author, not the shared owner name ({[x["author"] for x in r]})')
ok(all('years ago' not in x['text'] and '\u2b50' not in x['text'] and not x['text'].startswith(('Karina', 'Nancy', 'Alena')) for x in r), 'the reviewer, the time and the stars are not part of the words')
# the same person never twice
same_person = [{'text': Q1, 'author': 'Maria G.', 'url': 'u'}, {'text': Q2, 'author': 'Maria G.', 'url': 'u'}, {'text': Q3, 'author': 'Lee S.', 'url': 'u'}]
r = T.pick(same_person)
ok(len(r) == 2 and sorted(x['author'] for x in r) == ['Lee S.', 'Maria G.'], 'two testimonials from one name: only one is kept')
three = T.pick([{'text': Q1, 'author': 'Bee Lopez', 'url': 'u'}, {'text': Q2, 'author': 'bee lopez', 'url': 'u'}, {'text': Q3, 'author': 'Bee Lopez', 'url': 'u'}])
ok(len(three) == 3 and all(x['author'] == '' for x in three), 'one name on three is a shared label: the name is dropped, the words stay')

# real cases from firm sites: form text, and names with labels or topics
form = 'Briefly, what happened? Best time to call Any time Morning Afternoon After 5pm Back Request a free consultation Next Submit'
ok(page(f'<div class="review"><p>{form}</p></div>') == [], 'contact-form text is not a testimonial')
ok(page('<div class="testimonial"><p>Did we help you with your case? I would recommend them to anyone, they are great and very professional people.</p></div>') == [], 'a question at the start is not a testimonial')
ok(page('<div class="testimonial"><p>I would highly recommend this great firm to everyone I know</p></div>') == [], 'words with no sentence in them are not a testimonial')
for raw, want in [('Alison - Divorce with children', 'Alison'), ('Alissa J. HAPPY CLIENT', 'Alissa J.'), ('Angelo L., Litigation Attorney', 'Angelo L.'), ('Conservatorship', ''), ('Mark \u2013 Divorced with children', 'Mark'),
                  ('Maria G.', 'Maria G.'), ('Verified Client', ''), ('Google Review', ''), ('Divorce', ''), ('Susan | Divorce', 'Susan'), ('John Smith, Jr.', 'John Smith, Jr.'), ('Bob and Barbara Carpenter', 'Bob and Barbara Carpenter'), ('Dr. A. Patel', 'Dr. A. Patel')]:
    got = T.author_ok(raw)
    ok(got == want, f'author {raw!r} -> {got!r}, wanted {want!r}')

# more real cases: avatar initials, a widget label stuck to the words, marketing copy
for raw, want in [('SO Sandra O.', 'Sandra O.'), ('MT Michael T.', 'Michael T.'), ('ED Esther D.', 'Esther D.'), ('JC', 'JC'), ('Jack from Fort Lauderdale', 'Jack from Fort Lauderdale'), ('RW', 'RW')]:   # initials alone are how some clients sign: kept
    ok(T.author_ok(raw) == want, f'author {raw!r} -> {T.author_ok(raw)!r}, wanted {want!r}')
who, words = T.unwidget('R-CONTENT Attorney Natalie Lopez did her BIG ONE with my case. Got everything done and I recommend her to everyone.')
ok(words.startswith('Attorney Natalie Lopez') and 'R-CONTENT' not in words, 'a widget label stuck in front of the words is removed')
ok(page('<div class="testimonial"><p>The best way to get to know any law firm and the services it provides is to ask its past clients about their experience with the attorneys.</p></div>') == [], 'marketing copy is not a testimonial')
ok(page('<div class="testimonial"><p>At our firm we fight for you and we will help you get the great results you deserve in every case that you bring to us.</p></div>') == [], 'the firm talking about itself is not a testimonial')
ok(len(page('<div class="testimonial"><p>We were so grateful to the team. They handled our case with real compassion and we would recommend them to anyone.</p></div>')) == 1, '"we" about the firm in the third person is a client speaking')

print(f'testimonials: ok ({n} checks)')
