# LawDB Marketplace (phase 1)

Verified firms unlock consumer legal inquiries with prepaid credit. One inquiry goes to one firm. Built from the Marketplace brief and adapted to the US (states, state bars).

## How it works
1. A person fills in `/get-matched` (practice area, a type from a list, urgency, state, city, name, email, optional phone, a few sentences, and a consent box with the exact wording stored).
2. The inquiry is screened. Complete, plausible, non-spam inquiries are **approved at once**. Anything with sensitive wording (abuse, arrest, minors, deportation and similar) or an ID/card number is **held** for you to read in Admin, then Marketplace.
3. Verified firms (the existing state-bar verification) see a **blurred card**: practice area, city, state, urgency, age, price and a one-line summary generated from the picked fields only. Name, email, phone and what the person typed stay hidden.
4. A firm unlocks with credit. Unlocking is one atomic database batch: the inquiry, the balance and the ledger change together, so two firms can never buy the same inquiry. The loser is told it was taken.
5. Price: full for 48 hours, 40% off until day 7, then it expires (the hourly job marks it). Featured firms see a new inquiry 20 minutes before everyone else (admin setting).
6. The ledger is append-only (database triggers refuse changes). Every top-up, unlock, promo and adjustment is a row.

## Switches and settings (Admin, then Marketplace)
- **Open or closed.** Closed (the default): the form takes nothing and firms see only sample inquiries. Opening requires ticking that a lawyer reviewed the consent wording, privacy policy and terms.
- Prices per practice area, Featured head start, optional welcome credit for newly verified firms (default $0).
- Create a sample inquiry (free to unlock, shown only while closed) to walk through the firm side.
- Give a firm credit or take it back (written to the ledger).

## Credit top-ups (Stripe, no API key needed)
Create three **Payment Links** in Stripe, one-time payments of $100, $250 and $500, then add their URLs as Worker variables (Workers & Pages, lawdb-ai, Settings, Variables):
`MP_TOPUP_LINK_100`, `MP_TOPUP_LINK_250`, `MP_TOPUP_LINK_500`.
The dashboard adds `client_reference_id=mp_<firm slug>` to each link; the existing Stripe webhook (`checkout.session.completed`) credits the amount paid, once per payment. Until the links exist, the dashboard says top-ups open soon and you can give credit by hand.

## Before opening to the public (needs a lawyer)
- Consent wording (`CONSENT` in `src/lib/marketplace.js`, shown on the form and stored with every inquiry), the Marketplace sections of the privacy policy and terms, and the form's fine print.
- Whether charging firms for inquiries counts as a **lawyer referral service** in the states you serve (several states regulate or register these), and state rules on **paying for referrals and fee sharing** (ABA Model Rules 5.4, 7.2). The design keeps the fee a flat advertising charge that never depends on the person becoming a client, and the interface says "inquiry" and "unlock", not "referral" or "client".
- Phone and text rules (TCPA) if firms will call or text; this version sends no texts.
- Whether to add an automated summary later (today it is built only from list choices, so it cannot reveal anything the person typed).

## Phase 2: alerts and bad-inquiry reports
- **Alerts** (`src/lib/marketplace-alerts.js`, run by the 5-minute cron): Featured firms are emailed at once, everyone else from the moment the inquiry opens. Waves of at most 15 firms, Featured first, at least 5 minutes apart, at most 3 after the first, only for inquiries under 24 hours old and only while unclaimed. Only firms whose practice areas and states match (and cities, if the firm chose some). A day's emails are capped at 150 (Brevo's free plan sends 300 and sign-in links share it). Emails carry only the blurred preview (summary, price) and a dashboard link, never a name, email, phone or anything typed. **Nothing is sent, or recorded as sent, until the Brevo key is set and the Marketplace is open.**
- **Alert settings** per firm: right away, one daily summary (sent once a day at 14:00 UTC), or none. The dashboard also says how many open inquiries match.
- **Reports and refunds:** within 48 hours of unlocking, a firm may report an inquiry as a disconnected number, spam, a fake, or something else clearly not real. An admin approves (the price returns as credit, once, written to the ledger) or denies in Admin, then Marketplace. A refund never depends on whether the person hires the firm. Free sample inquiries cannot be reported.

## Not built yet
A revenue chart and automated state-bar lookups for verification. Admin can approve held inquiries, set prices, give credit, resolve reports and see the money in and out.

## Tests
`scripts/test-marketplace-engine.mjs` (screening, feed privacy, decay, head start, racing unlocks, ledger, Stripe credit) and `scripts/test-marketplace-routes.mjs` (who may see what, the open switch) and `scripts/test-marketplace-alerts.mjs` (alert waves, caps, digest, reports and refunds). Both run on a real SQLite database with the real migrations and are part of `npm run check`.
