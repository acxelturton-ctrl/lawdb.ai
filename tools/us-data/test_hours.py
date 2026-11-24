import sys, os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import opening_hours as H
T = H.from_text
assert T('Office Hours: Monday - Friday: 9:00 AM - 5:00 PM') == {str(d): [['09:00', '17:00']] for d in range(1, 6)}
assert T('Mon-Fri 8:30am to 5pm | Sat 10am-2pm | Sun closed') == {**{str(d): [['08:30', '17:00']] for d in range(1, 6)}, '6': [['10:00', '14:00']]}
assert T('Hours: Monday through Friday 9-5 pm') == {str(d): [['09:00', '17:00']] for d in range(1, 6)}     # 9-5 pm: 9am to 5pm
assert T('Monday 9:00 a.m. – 6:00 p.m. Tuesday 9:00 a.m. – 6:00 p.m. Wednesday 9:00 a.m. – 6:00 p.m.') == {str(d): [['09:00', '18:00']] for d in range(1, 4)}
assert T('Call 555-1234 Monday 9-5') is None                                   # one day only: not a schedule
assert T('Mon - Fri 8:30 - 5:00') == {str(d): [['08:30', '17:00']] for d in range(1, 6)}      # 8:30-5:00 reads as 8:30 am to 5:00 pm
assert T('Our office is open 9:00 AM - 5:00 PM, Monday - Friday.') == {str(d): [['09:00', '17:00']] for d in range(1, 6)}   # times first, then the days
assert T('8am-6pm Mon-Thu') == {str(d): [['08:00', '18:00']] for d in range(1, 5)}
assert T('Monday - Friday 9:00 AM - 10:00 AM') is None                        # an hour is not a schedule
assert T('Saturday 10am-2pm') is None                                         # fewer than three open days
ld = [{'@type': 'LegalService', 'openingHoursSpecification': [{'dayOfWeek': ['Monday', 'Tuesday', 'https://schema.org/Wednesday', 'Thursday'], 'opens': '09:00:00', 'closes': '17:30:00'}]}]
assert H.from_jsonld(ld) == {str(d): [['09:00', '17:30']] for d in range(1, 5)}
assert H.from_jsonld([{'openingHours': ['Mo-Fr 08:00-17:00', 'Sa 09:00-13:00']}]) == {**{str(d): [['08:00', '17:00']] for d in range(1, 6)}, '6': [['09:00', '13:00']]}
assert H.from_jsonld([{'name': 'x'}]) is None
print('opening hours: ok')
