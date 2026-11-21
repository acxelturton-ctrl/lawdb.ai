#!/usr/bin/env python3
"""Temporary diagnostic: why does the Overture pull find so few law firms for a state? Prints schema and counts only."""
import sys, duckdb
sys.path.insert(0, 'tools/us-data')
from pull_overture import latest_release, list_files, BBOX
st = sys.argv[1].upper(); box = BBOX[st]
files = list_files(latest_release()); lst = '[' + ','.join("'" + u + "'" for u in files) + ']'
con = duckdb.connect(); con.execute('INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;')
print([ (r[0], r[1]) for r in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{files[0]}')").fetchall()][:40], flush=True)
geo = f"bbox.xmin BETWEEN {box[0]} AND {box[1]} AND bbox.ymin BETWEEN {box[2]} AND {box[3]} AND addresses[1].region = '{st}'"
for label, sql in [
 ('all places in bbox+region', f"SELECT count(*) FROM read_parquet({lst}) WHERE {geo}"),
 ('by operating_status', f"SELECT operating_status, count(*) FROM read_parquet({lst}) WHERE {geo} GROUP BY 1 ORDER BY 2 DESC"),
 ('law-ish taxonomy.primary / status', f"SELECT taxonomy.primary, operating_status, count(*) FROM read_parquet({lst}) WHERE {geo} AND (taxonomy.primary ILIKE '%law%' OR taxonomy.primary ILIKE '%attorney%' OR taxonomy.primary ILIKE '%legal%' OR list_contains(taxonomy.hierarchy,'lawyer')) GROUP BY 1,2 ORDER BY 3 DESC LIMIT 25"),
 ('law-ish categories.primary', f"SELECT categories.primary, count(*) FROM read_parquet({lst}) WHERE {geo} AND (categories.primary ILIKE '%law%' OR categories.primary ILIKE '%attorney%' OR categories.primary ILIKE '%legal%') GROUP BY 1 ORDER BY 2 DESC LIMIT 25"),
]:
    try: print(label, '->', con.execute(sql).fetchall(), flush=True)
    except Exception as e: print(label, 'ERROR', str(e)[:300], flush=True)
