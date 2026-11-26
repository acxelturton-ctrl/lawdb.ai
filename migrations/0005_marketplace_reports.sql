-- LawDB Marketplace, phase 2: a firm can report an unlocked inquiry within 48 hours; an admin approves (credit refunded once) or denies.
ALTER TABLE mp_reports ADD COLUMN detail TEXT;       -- the firm's own words (private)
ALTER TABLE mp_reports ADD COLUMN admin_note TEXT;   -- the admin's decision note (private)
