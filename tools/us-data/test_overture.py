#!/usr/bin/env python3
"""norm_region: every way Overture writes a US state maps to the two-letter code."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pull_overture import norm_region, STATES
cases = {'TX': 'TX', 'US-TX': 'TX', 'Texas': 'TX', 'TEXAS': 'TX', 'tx.': 'TX', 'us-ny': 'NY', 'District of Columbia': 'DC', 'Ontario': '', '': '', None: ''}
for v, want in cases.items():
    assert norm_region(v) == want, (v, norm_region(v), want)
assert all(norm_region(s) == s for s in STATES)
print('overture region tests ok')
