"""Reads the biography facts a law firm's own website states about itself: when it was founded and by whom, when its lead lawyer was admitted
to the bar, who its attorneys are, which kinds of cases it handles, which awards and memberships it lists.

Only what the pages say is used, and only when the fact can be tied to a person or a sentence (a name that appears in the same sentence as
the year, for example). A fact that cannot be pinned down is left out, not guessed. Nothing here copies the firm's wording: it returns
names, years and short labels from fixed lists, and bios.py writes the sentences.
"""
import re

NUMS = {'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12,
        'thirteen': 13, 'fourteen': 14, 'fifteen': 15, 'twenty': 20}

# words that are never part of a person's name
NOT_NAME = set('''law legal firm office offices group attorney attorneys lawyer lawyers personal injury family criminal defense immigration estate real business free
consultation our the team meet about contact practice practices areas area services service car accident accidents medical malpractice wrongful death workers compensation
social security disability bankruptcy employment divorce custody child support wills trusts probate elder tax traffic intellectual property civil litigation trial senior
managing founding partner partners associate associates counsel of and for in at call today now learn more read view home news blog click here schedule case review
evaluation top best rated award awards winning experienced aggressive dedicated compassionate new york city county state bar association american national united states
court courts supreme district federal university school college juris doctor bachelor arts science texas california florida illinois georgia ohio pennsylvania north
carolina jersey michigan washington boston chicago houston dallas phone email address hours monday friday saturday sunday welcome why choose results testimonials
reviews faq resources articles videos disclaimer privacy policy terms site map menu search skip main content with from by as is was are has have who what when where
serving located locations offices operating agreements eviction process let professional corporation llp pllc llc inc pc apc pa p.c. p.a. founder owner principal shareholder member members staff paralegal paralegals assistant assistants administrator
manager director chief officer president vice general solutions co company inc'''.split())

FIRST_NAMES = set('''james john robert michael william david richard joseph thomas charles christopher daniel matthew anthony mark donald steven paul andrew joshua kenneth kevin brian george timothy ronald edward jason jeffrey ryan jacob gary nicholas eric jonathan stephen larry justin scott brandon benjamin samuel gregory alexander frank patrick raymond jack dennis jerry tyler aaron jose adam nathan henry douglas zachary peter kyle ethan walter noah jeremy christian keith roger terry gerald harold sean austin carl arthur lawrence dylan jesse jordan bryan billy joe bruce gabriel logan albert willie alan juan wayne elijah randy roy vincent ralph eugene russell bobby mason philip louis howard fred todd shawn craig barry curtis glenn marc neil brent brad clay cody dean dale darren derek drew earl evan felix floyd grant hugh ian ivan jay jim jon karl lance lee leo leon lewis lloyd mario martin max melvin mitchell neal norman oliver omar oscar owen perry preston ray reed rex rick rodney ross rudy sam sidney stanley stuart ted theodore tim tom tony trevor troy vernon victor warren wesley wyatt
mary patricia jennifer linda elizabeth barbara susan jessica sarah karen lisa nancy betty sandra margaret ashley kimberly emily donna michelle carol amanda melissa deborah stephanie dorothy rebecca sharon laura cynthia amy kathleen angela shirley brenda emma anna pamela nicole samantha katherine christine helen debra rachel carolyn janet maria catherine heather diane olivia julie joyce victoria ruth virginia lauren kelly christina joan evelyn judith andrea hannah megan cheryl jacqueline martha madison teresa gloria sara janice ann kathryn abigail sophia frances jean alice judy isabella julia grace amber denise marilyn beverly charlotte natalie theresa diana brittany doris kayla alexis lori marie tiffany monica tina tammy tracy wendy valerie stacy renee robin paula pauline phyllis peggy norma melanie leslie leah laurie kristin kristen krista jill joanne joanna jane jamie holly gail erin erica eileen dawn crystal colleen claire christy carla carmen caroline bonnie beth bernadette ashlee april allison alicia alexandra yvonne yolanda vanessa tara sylvia suzanne stella shelly sheila shannon sherry rosa rhonda regina rita priscilla nora nina naomi miriam mindy mildred melinda meghan marsha marjorie marcia lucy lorraine lillian lindsay lindsey leticia katie kate kara karla julianne josephine joy jodi jenny jenna janelle jan irene ingrid iris hilary heidi harriet gina geraldine gabriela fiona felicia faith ellen elaine edith eleanor dina diane dana daniela courtney constance connie colleen clara cindy cecilia cassandra carrie candace brooke bridget bethany belinda barbara audrey ariel anita angie alma alisha adrienne mandy
carlos luis miguel jorge fernando ricardo roberto alejandro javier manuel eduardo pedro rafael sergio raul hector jesus ramon enrique armando arturo alberto andres angel antonio diego emilio ernesto felipe francisco guillermo gustavo ignacio julio marco marcos mauricio nelson orlando rodolfo salvador santiago ana sofia isabel rosario lourdes marisol esperanza guadalupe yesenia xochitl veronica adriana alma
chris mike jim bob bill dave steve rick rob ben matt nick dan greg jeff ken andy alex josh zach phil pete jen liz kim jess steph sandy abby pat cathy deb debbie becky meg sue kerry terri terry laurel lynn lynne marissa melody shaun sherri stacey tanya tonya sunny
arvind rajesh sanjay vikram anil sunil ravi amit rahul priya neha anjali deepak sandeep pooja kavita ali ahmed mohammed muhammad omar hassan hussein yusuf ibrahim fatima aisha sana wei li jian ming yan hui jun lei xin yu hao kevin david john
mohamad samir tariq nabil karim jamal rashid tyrone darnell marcus malik andre dwayne cedric terrance latoya tamika keisha ebony shanice aaliyah imani
yossi moshe david avi eli yitzchak yaakov shlomo chaim menachem dov shmuel yehuda aryeh sholom miriam rivka sara rachel leah esther chana'''.split())

