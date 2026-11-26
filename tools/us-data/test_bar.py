import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bar as B
assert B.seo_score(1, 120, 1, 1, False, False, False, False) < 45        # the bare minimum is not enough
assert B.seo_score(4, 220, 4, 3, False, True, False, False) >= 45        # a rich profile without hours passes
assert B.seo_score(5, 300, 8, 5, True, True, True, True) == 100
assert B.seo_score(9, 999, 99, 99, True, True, True, True) == 100        # capped
assert B.seo_score(0, 0, 0, 0, False, False, False, False) == 0
assert B.seo_score(3, 150, 3, 2, True, False, False, False) > B.seo_score(3, 150, 3, 2, False, False, False, False)   # hours add to the score
# the bonus from what the firm's own site offers (0-15)
assert B.extras_points(None) == 0 and B.extras_points({}) == 0
rich = {'facts': {'free_consultation': True, 'contingency': True, 'available_24_7': True, 'virtual_consultations': True}, 'languages': ['Spanish'],
        'posts': [{'title': 'a', 'url': 'u'}] * 3, 'booking': 'https://calendly.com/x', 'directories': [{'name': 'Avvo', 'url': 'u'}, {'name': 'Justia', 'url': 'u'}, {'name': 'FindLaw', 'url': 'u'}, {'name': 'Nolo', 'url': 'u'}]}
assert B.extras_points(rich) == 15                                    # 4 + 2 + 3 + 1 + 6 = 16, capped at 15
assert B.extras_points({'facts': {'free_consultation': True}}) == 1
assert B.extras_points({'languages': ['Spanish']}) == 2
assert B.extras_points({'posts': [{'title': 'a', 'url': 'u'}]}) == 1
assert B.extras_points({'contact_form': True}) == 1
assert B.seo_score(3, 150, 3, 2, False, False, False, False, 15) == B.seo_score(3, 150, 3, 2, False, False, False, False) + 15
assert B.seo_score(5, 300, 8, 5, True, True, True, True, 15) == 100    # never above 100
import re
assert re.search(B.BOOKING_HOSTS, 'calendly.com') and re.search(B.BOOKING_HOSTS, 'app.acuityscheduling.com') and not re.search(B.BOOKING_HOSTS, 'notcalendly.com.evil.io')
assert 'avvo.com' in B.DIRECTORIES and 'justia.com' in B.DIRECTORIES
print('bar: ok')
