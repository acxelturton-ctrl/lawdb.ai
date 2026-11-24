import sys, os, datetime; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import google_reviews as G
NOW = datetime.datetime(2026, 11, 24, tzinfo=datetime.timezone.utc)
def rv(stars, text, lang='en', author='Pat Lee', t='2026-10-01T00:00:00Z'):
    return {'rating': stars, 'text': {'text': text, 'languageCode': lang}, 'authorAttribution': {'displayName': author, 'uri': 'https://maps.google.com/x'}, 'publishTime': t, 'relativePublishTimeDescription': '2 months ago'}
long = 'The firm handled my case with care and kept me informed at every step; I would recommend them to anyone. ' * 2
five = [rv(5, long), rv(5, long + 'More.'), rv(4, long), rv(3, long), rv(5, 'Great!')]
got = G.pick_reviews(five, NOW)
assert len(got) == 3 and all(g['rating'] >= 4 and len(g['text']) >= 80 for g in got), got       # the 3-star and the 6-character review are out
assert [g['rating'] for g in got] == [5, 5, 4]                                                     # best stars first
assert len(G.pick_reviews([rv(5, long), rv(5, long)], NOW)) == 2                                   # fewer than three good ones: fewer returned
assert G.pick_reviews([rv(5, long, lang='es')], NOW) == []                                         # English only
assert G.pick_reviews([rv(5, long, author='')], NOW) == []                                         # no reviewer name: not shown
assert G.pick_reviews([rv(5, 'x' * 1600)], NOW) == []                                              # too long
older = rv(5, long, t='2020-01-01T00:00:00Z'); newer = rv(5, long, author='New One')
assert G.pick_reviews([older, newer], NOW, n=1)[0]['author'] == 'New One'                          # same stars and length: the recent one wins
# the place must be the firm
pl = {'websiteUri': 'https://www.smithlaw.com/contact', 'nationalPhoneNumber': '(305) 555-0100'}
assert G.is_match(pl, 'smithlaw.com', '3055550100')
assert G.is_match({'websiteUri': 'https://other.com', 'nationalPhoneNumber': '(305) 555-0100'}, 'smithlaw.com', '3055550100')   # phone matches
assert not G.is_match({'websiteUri': 'https://other.com', 'nationalPhoneNumber': '(212) 555-0199'}, 'smithlaw.com', '3055550100')
assert not G.is_match({}, 'smithlaw.com', '')
assert G.digits10('+1 (305) 555-0100') == '3055550100'
print('reviews: ok')