_N = r"[A-Z][a-z]+(?:[-'’][A-Z][a-z]+)?|Mc[A-Z][a-z]+|Mac[A-Z][a-z]+|O’[A-Z][a-z]+|O'[A-Z][a-z]+|De[A-Z][a-z]+|[A-Z]{2,3}(?=\s)"
NAME = rf"(?:(?:{_N})(?:\s+(?:[A-Z]\.|(?:{_N}))){{1,3}})"
NAME_RX = re.compile(NAME)
TITLES = r"(?:Co-Managing Partner|Co-Founder|Co-Owner|Founding Partner|Managing Partner|Senior Partner|Name Partner|Partner|Senior Associate Attorney|Senior Associate|Associate Attorney|Associate|Of Counsel|Senior Counsel|Counsel|Principal Attorney|Principal|Shareholder|Founder|Owner|Attorney)"


def _name_ok(n):
    toks = [t.strip('.,') for t in n.split()]
    if len(toks) < 2 or len(toks) > 4: return False
    for t in toks:
        if t.lower() in NOT_NAME: return False
    first = re.split(r"[-'’]", toks[0])[0].lower()      # "Mary-Anne" -> mary
    if first not in FIRST_NAMES: return False              # a heading such as "Eviction Process" is not a person
    return sum(1 for t in toks if len(t.strip('.')) > 1) >= 2


def _clean_name(n):
    n = re.sub(r'\s+', ' ', n).strip(' ,.;:')
    n = re.sub(r',?\s+(Esq\.?|Esquire)$', '', n)
    n = re.sub(r'\s+Co$', '', n)          # "Lisa Nicolls Co-Managing Partner": the Co belongs to the title
    return n


def _first_name(text, rx=NAME_RX):
    for m in rx.finditer(text):
        n = _clean_name(m.group(0))
        if _name_ok(n): return n
    return None


def _sentences(text):
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+(?=[A-Z])', text) if 20 < len(s) < 600]


STATE_NAMES = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana',
               'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska',
               'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island',
               'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming', 'Wyoming', 'District of Columbia']
STATE_RX = '|'.join(sorted(STATE_NAMES, key=len, reverse=True))

