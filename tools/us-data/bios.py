"""Writes a firm's biography from FACTS the crawler found (practice areas, year founded, recent blog topics). It never repeats what the profile already shows: address, phone, languages, hours or consultation terms.
Nothing is copied from a firm's own wording. Wording varies by firm (chosen from the slug), so two firms do not read alike.
Claims the firm makes about itself are attributed ("according to its own website"); there are no rankings, no "best", no promises of results.
"""
import hashlib, re, collections

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
          'pa-philly': 'the Philadelphia area', 'pa-lehigh': 'the Lehigh Valley and Poconos', 'pa-harrisburg': 'Central Pennsylvania', 'pa-pittsburgh': 'the Pittsburgh area', 'pa-west': 'Western Pennsylvania',
          'oh-cleveland': 'the Cleveland and Akron area', 'oh-columbus': 'Central Ohio', 'oh-cincinnati': 'the Cincinnati and Dayton area', 'oh-toledo': 'Northwest Ohio', 'oh-southeast': 'Eastern and Southeast Ohio',
          'nc-charlotte': 'the Charlotte area', 'nc-triangle': 'the Raleigh–Durham Triangle', 'nc-triad': 'the Piedmont Triad', 'nc-east': 'Eastern North Carolina', 'nc-west': 'Western North Carolina',
          'il-chicago': 'Chicago', 'il-suburbs': 'the Chicago suburbs', 'il-north': 'Northern Illinois', 'il-central': 'Central Illinois', 'il-south': 'Southern Illinois'}
import json, os
STATE = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'state_names.json')))   # every state's full name
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
 'Family law': ['Courts generally decide custody by what is right for the child, and support is usually calculated from a set of financial figures both sides must disclose.',
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
 'Medical malpractice': ['These claims usually require a qualified medical reviewer’s opinion that the care fell below accepted standards, which is why they take careful preparation.'],
 'Wrongful death': ['The law decides which family members may bring a claim and what losses can be recovered, and the time limits can be shorter than people expect.'],
 'Social Security disability': ['Decisions turn on medical records and on how a condition limits work, and appeals have strict deadlines after each denial.'],
 'Traffic tickets': ['Paying a ticket is often treated as an admission, so people sometimes talk to a lawyer first about points, fines and insurance effects.'],
 'Civil litigation': ['Most civil cases settle before trial, and a lawyer can explain the costs and risks of settling compared with going to court.'],
 'Intellectual property': ['Registering a trademark or copyright can make it easier to enforce later, and a lawyer can check for conflicts before a name is chosen.'],
 'Tax law': ['Tax notices carry response deadlines, and a lawyer can explain payment plans, penalties and what to do about an audit.'],
 'Insurance claims': ['When a claim is delayed or denied, the policy wording and the insurer’s letters are the starting point for deciding what to do next.'],
}

