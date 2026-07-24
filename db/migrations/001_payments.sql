-- Payments scaffold: gift cards + payment columns on orders.
-- Run against the Turso database, e.g.:
--   turso db shell <your-db> < db/migrations/001_payments.sql
-- (or paste into the Turso web shell). Safe to run once.

-- ---- Gift cards --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gift_cards (
  code            TEXT PRIMARY KEY,           -- e.g. "WT-GC-000123" (store UPPERCASE, no spaces)
  balance         REAL NOT NULL,              -- remaining balance in dollars
  initial_balance REAL NOT NULL,              -- original allotment (~250.00)
  active          INTEGER NOT NULL DEFAULT 1, -- 0 to disable a card
  note            TEXT,                       -- optional: who it was issued to
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Optional audit trail of gift-card usage (handy for reconciliation).
CREATE TABLE IF NOT EXISTS gift_card_transactions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  code       TEXT NOT NULL,
  amount     REAL NOT NULL,   -- positive = deducted from the card
  order_ref  TEXT,            -- the order number this applied to
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---- Payment columns on the existing orders table ---------------------------
-- SQLite has no "ADD COLUMN IF NOT EXISTS"; if a column already exists the
-- statement errors — just skip the ones that fail on a re-run.
ALTER TABLE orders ADD COLUMN payment_method   TEXT;    -- 'po' | 'giftcard' | 'giftcard_card' | 'card'
ALTER TABLE orders ADD COLUMN gift_card_code    TEXT;
ALTER TABLE orders ADD COLUMN gift_amount       REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN card_amount       REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN stripe_session_id TEXT;
ALTER TABLE orders ADD COLUMN paid_at           TEXT;

-- ---- Example seed (delete before production) --------------------------------
-- INSERT INTO gift_cards (code, balance, initial_balance, note)
--   VALUES ('WT-GC-000001', 250.00, 250.00, 'demo card');
