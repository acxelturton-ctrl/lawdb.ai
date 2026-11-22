"""Writes a firm's biography from FACTS the crawler found (practice areas, year founded, recent blog topics). It never repeats what the profile already shows: address, phone, languages, hours or consultation terms.
Nothing is copied from a firm's own wording. Wording varies by firm (chosen from the slug), so two firms do not read alike.
Claims the firm makes about itself are attributed ("according to its own website"); there are no rankings, no "best", no promises of results.
"""
import hashlib, re

AREA = {'Personal injury': 'personal injury', 'Car accidents': 'car accident claims', 'Criminal defense': 'criminal defense', 'DUI': 'DUI defense',
        'Family law': 'family law', 'Immigration': 'immigration law', 'Wills, trusts & probate': 'wills, trusts and probate', 'Elder law': 'elder law',
        'Real estate': 'real estate law', 'Employment': 'employment law', 'Workers’ compensation': 'workers’ compensation', 'Bankruptcy': 'bankruptcy',
        'Business & corporate': 'business and corporate law', 'Medical malpractice': 'medical malpractice', 'Wrongful death': 'wrongful death claims',
        'Social Security disability': 'Social Security disability', 'Traffic tickets': 'traffic tickets', 'Civil litigation': 'civil litigation',
        'Intellectual property': 'intellectual property', 'Tax law': 'tax law', 'Insurance claims': 'insurance claims'}
REGION = {'fl-south': 'South Florida', 'fl-treasure': 'the Treasure Coast', 'fl-southwest': 'Southwest Florida', 'fl-tampa-bay': 'the Tampa Bay area',
          'fl-central': 'Central Florida', 'fl-north': 'North Florida', 'fl-panhandle': 'the Florida Panhandle',
          'tx-dfw': 'the Dallas–Fort Worth area', 'tx-houston': 'the Houston area', 'tx-central': 'Central Texas', 'tx-san-antonio': 'the San Antonio area',
          'tx-south': 'South Texas', 'tx-east': 'East Texas', 'tx-west': 'West Texas',
          'ca-la': 'the Los Angeles area', 'ca-oc': 'Orange County', 'ca-inland': 'the Inland Empire', 'ca-sd': 'the San Diego area',
          'ca-bay': 'the San Francisco Bay Area', 'ca-sac': 'Sacramento and Northern California', 'ca-central': 'the Central Valley and Central Coast',
          'ny-nyc': 'New York City', 'ny-long-island': 'Long Island', 'ny-hudson': 'the Hudson Valley', 'ny-capital': 'the Capital Region',
          'ny-central': 'Central New York', 'ny-western': 'Western New York',
          'ga-atlanta': 'the Atlanta area', 'ga-north': 'North Georgia', 'ga-central': 'Central Georgia', 'ga-coast': 'the Georgia coast', 'ga-south': 'South Georgia',
          'il-chicago': 'Chicago', 'il-suburbs': 'the Chicago suburbs', 'il-north': 'Northern Illinois', 'il-central': 'Central Illinois', 'il-south': 'Southern Illinois'}