EXTRA_KNOW = {
 'Personal injury': ['A record of every doctor visit, prescription and missed day of work gives an injury claim a clear paper trail.',
                     'Photographs of the scene, the injuries and any damaged property are easiest to take right away, before things are repaired or healed.',
                     'People hurt through someone else’s carelessness often wonder how long they have to act, and the answer depends on the state and the type of claim.'],
 'Criminal defense': ['A charge can range from a minor offense to a felony, and the difference changes the possible penalties and the way the case is handled.',
                      'Anyone contacted by police about an investigation can ask to speak with a lawyer first, before agreeing to an interview.',
                      'Court dates, bail conditions and no-contact orders are all things a defense lawyer reviews in the first days of a case.'],
 'Family law': ['Divorce, separation and custody questions often arrive together, and the order in which they are handled can matter.',
                'Parents dealing with custody usually find it useful to keep a calendar of who cares for the children and when.',
                'Support amounts are often set by a state formula, and a lawyer can explain which numbers go into it.'],
 'Immigration': ['Each application type has its own forms, fees and supporting documents, so it is worth confirming which one fits before filing.',
                 'A change in family situation, employment or address can affect a pending case, which is why updates matter.',
                 'Notices from immigration authorities usually carry firm deadlines, and a missed one can have serious consequences.'],
 'Wills, trusts & probate': ['Choosing an executor or trustee is one of the more important decisions in an estate plan, since that person carries out the instructions.',
                             'Beneficiary designations on retirement accounts and insurance policies can override what a will says, so they deserve a second look.',
                             'Probate timelines vary by state and by how complicated the estate is, and a lawyer can describe what to expect locally.'],
 'Real estate': ['Buyers and sellers often review the purchase contract, the disclosures and the inspection results together with a lawyer before closing.',
                 'Easements, liens and unpaid taxes can surface in a title search, which is why that step comes before a closing.',
                 'Commercial and residential matters follow different rules, so it helps to say at the start which kind of property is involved.'],
 'Employment': ['Whether someone is an employee or an independent contractor can change which wage and discrimination laws apply.',
                'Employees weighing a severance offer or a non-compete agreement often have a lawyer read it before signing.',
                'Notes made at the time of an incident, with dates and names, are more useful later than memories alone.'],
 'Bankruptcy': ['Creditor calls, lawsuits and wage garnishment are common reasons people begin looking into bankruptcy.',
                'A list of debts, income, expenses and property is the usual starting point for a bankruptcy consultation.',
                'Filing has lasting effects on credit and property, so people often compare it with alternatives such as a payment plan.'],
 'Business & corporate': ['Founders often ask a lawyer about forming a company, protecting the name and putting ownership terms in writing.',
                          'Contracts with customers, vendors and employees set the ground rules, and unclear wording is a common source of later disputes.',
                          'Buying or selling a business involves due diligence, a purchase agreement and often a separate review of leases and licenses.'],
 'DUI': ['After a DUI arrest, the timing of the license hearing and the first court date are among the first things to confirm.',
         'Test results, the reason for the stop and the way the arrest was handled can all be reviewed in a DUI case.'],
 'Car accidents': ['Exchanging insurance information, getting a police report and seeing a doctor are the usual first steps after a collision.',
                   'Property damage and injury claims often move on different tracks, and each can involve a different adjuster.',
                   'Statements given to an insurer early on can be used later, so people sometimes ask a lawyer before giving a recorded one.'],
}
EXTRA_MORE = {
 'Personal injury': ['Settlement offers are usually weighed against future treatment needs, not only the bills received so far.',
                     'Disputes over who was at fault are common, and witness names and contact details can matter a great deal.',
                     'A lawyer can explain the difference between settling a claim and taking it to trial, including the time each can take.'],
 'Criminal defense': ['Plea offers, diversion programs and trials each carry different consequences, which a defense lawyer can lay out side by side.',
                      'Prior convictions, immigration status and professional licenses can all be affected by the outcome of a case.',
                      'Having a clear account of events, written soon after, helps a lawyer ask the right questions at the first meeting.'],
 'Family law': ['Temporary orders on custody, support or living arrangements can be requested while a case is still pending.',
                'Some couples resolve most issues through mediation, which can be quicker than a contested hearing.',
                'Retirement accounts, the family home and debts are often part of the property discussion in a divorce.'],
 'Immigration': ['Employers, family members and sponsors may each have a role to play, depending on the type of case.',
                 'Interviews and biometrics appointments are part of many applications, and preparing for them is common.',
                 'Removal proceedings follow court rules of their own, which is why people facing them often look for counsel quickly.'],
 'Wills, trusts & probate': ['Guardianship choices for minor children are usually written into a will, alongside who will manage the money.',
                             'A power of attorney and a health care directive cover decisions during life, which a will does not.',
                             'Disputes among heirs, missing documents and unpaid debts are typical reasons a probate case becomes complicated.'],
 'Real estate': ['Title insurance, survey results and homeowner association rules are common topics at the closing table.',
                 'Neighbor disputes, easements and boundary lines often come down to old deeds and recorded maps.',
                 'Leases set out rent, repairs and notice periods, and both landlords and tenants may ask a lawyer to review one.'],
 'Employment': ['Retaliation questions often turn on timing, such as what happened shortly before and after a complaint.',
                'Unpaid overtime, missed breaks and misclassification are among the wage issues that workers raise.',
                'Many employment disputes end in a negotiated agreement rather than a lawsuit, and a lawyer can explain what that might include.'],
 'Bankruptcy': ['The means test, the automatic stay and the meeting with the trustee are terms that come up early in most cases.',
                'Secured debts such as a car loan or a mortgage are handled differently from credit cards and medical bills.',
                'Business owners sometimes consider reorganization rather than liquidation, depending on the chapter and the size of the debts.'],
 'Business & corporate': ['Operating agreements and bylaws describe how decisions are made and what happens if an owner leaves.',
                          'Employment, intellectual property and licensing questions tend to arise once a company starts to grow.',
                          'Disputes between partners are easier to settle when the original agreement anticipated them.'],
 'DUI': ['Penalties often depend on prior record, blood alcohol level and whether anyone was hurt, and they differ from state to state.',
         'Requirements such as classes, ignition interlock devices and probation can follow a DUI conviction.'],
 'Car accidents': ['Medical records that link treatment to the crash, and the dates of that treatment, usually carry weight in a claim.',
                   'When fault is shared, state rules decide how much each driver can recover, which is worth understanding before accepting an offer.',
                   'Uninsured or underinsured drivers add another layer, and a person’s own policy may offer some protection.'],
}