# ---- awards and memberships: fixed lists, so a page cannot make us repeat a claim we would not check. Each is a real, named programme.
AWARDS = [
    ('Super Lawyers', r'super lawyers'), ('Rising Stars', r'rising stars?\b'), ('Best Lawyers', r'best lawyers'), ('Best Law Firms', r'best law firms'),
    ('Martindale-Hubbell AV Preeminent rating', r'av[ -]preeminent|martindale[ -]hubbell\s+av'), ('Martindale-Hubbell Client Distinction', r'client distinction'),
    ('Martindale-Hubbell Peer Review ratings', r'peer review rated'), ('Avvo ratings', r'avvo (?:rating|top|superb|client choice|clients[’\']? choice)'),
    ('The National Trial Lawyers Top 100', r'national trial lawyers'), ('Million Dollar Advocates Forum', r'(?:multi[ -])?million dollar advocates'),
    ('Lawyers of Distinction', r'lawyers of distinction'), ('Leading Lawyers', r'leading lawyers\b'), ('Lawdragon', r'lawdragon'), ('Chambers', r'chambers (?:usa|and partners|&)'),
    ('The Legal 500', r'legal 500'), ('Elite Trial Lawyers', r'elite trial lawyers'), ('Top 40 Under 40', r'top 40 under 40'), ('Texas Rising Stars', r'texas rising stars'),
    ('Client Champion', r'client champion'), ('American Institute of Personal Injury Attorneys', r'american institute of personal injury attorneys'),
    ('Better Business Bureau accreditation', r'bbb accredited|better business bureau accredited|a\+ (?:rating )?(?:with|from) (?:the )?(?:bbb|better business bureau)'),
]
AWARD_RX = [(n, re.compile(p, re.I)) for n, p in AWARDS]
MEMBERSHIPS = [
    ('the American Bar Association', r'american bar association'), ('the American Association for Justice', r'american association for justice'),
    ('the National Association of Criminal Defense Lawyers', r'national association of criminal defense lawyers'),
    ('the American Immigration Lawyers Association', r'american immigration lawyers association|\bAILA\b'),
    ('the American Academy of Matrimonial Lawyers', r'american academy of matrimonial lawyers'),
    ('the National Academy of Elder Law Attorneys', r'national academy of elder law attorneys'),
    ('the American Board of Trial Advocates', r'american board of trial advocates'),
    ('the Inns of Court', r'inns? of court'), ('a county bar association', r'(?:[A-Z][a-z]+ ){1,3}[Cc]ounty [Bb]ar [Aa]ssociation'),
]
MEMBERSHIP_RX = [(n, re.compile(p, re.I if n != 'a county bar association' else 0)) for n, p in MEMBERSHIPS]