STATE = {'FL': 'Florida', 'TX': 'Texas', 'CA': 'California', 'NY': 'New York', 'GA': 'Georgia', 'IL': 'Illinois'}
# One plain, useful sentence per practice area (a few wordings each). These describe the area; they are not legal advice.
KNOW = {
 'Personal injury': ['People hurt in an accident usually arrive with medical records, photos and insurance paperwork, and having them together makes a first conversation more useful.',
                     'Injury claims tend to turn on documentation, so it helps to keep medical bills, photographs and any messages from insurers before meeting a lawyer.',
                     'Evidence is easiest to gather early in an injury matter, and the deadline for filing a claim is set by state law.'],
 'Car accidents': ['After a crash, police reports, repair estimates and medical records are the papers a lawyer will usually ask to see first.',
                   'Car accident claims often involve more than one insurance company, which is one reason many people talk to a lawyer before accepting an offer.'],
 'Criminal defense': ['Anyone facing a criminal charge is entitled to speak with a lawyer before answering questions, and early advice can shape what comes next.',
                      'Criminal cases move quickly from arrest to first hearing, so people usually look for a defense lawyer as soon as they can.'],
 'DUI': ['A DUI arrest sets two things in motion, the criminal case and a separate driver’s license process, and each has its own deadlines.'],
 'Family law': ['Family law matters such as divorce, custody and support are personal and often urgent, and the rules differ from state to state.',
                'People preparing for a family law consultation often bring financial records, a list of assets and any existing court orders.'],
 'Immigration': ['Immigration cases depend on accurate paperwork and strict filing rules, so applicants often gather identity and status documents before a first meeting.'],
 'Wills, trusts & probate': ['Estate planning is easier to do before it is needed, and a lawyer can explain how wills, trusts and probate fit together under state law.',
                             'Families dealing with probate typically bring the will, a list of assets and the death certificate to a first meeting.'],
 'Elder law': ['Elder law covers questions such as long-term care, benefits eligibility and planning for incapacity, areas where the rules can be technical.'],
 'Real estate': ['Real estate matters, from closings to disputes, usually come down to the contract and the title, which is why buyers and sellers often have a lawyer review both.',
                 'Property questions are easier to resolve when the deed, contract and any correspondence are on hand.'],
 'Employment': ['Employment questions often involve a contract, a handbook and a paper trail of emails, so workers are usually asked to bring those along.'],
 'Workers’ compensation': ['Workers’ compensation claims run on short notice deadlines, so injured workers are generally advised to report the injury and get medical care right away.'],
 'Bankruptcy': ['Bankruptcy is a legal process with specific filing requirements, and a lawyer can explain which chapter may apply to a given situation.'],
 'Business & corporate': ['Business owners often call a lawyer when forming a company, signing a significant contract or settling a dispute with a partner or customer.',
                          'Contracts, entity choice and ownership agreements are the usual starting points for a business law conversation.'],
 'Medical malpractice': ['Medical malpractice claims depend on a careful review of the medical records, and states set tight limits on when a claim can be filed.'],
 'Wrongful death': ['Wrongful death claims are brought on behalf of a family, and state law decides who may file and by when.'],
 'Social Security disability': ['Disability applications rest on medical evidence, and many first applications are denied, which is why people often seek help with an appeal.'],
 'Traffic tickets': ['A traffic ticket can affect a driving record and insurance rates, and a lawyer can explain the options for responding.'],
 'Civil litigation': ['Civil disputes are resolved through negotiation, mediation or court, and a lawyer can explain which path fits the amount at stake.'],
 'Intellectual property': ['Trademarks, copyrights and patents are protected in different ways, and a lawyer can explain which applies to a name, a work or an invention.'],
 'Tax law': ['Tax disputes and planning questions usually start with notices and filings, so people are asked to bring any letters they have received.'],
}
# A second sentence per area, so a firm with two areas reads as more than a list. Same rules: general, careful, no promises, no rankings.
MORE = {
 'Personal injury': ['Insurance companies often make an early offer, and it can be hard to judge whether it reflects the full cost of medical care and lost work.',
                     'The value of an injury claim usually depends on the medical treatment received, the time away from work and how clearly fault can be shown.',
                     'Many injury lawyers handle claims on a contingency basis, which means the fee is taken from any recovery rather than paid up front.'],
 'Car accidents': ['Fault, insurance coverage and medical bills can all be disputed after a crash, which is why the paperwork gathered early tends to matter.',
                   'Even a minor collision can lead to injuries that appear days later, so records of when symptoms began can be useful.'],
 'Criminal defense': ['The charge, the court and any earlier record all affect what options are available, from dismissal to a plea or a trial.',
                      'Bail, court dates and conditions of release are set quickly, and a lawyer can explain what each one requires.'],
 'DUI': ['Penalties for a DUI vary with the circumstances and any prior record, and the hearing about the driver’s license often has a short deadline.'],
 'Family law': ['Courts generally decide custody around the child’s best interests, and support is usually calculated from a set of financial figures both sides must disclose.',
                'Agreements reached outside court still need to be written down and approved, which is where a lawyer’s drafting can matter.'],
 'Immigration': ['Small errors on a form can cause long delays, so applicants often have a lawyer check the paperwork before it is filed.',
                 'Visa, green card and citizenship cases follow different rules and timelines, and the right path depends on a person’s status and family or work ties.'],
 'Wills, trusts & probate': ['A will names who receives property and who is in charge of the estate, while a trust can let assets pass without going through probate.',
                             'Keeping documents up to date after a marriage, a birth or a move to another state helps make sure they still do what the person intends.'],
 'Elder law': ['Planning ahead for long-term care costs and for who can make decisions if someone becomes unable to is easier before a crisis than during one.'],
 'Real estate': ['Closing problems usually trace back to the title, the survey or the terms of the contract, so those are the first things a lawyer reviews.',
                 'Landlord and tenant, boundary and zoning questions each have their own procedures, and deadlines in notices are easy to miss.'],
 'Employment': ['Many workplace claims have short filing windows with a government agency before a lawsuit can begin, so timing matters.',
                'Written warnings, performance reviews, pay records and messages from a supervisor are the kinds of documents that tend to come up.'],
 'Workers’ compensation': ['Benefits typically cover medical care and part of lost wages, and a denied claim can usually be appealed within a set period.'],
 'Bankruptcy': ['Which debts can be discharged, what property is protected and how long the process takes depend on the chapter filed and on state exemptions.'],
 'Business & corporate': ['Choices made at the start, such as the type of company and who owns what, are far easier to set up well than to change later.',
                          'A written agreement between owners, or with a customer or supplier, spells out what happens when the relationship changes or ends.'],
 'Medical malpractice': ['These claims usually require an expert’s opinion that the care fell below accepted standards, which is why they take careful preparation.'],
 'Wrongful death': ['The law decides which family members may bring a claim and what losses can be recovered, and the time limits can be shorter than people expect.'],
 'Social Security disability': ['Decisions turn on medical records and on how a condition limits work, and appeals have strict deadlines after each denial.'],
 'Traffic tickets': ['Paying a ticket is often treated as an admission, so people sometimes talk to a lawyer first about points, fines and insurance effects.'],
 'Civil litigation': ['Most civil cases settle before trial, and a lawyer can explain the costs and risks of settling compared with going to court.'],
 'Intellectual property': ['Registering a trademark or copyright can make it easier to enforce later, and a lawyer can check for conflicts before a name is chosen.'],
 'Tax law': ['Tax notices carry response deadlines, and a lawyer can explain payment plans, penalties and what to do about an audit.'],
 'Insurance claims': ['When a claim is delayed or denied, the policy wording and the insurer’s letters are the starting point for deciding what to do next.'],
}