for _a, _l in EXTRA_KNOW.items(): KNOW.setdefault(_a, []).extend(_l)
for _a, _l in EXTRA_MORE.items(): MORE.setdefault(_a, []).extend(_l)
EXTRA_KNOW2 = {
 'Tax law': ['An IRS or state notice usually states what is owed or disputed and by when, and the response date is easy to miss.',
             'Back taxes, unfiled returns and audits are different problems, and a lawyer can explain which options fit each one.'],
 'Elder law': ['Medicaid planning, guardianship and powers of attorney are common topics for families helping an older relative.',
               'Families often start by listing assets, benefits and any existing legal documents before meeting an elder law attorney.'],
 'Workers’ compensation': ['Reporting a workplace injury to the employer promptly, in writing, is usually the first step in a claim.',
                           'Disputes in these cases often involve which doctor can treat the injury and whether time off work is covered.'],
 'Medical malpractice': ['Obtaining the full set of medical records is typically the starting point for judging whether a claim is worth pursuing.',
                         'Many states set a notice or pre-suit requirement for these claims, in addition to the filing deadline.'],
 'Wrongful death': ['Families often gather the death certificate, medical or accident reports and records of the person’s income and household role.',
                    'A wrongful death claim can run alongside a criminal case, though the two follow separate rules.'],
 'Social Security disability': ['Work history, medical treatment and the date a condition began to limit work are the facts these applications focus on.',
                                'Deadlines to request reconsideration or a hearing after a denial are short, so people track them closely.'],
 'Traffic tickets': ['A ticket lists a court date or a deadline to respond, and ignoring it can lead to extra penalties or a suspended license.',
                     'Commercial drivers and people with prior violations often look more closely at what a ticket could do to their record.'],
 'Civil litigation': ['Disputes over contracts, property and money are the usual subjects, and the amount at stake influences which court hears them.',
                      'Letters, emails and contracts that show what each side agreed to are the documents a litigator asks for first.'],
 'Intellectual property': ['A business name, a logo, an invention and a creative work can each call for a different kind of registration.',
                           'Licensing and enforcement questions arise once a trademark or copyright has value, and a lawyer can explain the options.'],
 'Insurance claims': ['Denied, delayed or underpaid claims often come down to what the policy covers, so the policy itself is the first thing reviewed.',
                      'Keeping a log of every call and letter with the insurer helps if a dispute develops.'],
}
EXTRA_MORE2 = {
 'Tax law': ['Payment plans, offers in compromise and penalty relief are among the options that may be discussed, depending on the situation.',
             'Business owners and individuals alike can face payroll, sales and income tax questions, each with separate rules.'],
 'Elder law': ['Long-term care costs can be significant, and planning ahead may widen the choices available later.',
               'Decisions about who handles finances and health care are easier to make, and to write down, while the person can still make them.'],
 'Workers’ compensation': ['A denied claim can often be appealed, and the time limit for doing so is printed on the denial notice.',
                           'Benefits can include medical care and a share of lost wages, and the details vary from state to state.'],
 'Medical malpractice': ['Cases rely on outside medical reviewers, which adds time and cost compared with other injury claims.',
                         'Not every poor outcome is malpractice, and a lawyer can explain the difference between a complication and a departure from standards.'],
 'Wrongful death': ['The estate and certain relatives may each have a claim, and the law of the state sets out who qualifies.',
                    'Damages can include funeral costs, lost financial support and the loss of companionship, depending on state law.'],
 'Social Security disability': ['Medical statements from treating doctors can carry weight, and gaps in treatment are often questioned.',
                                'A hearing before an administrative law judge is a common stage after an initial denial.'],
 'Traffic tickets': ['Options can include contesting the ticket, attending traffic school or negotiating a lesser charge, where the court allows it.',
                     'Insurance companies may raise rates after a violation, which is one reason people take tickets seriously.'],
 'Civil litigation': ['Discovery, in which each side requests documents and testimony, often takes up much of the time in a civil case.',
                      'Mediation is widely used to settle civil disputes before trial and is sometimes required by the court.'],
 'Intellectual property': ['Searching for similar names or earlier inventions before filing can avoid costly conflicts later.',
                           'Employee and contractor work often raises questions about who owns what is created.'],
 'Insurance claims': ['Many policies require prompt notice of a loss and proof of damage, so deadlines and documentation matter.',
                      'When an insurer acts unreasonably, state law and the policy terms shape what remedies exist.'],
}

