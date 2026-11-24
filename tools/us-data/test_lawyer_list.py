import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from profile_facts import lawyer_list
f = {'founder': 'John Smith', 'admitted': {'name': 'John Smith', 'state': 'Florida', 'year': 1998}, 'team': [('Maria Lopez', 'associate'), ('Sam Lee', 'partner'), ('Smith Law Group', 'partner')]}
got = lawyer_list(f, {'people_ld': [{'name': 'Ana Ruiz', 'title': 'Of Counsel'}, {'name': 'Bob Stone', 'title': 'Office Manager'}]})
assert [x['name'] for x in got] == ['John Smith', 'Maria Lopez', 'Sam Lee', 'Ana Ruiz'], got            # firm names and non-lawyers are left out, no repeats
assert got[0]['title'] == 'Founder' and got[1]['title'] == 'Associate'
assert lawyer_list({}, None) == [] and lawyer_list({'founder': 'Lawyer Team'}) == []
assert len(lawyer_list({'team': [(f'Name{chr(65+i)} Lastname', 'partner') for i in range(8)]}, None, 3)) == 3
print('lawyer list: ok')
