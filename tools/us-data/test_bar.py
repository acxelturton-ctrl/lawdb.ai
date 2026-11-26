import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bar as B
assert B.seo_score(1, 120, 1, 1, False, False, False, False) < 45        # the bare minimum is not enough
assert B.seo_score(4, 220, 4, 3, False, True, False, False) >= 45        # a rich profile without hours passes
assert B.seo_score(5, 300, 8, 5, True, True, True, True) == 100
assert B.seo_score(9, 999, 99, 99, True, True, True, True) == 100        # capped
assert B.seo_score(0, 0, 0, 0, False, False, False, False) == 0
assert B.seo_score(3, 150, 3, 2, True, False, False, False) > B.seo_score(3, 150, 3, 2, False, False, False, False)   # hours add to the score
print('bar: ok')
