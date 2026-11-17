"""Writes a firm's biography from FACTS the crawler found (practice areas, year founded, languages, consultation terms, recent blog topics).
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
          'tx-south': 'South Texas', 'tx-east': 'East Texas', 'tx-west': 'West Texas'}
STATE = {'FL': 'Florida', 'TX': 'Texas'}
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
        f'{name} serves people in {city} and {reg or stn} with {focus}' + (f', and has done so {when}' if when else '') + '.',
        f'In {city}, {stn}, {name} handles {focus}' + (f' and has been in practice {when}' if when else '') + '.',
    ]
    p1 = pick(slug, 'intro', intros)
    if reg and city.lower() not in reg.lower() and 'serves people in' not in p1:
        p1 += pick(slug, 'reg', [f' Its clients come from {city} and across {reg}.', f' The firm works with clients throughout {reg}.', f' Its practice covers {city} and the surrounding {reg.replace("the ", "")} region.'])
    # ---- paragraph 2: what they do
    lines = []
    for a in areas[:2]:
        opts = KNOW.get(a)
        if opts: lines.append(pick(slug, 'know' + a, opts))
    if not lines: lines.append(GENERIC_KNOW)
    if len(names) > 3:
        lines.insert(0, pick(slug, 'also', [f'The firm also lists {join_list(names[3:])} among its work.', f'Its work extends to {join_list(names[3:])}.']))
    if langs:
        ls = join_list(sorted(langs))
        lines.append(pick(slug, 'lang', [f'The firm says it can work with clients in {ls} as well as English.', f'Language support is listed on its website: {ls}, as well as English.']))
    p2 = ' '.join(lines)
    # ---- paragraph 3: how it works with clients + what it writes about + where to find it
    terms = []
    if facts.get('free_consultation'): terms.append('offers a free initial consultation')
    if facts.get('contingency'): terms.append('takes some cases on a contingency-fee basis, with no fee unless there is a recovery')
    if facts.get('available_24_7'): terms.append('is available around the clock')
    if facts.get('virtual_consultations'): terms.append('offers virtual consultations')
    if facts.get('board_certified'): terms.append('mentions board certification among its attorneys')
    bits = []
    if terms: bits.append(pick(slug, 'terms', ['According to its own website, the firm ', 'The firm’s website states that it ', 'By its own description, the firm ']) + join_list(terms) + '.')
    tt = [t for t in (clean_title(p.get('title')) for p in (posts or [])) if t][:2]
    if len(tt) == 2: bits.append(pick(slug, 'blog', [f'Its blog has recently covered “{tt[0]}” and “{tt[1]}”.', f'Recent articles on the firm’s blog include “{tt[0]}” and “{tt[1]}”.']))
    elif tt: bits.append(pick(slug, 'blog1', [f'A recent article on its blog is “{tt[0]}”.', f'Its latest writing includes “{tt[0]}”.']))
    ph = phone_fmt(phone)
    street = (address or '').split(',')[0].strip()
    bits.append(pick(slug, 'close', [
        f'The office is at {address}' + (f', and the phone number is {ph}' if ph else '') + '.' if address else f'To reach the firm, call {ph}.' if ph else '',
        (f'To get in touch, call {ph} or ' if ph else 'To get in touch, ') + f'send a request through this page.',
        (f'Visit {street}' if street else 'Visit the office') + (f' or call {ph}' if ph else '') + ' to talk about your situation.']))
    p3 = ' '.join(b for b in bits if b)
    return '\n\n'.join(p for p in (p1, p2, p3) if p)