for _a, _l in EXTRA_KNOW2.items(): KNOW.setdefault(_a, []).extend(_l)
for _a, _l in EXTRA_MORE2.items(): MORE.setdefault(_a, []).extend(_l)

MIN_WORDS = 90   # a firm needs at least this many words of biography to be listed; thinner ones stay hidden until we know more
GENERIC_KNOW = 'A first consultation is usually the quickest way to learn whether the firm handles a particular kind of matter.'

BAD = re.compile(r'\b(best|top|leading|premier|expert|experts|guarantee[sd]?|finest|win|wins|winning|aggressive|proven|#1)\b', re.I)

def pick(slug, salt, options):
    h = int(hashlib.sha1((slug + '|' + salt).encode()).hexdigest(), 16)
    return options[h % len(options)]

USED = collections.Counter()
def pick_least(slug, salt, options, **fmt):
    """Chooses the wording (a template, filled with `fmt`) used least often so far in this run, ties broken by the slug, so two firms rarely share a sentence."""
    h = int(hashlib.sha1((slug + '|' + salt).encode()).hexdigest(), 16)
    order = sorted(range(len(options)), key=lambda i: (USED[options[i]], (i - h) % len(options)))
    USED[options[order[0]]] += 1
    return options[order[0]].format(**fmt) if fmt else options[order[0]]

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
    near = f' and {reg}' if reg and city.lower() not in reg.lower() else ''
    F = dict(name=name, where=where, focus=focus, city=city, st=st, stn=stn, near=near, across=near or ' and across ' + stn, since=since, yrs=yrs, reg=reg)
    tail = ''
    if since: tail = pick_least(slug, 'sincetail', [' The firm has been in practice since {since}.', ' It has been practicing since {since}.', ' Its history in practice goes back to {since}.', ' It opened in {since}.'], **F)
    elif yrs: tail = pick_least(slug, 'yrstail', [' It has been practicing for about {yrs} years, by its own account.', ' By its own account, the firm has about {yrs} years in practice.'], **F)
    intros = [
        '{name} is a law firm in {where}, working in {focus}.',
        'Based in {where}, {name} focuses on {focus}.',
        '{name} serves people in {city}{across} with {focus}.',
        'In {city}, {stn}, {name} handles {focus}.',
        '{name} is a {city} firm whose work centers on {focus}.',
        'People in {city}{near} turn to {name} for {focus}.',
        '{name} practices {focus} out of {where}.',
        '{name}, located in {where}, takes on {focus} matters.',
        '{name} works on {focus} matters for clients in {city}{near}.',
        '{name} is listed in {where} with a practice in {focus}.',
        'Clients in {city}{near} can reach {name} about {focus}.',
        '{name} is one of the firms in {where} that handle {focus}.',
    ]
    p1 = pick_least(slug, 'intro', intros, **F) + tail
    if near and reg not in p1:
        regtail = ' Its practice covers {city} and the surrounding ' + (reg.replace("the ", "") if reg.lower().endswith(("region", "area", "coast")) else reg.replace("the ", "") + ' region') + '.'
        p1 += pick_least(slug, 'reg', [' Its clients come from {city} and across {reg}.', ' The firm works with clients throughout {reg}.', regtail, ' Cases from elsewhere in {reg} are part of its work.', ' It is one of the firms working across {reg}.'], **F)
    # ---- paragraph 2: what the work involves (general, careful statements about each area; no claims about the firm itself)
    lines = []
    for a in areas[:3]:
        opts = KNOW.get(a)
        if opts: lines.append(pick_least(slug, 'know' + a, opts))
        more = MORE.get(a)
        if more and a in areas[:2]: lines.append(pick_least(slug, 'more' + a, more))
    if not lines: lines.append(GENERIC_KNOW)
    if len(names) > 3:
        lines.insert(0, pick(slug, 'also', [f'The firm also lists {join_list(names[3:])} among its work.', f'Its work extends to {join_list(names[3:])}.']))
    p2 = ' '.join(lines)
    # ---- paragraph 3: what the firm writes about, and how to choose. Nothing here repeats what the profile already shows (address, phone, languages, consultation terms, hours).
    bits = []
    tt = [t for t in (clean_title(p.get('title')) for p in (posts or [])) if t][:2]
    if len(tt) == 2: bits.append(pick(slug, 'blog', [f'Its blog has recently covered “{tt[0]}” and “{tt[1]}”.', f'Recent articles on the firm’s blog include “{tt[0]}” and “{tt[1]}”.']))
    elif tt: bits.append(pick(slug, 'blog1', [f'A recent article on its blog is “{tt[0]}”.', f'Its latest writing includes “{tt[0]}”.']))
    bits.append(pick_least(slug, 'choose', [
        'Before choosing a lawyer in {city}, it helps to ask about experience with similar matters, how fees work and how the firm keeps clients updated.',
        'When comparing firms in {city}, many people ask how long a case like theirs usually takes, who will handle it day to day and what it is likely to cost.',
        'A good first conversation with a {city} firm covers what the lawyer needs from you, what the realistic options are and what the next step would be.',
        'People looking for a lawyer in {city} often start by writing down their questions and gathering their paperwork, which makes a first call far more productive.',
        'Anyone weighing their options in {city} can start by listing what happened, what they want to change and which documents they already have.',
        'It is reasonable to ask a {city} firm how it communicates with clients, how often updates arrive and who to call with a question.',
        'Most people find it easier to compare lawyers in {city} after they have a short written summary of their situation and a list of dates.',
        'A consultation is a chance to learn how a firm in {city} sees the matter, what could go wrong and what a sensible timeline looks like.',
        'In {city}, as anywhere, it pays to ask who will actually work on the matter and how the firm bills for its time.',
        'Writing down questions beforehand helps make the most of a first meeting with a {city} lawyer, whatever the type of matter.'], city=city))
    p3 = ' '.join(b for b in bits if b)
    if len((p1 + ' ' + p2 + ' ' + p3).split()) < 105:
        p3 = (pick_least(slug, 'prep', [
            'Bringing copies of any letters, contracts, bills or court papers to a first meeting saves time and gives the lawyer a clearer picture.',
            'It helps to have dates, names and amounts written down before the first call, since details are easy to forget under stress.',
            'Most firms ask for the key documents early, so gathering them in one folder, on paper or on a phone, is a sensible first step.',
            'People often feel better prepared after reading a short guide to their type of matter and noting which parts they do not understand.',
            'Keeping a simple timeline of what happened, in plain language, is one of the most useful things to bring to a first consultation.',
            'Asking what will be needed from you, and by when, makes the early weeks of any matter easier to manage.']) + ' ' + p3).strip()
    return '\n\n'.join(p for p in (p1, p2, p3) if p)