# ---- specific kinds of cases: a link or heading naming one of these is a real detail of what the firm does
TOPICS = [
    ('car accidents', r'car (?:accident|crash|wreck)s?|auto(?:mobile)? accidents?|motor vehicle'), ('truck accidents', r'truck(?:ing)? accidents?|18[- ]wheeler'),
    ('motorcycle accidents', r'motorcycle'), ('slip and fall', r'slip (?:and|&) fall|premises liability'), ('medical malpractice', r'medical malpractice'),
    ('wrongful death', r'wrongful death'), ('workers’ compensation', r'workers.? comp'), ('construction accidents', r'construction (?:site )?accidents?|construction injur'),
    ('nursing home abuse', r'nursing home'), ('dog bites', r'dog bites?'), ('product liability', r'product liability|defective products?'),
    ('divorce', r'\bdivorce'), ('child custody', r'child custody|custody'), ('child support', r'child support'), ('spousal support', r'spousal support|alimony'),
    ('adoption', r'\badoption'), ('prenuptial agreements', r'pre-?nuptial|prenup'), ('domestic violence', r'domestic violence'),
    ('DUI defense', r'\bdui\b|\bdwi\b|drunk driving'), ('drug charges', r'drug (?:crimes|charges|offenses)'), ('assault charges', r'assault'), ('white collar crime', r'white[ -]collar'),
    ('juvenile defense', r'juvenile'), ('traffic tickets', r'traffic (?:ticket|violation)'), ('expungement', r'expungement|record sealing'),
    ('green cards', r'green card|permanent residen'), ('visas', r'\bvisas?\b'), ('citizenship and naturalization', r'citizenship|naturalization'), ('deportation defense', r'deportation|removal defense'),
    ('asylum', r'\basylum'), ('wills', r'\bwills?\b'), ('trusts', r'\btrusts?\b'), ('probate', r'probate'), ('estate planning', r'estate planning'), ('guardianship', r'guardianship'),
    ('power of attorney', r'power of attorney'), ('Medicaid planning', r'medicaid'), ('elder law', r'elder law'), ('real estate closings', r'closings?'), ('landlord and tenant disputes', r'landlord|tenant'),
    ('foreclosure defense', r'foreclosure'), ('zoning and land use', r'zoning|land use'), ('title issues', r'title (?:insurance|search|issues)'),
    ('wage and hour claims', r'wage (?:and|&) hour|unpaid (?:wages|overtime)'), ('discrimination', r'discrimination'), ('wrongful termination', r'wrongful (?:termination|discharge)'),
    ('sexual harassment', r'sexual harassment'), ('severance agreements', r'severance'), ('Chapter 7 bankruptcy', r'chapter 7'), ('Chapter 13 bankruptcy', r'chapter 13'), ('debt relief', r'debt relief|debt settlement'),
    ('business formation', r'business formation|forming a (?:business|company)|entity formation'), ('contracts', r'\bcontracts?\b'), ('mergers and acquisitions', r'mergers|acquisitions'),
    ('shareholder disputes', r'shareholder|partnership disputes'), ('trademarks', r'trademark'), ('patents', r'\bpatents?\b'), ('copyrights', r'copyright'),
    ('social security disability', r'social security disability|\bssdi\b|\bssi\b'), ('tax controversies', r'irs|tax (?:audit|controvers|debt|resolution)'),
    ('insurance claim disputes', r'insurance (?:claims?|denials?|disputes?|bad faith)|bad faith'), ('civil litigation', r'civil litigation'),
]
TOPIC_RX = [(n, re.compile(p, re.I)) for n, p in TOPICS]


def _pages(rec):
    pages = rec.get('pages_text') or []
    if not pages and rec.get('facts_text'): pages = [{'url': '', 'title': '', 'text': rec['facts_text']}]
    return pages