MIN_WORDS = 90   # a firm needs at least this many words of biography to be listed; thinner ones stay hidden until we know more
GENERIC_KNOW = 'A first consultation is usually the quickest way to learn whether the firm handles a particular kind of matter.'

BAD = re.compile(r'\b(best|top|leading|premier|expert|experts|guarantee[sd]?|finest|win|wins|winning|aggressive|proven|#1)\b', re.I)

def pick(slug, salt, options):
    h = int(hashlib.sha1((slug + '|' + salt).encode()).hexdigest(), 16)
    return options[h % len(options)]

def join_list(items):
    items = [i for i in items if i]
    if len(items) <= 1: return ''.join(items)
    return ', '.join(items[:-1]) + ' and ' + items[-1]

def clean_title(t):
    t = re.sub(r'\s+', ' ', (t or '')).strip(' "“”')
    if not t or len(t) > 110 or len(t.split()) < 4: return ''
    if sum(1 for c in t if ord(c) > 127) > 3: return ''       # not English
    if '_' in t or t.isupper(): return ''
    if BAD.search(t): return ''                                   # a blog title that makes a claim we would not make ourselves
    return t

def phone_fmt(p):
    d = re.sub(r'\D', '', p or '')[-10:]
    return f'({d[:3]}) {d[3:6]}-{d[6:]}' if len(d) == 10 else ''

