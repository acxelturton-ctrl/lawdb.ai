-- A lawyer can pay for the Lawyer plan on their own, whether or not their firm pays for anything.
-- While paid_until is in the future the lawyer has a page of their own (/firms/<firm>/lawyers/<lawyer>) and a link to it on the firm's Lawyers tab.
-- Set by the Stripe webhook for the Lawyer plan (not built yet); NULL for every lawyer who has not paid.
ALTER TABLE firm_lawyers ADD COLUMN paid_until TEXT;
CREATE INDEX idx_firm_lawyers_paid ON firm_lawyers (paid_until);