def extract(rec, firm_name='', city=''):
    """rec: one crawled firm (a line of enriched.jsonl). Returns a dict of the facts found; every key is optional."""
    pages = _pages(rec)
    blob = ' '.join((p.get('title', '') + '. ' + p.get('text', '')) for p in pages)
    out = {}
    f = rec.get('facts') or {}
    since = None
    for rx in (r'(?:in practice|practicing|practising|practiced|serving [A-Za-z ]{3,30}|serving clients|at your service|helping [A-Za-z ]{3,30}|firm|law office|office|business)\s+since\s+((?:19|20)\d\d)',
               r'(?:established|founded|opened|formed|started|incorporated)\s+(?:in|back in|on)\s+(?:[A-Z][a-z]+ (?:\d{1,2}, )?)?((?:19|20)\d\d)', r'since our founding in\s+((?:19|20)\d\d)', r'est\.?\s+((?:19|20)\d\d)'):
        m = re.search(rx, blob, re.I)
        if m: since = int(m.group(1)); break
    if not since and rec.get('founded'):
        m = re.match(r'(\d{4})', str(rec['founded']))
        if m: since = int(m.group(1))
    if since and 1900 <= since <= 2018: out['since'] = since          # a recent year is usually a copyright line, not a founding year
    elif since and 2019 <= since <= 2025 and re.search(r'(?:established|founded|opened|formed) in ' + str(since), blob, re.I): out['since'] = since
    if f.get('years_experience'): out['years'] = f['years_experience']

    # founder or lead attorney: "founded by NAME", "NAME, founder", "founder NAME"
    founder = None
    for rx in (re.compile(rf"(?i:founded|established|started|opened|formed)(?: the (?:firm|practice|law firm))?(?: in (?:19|20)\d\d)? by ({NAME})"),
               re.compile(rf"({NAME}),? (?:is |was )?(?:the |our )?(?:founder|founding (?:partner|attorney|member)|owner|principal|managing (?:partner|attorney)|senior partner)"),
               re.compile(rf"(?:founder|founding (?:partner|attorney)|principal attorney|managing partner|owner)(?:,| is|:|\s[-–—])\s+({NAME})")):
        for m in rx.finditer(blob):
            n = _clean_name(m.group(1))
            if _name_ok(n): founder = n; break
        if founder: break
    if not founder:
        for o in rec.get('people_ld') or []:
            if re.search(r'founder|owner|principal|managing', o.get('title', ''), re.I) and _name_ok(_clean_name(o['name'])): founder = _clean_name(o['name']); break
    if founder: out['founder'] = founder

    # bar admission and law school: only when a person's name is in the same sentence
    admits = []; schools = []
    for s in _sentences(blob):
        if re.search(r'admitted to|licensed to practice|called to the bar|member of the [A-Za-z ]{2,30} bar since|has been (?:licensed|admitted)', s, re.I):
            m = re.search(r'(?<![\d])((?:19[6-9]|20[0-2])\d)\b', s)
            nm = _first_name(s)
            if m and nm:
                j = re.search(rf'admitted to (?:practice (?:law )?in |the )?(?:the )?({STATE_RX})(?: State)?(?: [Bb]ar)?', s)
                admits.append((nm, int(m.group(1)), j.group(1) if j else None))
        if re.search(r'\bJ\.?D\.?\b|juris doctor|law degree|graduated from', s, re.I):
            m = re.search(r"from (?:the )?([A-Z][A-Za-z.&'’ -]{3,70}?(?:School of Law|Law School|College of Law|University|Law Center|Law))\b", s)
            nm = _first_name(s)
            if not nm and founder and re.search(r'\b' + re.escape(founder.split()[0]) + r'\b', s): nm = founder   # "Chris earned his J.D. from ...", after the full name was given
            if m and nm: schools.append((nm, m.group(1).strip()))
    name_tokens = {t.lower() for t in re.split(r"[^A-Za-z']+", firm_name or '') if len(t) > 2}
    def belongs(nm):
        sur = nm.split()[-1].lower().strip('.,')
        return sur in name_tokens or nm == founder or nm in team_names
    team_names = set()
    for m in re.finditer(rf"({NAME})\s*(?:,|–|—|-|\||:)\s*({TITLES})\b", blob):
        if _name_ok(_clean_name(m.group(1))): team_names.add(_clean_name(m.group(1)))
    admits = [a for a in admits if belongs(a[0])]; schools = [a for a in schools if belongs(a[0])]
    if admits:
        pick = next((a for a in admits if founder and a[0] == founder), admits[0]); out['admitted'] = {'name': pick[0], 'year': pick[1], 'state': pick[2]}
    if schools:
        pick = next((a for a in schools if founder and a[0] == founder), schools[0]); out['school'] = {'name': pick[0], 'school': pick[1]}

    # attorneys: "NAME, Partner" / "NAME - Associate Attorney" (name directly followed by a title), plus names from the site's structured data
    team = {}
    for m in re.finditer(rf"({NAME})\s*(?:,|–|—|-|\||:)\s*({TITLES})\b", blob):
        n = _clean_name(m.group(1))
        if _name_ok(n) and n not in team: team[n] = re.split(r'[|/;,]', m.group(2).lower())[0].strip()
    for o in rec.get('people_ld') or []:
        n = _clean_name(o.get('name', ''))
        if _name_ok(n) and n not in team and re.search(r'attorney|lawyer|partner|counsel|associate|founder|principal', o.get('title', ''), re.I): team[n] = re.split(r'[|/;,]', (o.get('title') or 'attorney').lower())[0].strip()[:30]
    if founder and founder in team and not re.search('partner|founder|principal|owner', team[founder]): team[founder] = 'founder'
    if len(team) >= 2 or (len(team) == 1 and not founder): out['team'] = list(team.items())[:8]
    m = re.search(r'(?:team|staff|group) of (\d{1,2}|' + '|'.join(NUMS) + r')\s+(?:experienced |dedicated |skilled |full-time |seasoned )?(?:attorneys|lawyers)', blob, re.I)
    if m:
        v = m.group(1).lower(); n = int(v) if v.isdigit() else NUMS.get(v)
        if n and 2 <= n <= 60: out['size'] = n

    # kinds of cases: link texts and headings name them; page text confirms
    labels = ' | '.join(rec.get('nav_labels') or []) + ' | ' + ' | '.join(p.get('title', '') for p in pages)
    subs = []
    for name, rx in TOPIC_RX:
        if rx.search(labels) or len(rx.findall(blob)) >= 3: subs.append(name)
    if len(subs) >= 2: out['topics'] = subs[:7]

    # places the firm says it serves, and where it has offices (a list of counties or cities named after "serving" / "offices in")
    served = []; plural = False
    for m in re.finditer(r"(?i:serving|serves|represents clients in|clients throughout|clients across|clients in)\s+((?:[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,2}(?:,\s*|,?\s+and\s+|\s+&\s+)){1,6}[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){0,2})", blob):
        if re.search(r'Counties', m.group(1)): plural = True
        for part in re.split(r',\s*|\s+and\s+|\s+&\s+', m.group(1)):
            part = re.sub(r'\s+Counties$', '', part.strip(' .'))
            base = re.sub(r'\s+County$', '', part)
            if 3 <= len(part) <= 28 and part.split()[0].lower() not in NOT_NAME and base.lower() not in {re.sub(r'\s+County$', '', x).lower() for x in served}: served.append(part)
        if len(served) >= 3: break
    place_ok = len(served) >= 3 or any((city or '~').lower() in x.lower() for x in served)
    if len(served) >= 2 and place_ok:
        def named(x):
            base = re.sub(r'\s+County$', '', x)
            return base + ' County' if re.search(re.escape(base) + r'\s+Count(?:y|ies)\b', blob) else x
        out['serves'] = [named(x) for x in served[:6]]
    offices = []
    for m in re.finditer(r"(?i:offices?) (?:(?i:in)|(?i:located in)|(?i:at locations in))\s+((?:[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+)?(?:,\s*|,?\s+and\s+|\s+&\s+)){1,4}[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+)?)", blob):
        for part in re.split(r',\s*|\s+and\s+|\s+&\s+', m.group(1)):
            part = part.strip(' .')
            if 3 <= len(part) <= 24 and part not in offices and part not in STATE_NAMES and not any(w.lower() in NOT_NAME for w in part.split()): offices.append(part)
        if offices: break
    # an office list is believable only if it includes the firm's own city and none of the firm's own name
    name_tokens = {t.lower().strip('.,&') for t in re.split(r'\W+', firm_name or '') if len(t) > 2}
    offices = [o for o in offices if not (set(w.lower() for w in re.split(r'\W+', o) if w) & name_tokens)]
    if len(offices) >= 2 and (not city or any(city.lower() == o.lower() for o in offices) or len(offices) >= 3 and False): out['offices'] = offices[:5]

    aw = [n for n, rx in AWARD_RX if rx.search(blob)]
    if aw: out['awards'] = aw[:5]
    mem = []
    for n, rx in MEMBERSHIP_RX:
        if rx.search(blob):
            if n == 'a county bar association':
                m = rx.search(blob); words = [w for w in m.group(0).split() if w not in ('Member', 'Members', 'The', 'Our', 'Of', 'And', 'State', 'Florida', 'Texas', 'California', 'York', 'New') or w == m.group(0).split()[-3]]
                n = 'the ' + ' '.join(m.group(0).split()[-(len(words)):]) if len(words) >= 3 else 'the ' + m.group(0)
            mem.append(n)
    if mem: out['memberships'] = mem[:4]
    if f.get('board_certified'): out['board_certified'] = True
    return out


def count_facts(p, press=None):
    """How many separate, firm-specific facts a biography can rest on."""
    n = 0
    for k in ('since', 'founder', 'admitted', 'school', 'size', 'awards', 'memberships', 'years', 'serves', 'offices'):
        if p.get(k): n += 1
    if len(p.get('team') or []) >= 2: n += 1
    if len(p.get('topics') or []) >= 2: n += 1
    if press: n += 1
    return n
