"""Writes a firm's biography from FACTS the crawler found (practice areas, year founded, recent blog topics). It never repeats what the profile already shows: address, phone, languages, hours or consultation terms.
Nothing is copied from a firm's own wording. Wording varies by firm (chosen from the slug), so two firms do not read alike.
Facts are stated plainly, as LawDB's own research (nothing says where a fact came from); there are no rankings, no "best" and no promises of results.
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

MIN_WORDS = 55   # words; with at least MIN_FACTS firm-specific facts. The homepage showcase has its own, higher bar (src/routes/home-showcase.js).
MIN_FACTS = 0   # facts (founder, year, team, places, awards, press ...) add to a biography but are not required: the practice areas and city are enough for the opening and closing paragraphs
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

def join_items(items):
    items = [i for i in items if i]
    if len(items) <= 1: return ''.join(items)
    if len(items) == 2 and any(' and ' in i for i in items): return items[0] + ', as well as ' + items[1]
    if any(' and ' in i for i in items): return '; '.join(items[:-1]) + '; and ' + items[-1]
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


# ---------------------------------------------------------------------------------------------------------------------------------
# The biography: facts the firm's own site states (profile_facts.py) and press found elsewhere (press.py), written as a short profile like
# lawdb.ca's: who the firm is, who founded and leads it, who its attorneys are, what it handles, what it is recognised for.
# No filler: every sentence rests on a fact. A firm without enough facts gets no biography and stays a plain listing.
# ---------------------------------------------------------------------------------------------------------------------------------
from profile_facts import count_facts

def a_an(word):
    return 'an' if word[:1].lower() in 'aeiou' else 'a'

def _area_phrase(names):
    names = [re.sub(r' claims$', '', n) for n in names]
    if len(names) == 1:
        n = names[0]
        return n + ' firm' if n.endswith('law') else n + ' law firm'
    return 'law firm handling ' + join_items(names[:3])

def _titles(items, skip=None):
    out = []
    for n, t in items:
        if n == skip: continue
        out.append(f'{n} ({t})' if t and t not in ('attorney',) else n)
    return out

# The opening of a search for a lawyer, per area: the closing paragraph starts from what the reader is going through.
LEAD = {
 'Personal injury': 'If you or a loved one has been injured', 'Car accidents': 'If you have been hurt in a car accident',
 'Criminal defense': 'If you are facing a criminal charge', 'DUI': 'If you have been arrested for DUI',
 'Family law': 'If you are dealing with a divorce, custody or another family matter', 'Immigration': 'If you have an immigration case or question',
 'Wills, trusts & probate': 'If you are planning an estate or settling one', 'Elder law': 'If you are planning care or finances for an older family member',
 'Real estate': 'If you are buying, selling or disputing property', 'Employment': 'If you have a problem at work',
 'Workers’ compensation': 'If you were hurt on the job', 'Bankruptcy': 'If debt has become unmanageable',
 'Business & corporate': 'If you are starting, running or disputing a business', 'Medical malpractice': 'If you believe medical care harmed you or a family member',
 'Wrongful death': 'If you have lost a loved one because of someone else’s actions', 'Social Security disability': 'If you have applied for Social Security disability or been denied',
 'Traffic tickets': 'If you have received a traffic ticket', 'Civil litigation': 'If you are involved in a civil dispute',
 'Intellectual property': 'If you need to protect a name, a creative work or an invention', 'Tax law': 'If you have a tax problem',
 'Insurance claims': 'If an insurance claim was denied or delayed',
}
CTA = [
 '{lead}, {name} offers legal guidance to help you understand your options and determine the next steps.',
 '{lead}, {name} can talk through your situation with you and explain the options in front of you. Contact the firm to get started.',
 '{lead} in {city}, contact {name} to understand where you stand and what happens next.',
 '{lead}, a conversation with {name} in {city} is the first step toward understanding your options and moving forward with confidence.',
 '{lead}, reach out to {name} in {city} to learn what your options are.',
 '{lead}, {name} is ready to listen, explain your options and help you take the next step.',
]
# What each kind of firm is there to do, the situations it handles and what clients are after. Written as plain fact about the firm.
PURPOSE = {
 'Personal injury': 'individuals and families navigate the legal challenges that follow serious accidents and injuries',
 'Car accidents': 'drivers, passengers and families recover after car, truck and motorcycle crashes',
 'Criminal defense': 'people facing criminal charges protect their rights, their record and their future',
 'DUI': 'drivers facing DUI charges protect their license, their record and their future',
 'Family law': 'individuals and families work through divorce, custody, support and other personal family matters',
 'Immigration': 'individuals, families and employers navigate the immigration system with confidence',
 'Wills, trusts & probate': 'families plan their estates, protect their assets and settle their loved ones’ affairs',
 'Elder law': 'older adults and their families plan for long-term care, protect their assets and safeguard their independence',
 'Real estate': 'buyers, sellers, investors and owners complete transactions and resolve property disputes',
 'Employment': 'workers and employers handle workplace disputes, contracts and employment rights',
 'Workers’ compensation': 'injured workers secure the medical care and benefits they need after a workplace injury',
 'Bankruptcy': 'individuals and businesses find relief from overwhelming debt and rebuild their finances',
 'Business & corporate': 'business owners and entrepreneurs start, structure, protect and grow their companies',
 'Medical malpractice': 'patients and families seek answers and accountability after serious medical errors',
 'Wrongful death': 'families seek justice and financial stability after the loss of a loved one',
 'Social Security disability': 'people who cannot work secure the Social Security disability benefits they rely on',
 'Traffic tickets': 'drivers resolve traffic violations and protect their driving record and insurance rates',
 'Civil litigation': 'individuals and businesses resolve disputes in and out of court',
 'Intellectual property': 'creators, inventors and businesses protect their trademarks, copyrights and ideas',
 'Tax law': 'individuals and businesses resolve tax problems and plan with confidence',
 'Insurance claims': 'policyholders pursue claims that insurers have delayed, underpaid or denied',
}
WHETHER = {
 'Personal injury': ('dealing with insurance companies, pursuing compensation, or navigating complex legal proceedings', 'pursue the compensation they are owed'),
 'Car accidents': ('negotiating with insurers, documenting injuries, or taking a claim to court', 'recover what they are owed'),
 'Criminal defense': ('facing an investigation, an arrest or a trial', 'make confident decisions at every stage'),
 'DUI': ('facing a first offense or a license hearing', 'protect their driving privileges'),
 'Family law': ('negotiating a settlement, resolving custody, or appearing in court', 'reach outcomes that protect their families'),
 'Immigration': ('applying for a visa, a green card or citizenship, or responding to an enforcement action', 'move forward with confidence'),
 'Wills, trusts & probate': ('drafting a will, setting up a trust, or guiding an estate through probate', 'protect the people they love'),
 'Elder law': ('planning for care, protecting assets, or serving as a guardian', 'protect their independence and their legacy'),
 'Real estate': ('closing a purchase, reviewing a contract, or resolving a title or boundary dispute', 'protect their investment'),
 'Employment': ('negotiating a contract, responding to discrimination, or resolving a wage dispute', 'protect their rights at work'),
 'Workers’ compensation': ('filing a claim, appealing a denial, or returning to work', 'secure the benefits they are owed'),
 'Bankruptcy': ('filing for relief, stopping collections, or restructuring debt', 'get a fresh financial start'),
 'Business & corporate': ('forming a company, negotiating a deal, or resolving a dispute', 'protect and grow their businesses'),
 'Medical malpractice': ('investigating what went wrong, working with medical experts, or pursuing a claim', 'pursue fair compensation'),
 'Wrongful death': ('investigating a loss, dealing with insurers, or pursuing a claim', 'pursue fair compensation'),
 'Social Security disability': ('applying, appealing a denial, or preparing for a hearing', 'secure the benefits they rely on'),
 'Traffic tickets': ('contesting a citation, negotiating a reduced charge, or appearing in court', 'protect their record'),
 'Civil litigation': ('negotiating a settlement, preparing for trial, or responding to a lawsuit', 'resolve disputes on favorable terms'),
 'Intellectual property': ('registering a trademark, protecting a copyright, or enforcing their rights', 'protect what they create'),
 'Tax law': ('responding to an audit, resolving back taxes, or planning ahead', 'settle their obligations with confidence'),
 'Insurance claims': ('appealing a denial, documenting a loss, or pursuing a claim', 'recover what their policies promise'),
}
DEDICATED = ['dedicated to helping', 'committed to helping', 'focused on helping', 'devoted to helping']
PURPOSE2 = {'Personal injury': 'clients rebuild their lives and finances after an accident or injury caused by someone else', 'Car accidents': 'accident victims secure medical care, repairs and fair compensation after a collision', 'Criminal defense': 'individuals charged with crimes understand their options and defend their freedom', 'DUI': 'people charged with driving under the influence defend their license and their future', 'Family law': 'families move through divorce, custody and support disputes with clarity and care', 'Immigration': 'people and businesses secure visas, residency and citizenship', 'Wills, trusts & probate': 'families put sound estate plans in place and settle estates smoothly', 'Elder law': 'seniors and their loved ones prepare for care costs, guardianship and the transfer of assets', 'Real estate': 'property owners, buyers and sellers close deals and settle disputes with confidence', 'Employment': 'employees and employers resolve wage, discrimination and contract issues', 'Workers’ compensation': 'workers recover medical care and lost wages after getting hurt on the job', 'Bankruptcy': 'people overwhelmed by debt stop collections and start over', 'Business & corporate': 'founders and companies form entities, draft contracts and settle disputes', 'Medical malpractice': 'patients and families hold providers accountable for preventable medical harm', 'Wrongful death': 'families pursue accountability and financial security after a preventable death', 'Social Security disability': 'disabled workers apply for and appeal Social Security benefits', 'Traffic tickets': 'drivers contest citations and keep violations off their record', 'Civil litigation': 'clients protect their interests in contract, property and business disputes', 'Intellectual property': 'creators and companies register, protect and enforce their intellectual property', 'Tax law': 'taxpayers answer IRS notices, settle back taxes and plan ahead', 'Insurance claims': 'insureds challenge denied, delayed and underpaid claims'}
WHETHER2 = {'Personal injury': ('recovering from injuries, talking with adjusters, or preparing for trial', 'secure fair compensation'), 'Car accidents': ('facing medical bills, repair costs, or a disputed insurance claim', 'recover fully'), 'Criminal defense': ('responding to a charge, negotiating with prosecutors, or preparing a defense', 'protect their freedom'), 'DUI': ('contesting a charge, a breath test result, or a suspension', 'keep their license and record in good standing'), 'Family law': ('ending a marriage, setting a parenting plan, or changing a support order', 'protect their children and their finances'), 'Immigration': ('filing a petition, renewing status, or fighting a removal', 'stay on track toward their goals'), 'Wills, trusts & probate': ('naming guardians, avoiding probate, or settling a loved one’s estate', 'give their families security'), 'Elder law': ('planning for Medicaid, nursing care, or powers of attorney', 'protect their savings and independence'), 'Real estate': ('buying a home, leasing commercial space, or settling a boundary dispute', 'move ahead with confidence'), 'Employment': ('facing a layoff, harassment, or unpaid overtime', 'protect their careers and their income'), 'Workers’ compensation': ('reporting an injury, disputing a denial, or negotiating a settlement', 'receive the care and wages they need'), 'Bankruptcy': ('choosing between Chapter 7 and Chapter 13, facing foreclosure, or stopping garnishment', 'regain stability'), 'Business & corporate': ('choosing an entity, drafting agreements, or resolving partner disputes', 'build on a solid legal foundation'), 'Medical malpractice': ('reviewing medical records, consulting specialists, or filing suit', 'hold providers accountable'), 'Wrongful death': ('handling funeral costs, lost income, or a disputed claim', 'secure their family’s future'), 'Social Security disability': ('gathering medical evidence, filing an appeal, or testifying at a hearing', 'obtain the benefits they need'), 'Traffic tickets': ('facing points on a license, a speeding ticket, or a court date', 'keep their driving record clean'), 'Civil litigation': ('enforcing a contract, defending a claim, or negotiating a settlement', 'reach a resolution that works for them'), 'Intellectual property': ('filing a trademark, responding to infringement, or licensing a work', 'keep control of their ideas'), 'Tax law': ('facing penalties, an audit, or unfiled returns', 'get back in good standing'), 'Insurance claims': ('facing a denial, a low offer, or a delay', 'get the coverage they paid for')}
APPROACH = [
 'With a client-focused approach, {name} provides personalized legal guidance, strong advocacy, and a commitment to protecting clients’ rights.',
 '{name} puts clients first, combining personal attention, clear communication and determined advocacy at every stage of a case.',
 'At {name}, every client receives personal attention, straightforward answers and strong advocacy from the first call to the final resolution.',
 '{name} takes a hands-on, client-focused approach built on clear communication, careful preparation and strong advocacy.',
 'Clients choose {name} for responsive communication, thorough preparation and dependable advocacy.',
 '{name} builds every case around the client, with clear updates, practical advice and strong advocacy.',
 'Personal attention and persistent advocacy define the way {name} works with clients.',
]
SITUATIONS = [
 'Whether {sit}, {name} works to make the legal process easier to understand while helping clients {goal}.',
 'Whether {sit}, clients rely on {name} for clear explanations and steady guidance as they work to {goal}.',
 'Whether {sit}, {name} focuses on giving clients clear answers and helping them {goal}.',
 'Clients who are {sit} turn to {name} for straightforward advice and help to {goal}.',
]

def make_biography(slug, name, city, st, region_id, areas, p, press=None):
    """A sales-ready biography stated as fact: who the firm is and where it works (practice areas as keywords), who is behind it, how it works with clients,
    and where to go next. Nothing says where a fact came from; there are no rankings, no promises of results and no fee or consultation terms."""
    stn = STATE.get(st, st); reg = REGION.get(region_id, '')
    keys = [a for a in areas if a in AREA][:4]
    names = [AREA[a] for a in keys]
    if not names: return ''
    since, founder = p.get('since'), p.get('founder')
    if since and founder: est = f', established in {since} by {founder},'
    elif since: est = pick(slug, 'est', [f', in practice since {since},', f', established in {since},'])
    elif founder: est = f', founded by {founder},'
    else: est = ''
    prim = re.sub(r' claims$', '', names[0])
    prim_firm = prim + ' firm' if prim.endswith('law') else prim + ' law firm'
    area_list = join_items(names)
    where = (f'{city} and {reg}' if reg and city.lower() not in reg.lower() else reg if reg else f'{city} and the surrounding area')
    k0 = keys[0]
    ded = pick(slug, 'ded', DEDICATED)
    purpose = pick(slug, 'purp', [PURPOSE.get(k0), PURPOSE2.get(k0)] if PURPOSE.get(k0) else ['individuals and families get the legal help they need'])
    tail = f'{area_list}, along with related legal matters' if len(names) > 1 else f'{area_list} and related legal matters'
    s1 = pick(slug, 's1', [
        f'{name} is {a_an(city)} {city}, {stn} {prim_firm}{est} {ded} {purpose}. The firm represents clients in {tail} throughout {where}.',
        f'Based in {city}, {stn}, {name} is {a_an(prim_firm)} {prim_firm}{est} {ded} {purpose}. It represents clients in {tail} throughout {where}.',
        f'{name} is {a_an(prim_firm)} {prim_firm} in {city}, {stn}{est} {ded} {purpose}. Its attorneys represent clients in {tail} throughout {where}.'])
    s1 = s1.replace(',,', ',').replace(', ,', ',')
    paras = [s1]
    # who is behind the firm, where it works, how it has been recognised: stated as fact
    f = []
    adm = p.get('admitted'); sch = p.get('school')
    if p.get('years') and not since and not founder: f.append(f'The firm has about {p["years"]} years in practice.')
    if adm:
        bar = f'the {adm["state"]} bar' if adm.get('state') else 'the bar'
        f.append(f'{adm["name"]} was admitted to {bar} in {adm["year"]}' + (f' and earned a law degree from {sch["school"]}' if sch and sch['name'] == adm['name'] else '') + '.')
    elif sch:
        f.append(f'{sch["name"]} earned a law degree from {sch["school"]}.')
    team = _titles(p.get('team') or [], skip=(adm or {}).get('name') or founder)
    if team:
        lead = pick(slug, 'team', ['The firm’s attorneys include', 'Its attorneys include', 'The practice also includes'])
        f.append(f'{lead} {join_list(team[:5])}.')
    if p.get('size') and not team: f.append(f'The firm has a team of {p["size"]} attorneys.')
    elif p.get('size') and f: f[-1] = f[-1][:-1] + f', on a team of {p["size"]} attorneys.'
    if p.get('serves'): f.append(pick(slug, 'serves', ['The firm serves clients across ', 'Its clients come from across ', 'The practice serves ']) + join_list(p['serves'][:5]) + (' counties' if p.get('serves_counties') and not any(city.lower() in x.lower() for x in p['serves']) else '') + '.')
    if p.get('offices'): f.append(pick(slug, 'offices', ['The firm has offices in ', 'Office locations include ']) + join_list(p['offices'][:4]) + '.')
    if p.get('topics'): f.append(pick(slug, 'work', ['Its work includes ', 'Matters it handles include ', 'The firm’s practice covers ']) + join_list(p['topics'][:6]) + '.')
    if p.get('awards'): f.append(pick(slug, 'awards', ['The firm has been recognized by ', 'It has earned recognition from ', 'Its attorneys have been recognized by ']) + join_list(p['awards'][:4]) + '.')
    if p.get('memberships'): f.append('Its attorneys are members of ' + join_list(p['memberships'][:3]) + '.')
    if p.get('board_certified') and not p.get('awards'): f.append('The firm includes board-certified attorneys.')
    if press:
        if len(press) == 1:
            x = press[0]; f.append(f'{x["source"]} covered the firm in {x["year"]}: “{x["title"]}”.')
        else:
            f.append('The firm has drawn press coverage from ' + join_list([f'{x["source"]} ({x["year"]})' for x in press[:3]]) + '.')
    if f: paras.append(' '.join(f))
    # how the firm works with clients
    sit, goal = pick(slug, 'wh', [WHETHER.get(k0), WHETHER2.get(k0)] if WHETHER.get(k0) else [('facing a legal problem', 'get the result they need')])
    paras.append(pick_least(slug, 'approach', APPROACH, name=name) + ' ' + pick_least(slug, 'whether', SITUATIONS, name=name, sit=sit, goal=goal))
    # where to go next
    paras.append(pick_least(slug, 'cta', CTA, lead=LEAD.get(k0, 'If you need a lawyer'), name=name, city=city))
    return '\n\n'.join(paras)
