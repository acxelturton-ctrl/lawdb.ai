import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pull_osm as P
els = [
 {'type': 'node', 'id': 1, 'lat': 41.5, 'lon': -81.7, 'tags': {'office': 'lawyer', 'name': 'Smith Law Office', 'addr:housenumber': '12', 'addr:street': 'Main St', 'addr:city': 'Cleveland', 'addr:postcode': '44114-1234', 'phone': '+1 216 555 0100', 'website': 'https://smithlaw.example'}},
 {'type': 'way', 'id': 2, 'center': {'lat': 39.9, 'lon': -83.0}, 'tags': {'office': 'lawyer', 'name': 'Jones & Jones LLP', 'contact:phone': '614-555-0101', 'contact:website': 'http://jones.example', 'addr:state': 'OH'}},
 {'type': 'node', 'id': 3, 'lat': 40.0, 'lon': -82.9, 'tags': {'office': 'lawyer'}},                      # no name: dropped
 {'type': 'node', 'id': 4, 'lat': 40.0, 'lon': -82.9, 'tags': {'office': 'lawyer', 'name': 'Elsewhere Law', 'addr:state': 'KY'}},   # another state: dropped
]
rows = P.osm_to_raw(els, 'OH')
assert [r['id'] for r in rows] == ['osm_node_1', 'osm_way_2'], rows
assert rows[0]['street'] == '12 Main St' and rows[0]['zip'] == '44114' and rows[0]['city'] == 'Cleveland'
assert rows[1]['lat'] == 39.9 and rows[1]['phone'] == '614-555-0101' and rows[1]['street'] is None
assert 'ISO3166-2"="US-OH' in P.query('OH')
# the same cleaning as Overture: the row without an address is removed, the complete one is kept
from pull_overture import clean_and_pick
clean, picked, stats, per = clean_and_pick('OH', rows, 100, 0.3)
assert [c['name'] for c in clean] == ['Smith Law Office'] and clean[0]['domain'] == 'smithlaw.example', clean
print('osm source: ok')
