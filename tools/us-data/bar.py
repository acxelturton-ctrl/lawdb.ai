"""The bar for a firm to be listed, in one place: switches in small text files, and the SEO score.

Switches (tools/us-data/*.txt, edited by a pull request):
  hours_required.txt   yes / no   a firm must list opening hours (no: a firm without hours can be listed)
  seo_min.txt          a number   the lowest SEO score a new firm may have to be listed
  reviews_required.txt yes / no   (see google_reviews.py) three good Google reviews
The SEO score (0 to 100) rewards what search engines and visitors reward on a profile page: several practice areas, a long biography with
firm-specific facts, named lawyers, opening hours, social profiles, awards or press, and Google reviews. Logo, cover photo, a practice area,
a biography and one named lawyer are always required on top of it.
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))


def _read(name, default):
    try: return open(os.path.join(HERE, name)).read().strip().lower() or default
    except OSError: return default


def hours_required(): return _read('hours_required.txt', 'yes') == 'yes'


def seo_min():
    try: return int(_read('seo_min.txt', '0'))
    except ValueError: return 0


# Legal directories whose profile pages count as a trust signal when the firm's own site links to one (the link must go to a profile, not the home page)
DIRECTORIES = {'avvo.com': 'Avvo', 'martindale.com': 'Martindale-Hubbell', 'lawyers.com': 'Lawyers.com', 'superlawyers.com': 'Super Lawyers', 'justia.com': 'Justia',
               'findlaw.com': 'FindLaw', 'lawinfo.com': 'LawInfo', 'bestlawyers.com': 'Best Lawyers', 'nolo.com': 'Nolo'}
# Online booking tools: a firm that lets people book a time on its own site
BOOKING_HOSTS = r'(?:^|\.)(calendly\.com|acuityscheduling\.com|setmore\.com|youcanbook\.me|squareup\.com|schedulicity\.com|hubspot\.com|zcal\.co|tidycal\.com|savvycal\.com|appointlet\.com|simplybook\.me|cal\.com)$'


def extras_points(e):
    """0-15 bonus from what the firm's own site offers, all of it read by enrich.py: client perks (free consultation, contingency, 24/7, virtual), languages,
    articles, a booking link or contact form, and links to legal directory profiles (Avvo, Martindale, Super Lawyers, Justia ...)."""
    e = e or {}
    fx = e.get('facts') or {}
    n = 0
    n += sum(1 for k in ('free_consultation', 'contingency', 'available_24_7', 'virtual_consultations') if fx.get(k))   # up to 4
    n += 2 if e.get('languages') else 0
    posts = len([p for p in (e.get('posts') or []) if p.get('title') and p.get('url')])
    n += 3 if posts >= 3 else (1 if posts else 0)
    n += 1 if (e.get('booking') or e.get('contact_form')) else 0
    n += min(len(e.get('directories') or []), 3) * 2                                                                  # up to 6
    return min(n, 15)


def has_reviews(google_items, testimonials):
    """the firm has at least three good Google reviews, or at least two testimonials on its own website (a firm shows what it has: one or two are shown too, only two or more count for the score and for reviews_required.txt)"""
    return len(google_items or []) >= 3 or len(testimonials or []) >= 2


def seo_score(areas, about_words, facts, lawyers, has_hours, has_social, has_recognition, has_reviews, extras=0):
    """0-100. areas: practice areas listed; about_words: words in the biography; facts: firm-specific facts; lawyers: named lawyers; extras: extras_points()."""
    s = min(areas, 5) * 4                       # up to 20
    s += min(about_words, 300) / 300 * 15       # up to 15
    s += min(facts, 8) * 2.5                    # up to 20
    s += min(lawyers, 5) * 3                    # up to 15
    s += 10 if has_hours else 0
    s += 5 if has_social else 0
    s += 5 if has_recognition else 0
    s += 10 if has_reviews else 0
    s += extras
    return min(round(s), 100)