def make_bio(slug, name, city, st, region_id, areas, facts, langs, posts, address, phone):
    stn = STATE.get(st, st); reg = REGION.get(region_id, '')
    names = [AREA.get(a, a.lower()) for a in areas][:4]
    first = names[0] if names else ''
    focus = join_list(names[:3]) if names else 'a range of legal matters'
    since = facts.get('since'); yrs = facts.get('years_experience')
    # ---- paragraph 1: who they are (kept short; it is shown larger)
    if since: when = pick(slug, 'since', [f'since {since}', f'for more than {2026 - since} years' if 2026 - since >= 10 else f'since {since}'])
    elif yrs: when = f'for about {yrs} years, by its own account'
    else: when = ''
    where = pick(slug, 'where', [f'{city}, {stn}', f'{city}, {st}'])
    intros = [
        f'{name} is a law firm in {where}' + (f' that has been in practice {when}' if when else '') + f', working in {focus}.',
        f'Based in {where}, {name} focuses on {focus}' + (f' and has been serving clients {when}' if when else '') + '.',
        f'{name} serves people in {city}' + (f' and {reg}' if reg and city.lower() not in reg.lower() else f' and across {stn}') + f' with {focus}' + (f', and has done so {when}' if when else '') + '.',
        f'In {city}, {stn}, {name} handles {focus}' + (f' and has been in practice {when}' if when else '') + '.',
    ]
    p1 = pick(slug, 'intro', intros)
    if reg and city.lower() not in reg.lower() and 'serves people in' not in p1:
        p1 += pick(slug, 'reg', [f' Its clients come from {city} and across {reg}.', f' The firm works with clients throughout {reg}.', f' Its practice covers {city} and the surrounding ' + (reg.replace("the ", "") if reg.lower().endswith(("region", "area", "coast")) else reg.replace("the ", "") + ' region') + '.'])
    # ---- paragraph 2: what the work involves (general, careful statements about each area; no claims about the firm itself)
    lines = []
    for a in areas[:3]:
        opts = KNOW.get(a)
        if opts: lines.append(pick(slug, 'know' + a, opts))
        more = MORE.get(a)
        if more and a in areas[:2]: lines.append(pick(slug, 'more' + a, more))
    if not lines: lines.append(GENERIC_KNOW)
    if len(names) > 3:
        lines.insert(0, pick(slug, 'also', [f'The firm also lists {join_list(names[3:])} among its work.', f'Its work extends to {join_list(names[3:])}.']))
    p2 = ' '.join(lines)
    # ---- paragraph 3: what the firm writes about, and how to choose. Nothing here repeats what the profile already shows (address, phone, languages, consultation terms, hours).
    bits = []
    tt = [t for t in (clean_title(p.get('title')) for p in (posts or [])) if t][:2]
    if len(tt) == 2: bits.append(pick(slug, 'blog', [f'Its blog has recently covered “{tt[0]}” and “{tt[1]}”.', f'Recent articles on the firm’s blog include “{tt[0]}” and “{tt[1]}”.']))
    elif tt: bits.append(pick(slug, 'blog1', [f'A recent article on its blog is “{tt[0]}”.', f'Its latest writing includes “{tt[0]}”.']))
    bits.append(pick(slug, 'choose', [
        f'Before choosing a lawyer in {city}, it helps to ask about experience with similar matters, how fees work and how the firm keeps clients updated.',
        f'When comparing firms in {city}, many people ask how long a case like theirs usually takes, who will handle it day to day and what it is likely to cost.',
        f'A good first conversation with a {city} firm covers what the lawyer needs from you, what the realistic options are and what the next step would be.',
        f'People looking for a lawyer in {city} often start by writing down their questions and gathering their paperwork, which makes a first call far more productive.']))
    p3 = ' '.join(b for b in bits if b)
    return '\n\n'.join(p for p in (p1, p2, p3) if p)
