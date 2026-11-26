#!/usr/bin/env python3
"""Explore only: which values does Overture's address 'region' hold for the US law-firm rows? (the whole-country pull read 314,561 rows, but only about 7,000 matched a two-letter state code)"""
import collections, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import duckdb
from pull_overture import latest_release, list_files, fetch, STATES

rel = latest_release(); files = list_files(rel)
con = duckdb.connect(); con.execute('INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;')
lst = '[' + ','.join("'" + u + "'" for u in files) + ']'
geo = "((bbox.xmin BETWEEN -125.1 AND -66.5 AND bbox.ymin BETWEEN 24.3 AND 49.5) OR (bbox.xmin BETWEEN -171 AND -129 AND bbox.ymin BETWEEN 51 AND 72) OR (bbox.xmin BETWEEN -161 AND -154 AND bbox.ymin BETWEEN 18.5 AND 22.5)) AND addresses[1].country = 'US'"
rows = fetch(con, lst, geo, spool='data/states/_us_raw.parquet')
print('raw US rows:', len(rows))
c = collections.Counter(str(r['region']) for r in rows)
print('distinct region values:', len(c)); print('top 60:', c.most_common(60))
ok = sum(v for k, v in c.items() if k in STATES); print('rows whose region is a two-letter state code:', ok)
print('rows with a website:', sum(1 for r in rows if r['website']), '| with a phone:', sum(1 for r in rows if r['phone']), '| with street and city:', sum(1 for r in rows if r['street'] and r['city']))
cat = collections.Counter(str(r['cat']) for r in rows); print('top categories:', cat.most_common(25))
bad = [r for r in rows if str(r['region']) not in STATES][:8]
for r in bad: print('SAMPLE', {k: r[k] for k in ('name', 'cat', 'street', 'city', 'region', 'website', 'phone')})
