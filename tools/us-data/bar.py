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


def seo_score(areas, about_words, facts, lawyers, has_hours, has_social, has_recognition, has_reviews):
    """0-100. areas: practice areas listed; about_words: words in the biography; facts: firm-specific facts; lawyers: named lawyers."""
    s = min(areas, 5) * 4                       # up to 20
    s += min(about_words, 300) / 300 * 15       # up to 15
    s += min(facts, 8) * 2.5                    # up to 20
    s += min(lawyers, 5) * 3                    # up to 15
    s += 10 if has_hours else 0
    s += 5 if has_social else 0
    s += 5 if has_recognition else 0
    s += 10 if has_reviews else 0
    return round(s)
