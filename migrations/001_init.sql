-- Meridian Retail Traders - PostgreSQL schema (idempotent; safe to run repeatedly).
-- Money is NUMERIC(18,2): exact decimal, never floating point.

CREATE TABLE IF NOT EXISTS accounts (
  code            TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  normal_balance  TEXT NOT NULL CHECK (normal_balance IN ('debit','credit')),
  grp             TEXT NOT NULL,
  is_contra       BOOLEAN NOT NULL DEFAULT FALSE,
  description     TEXT NOT NULL DEFAULT '',
  is_custom       BOOLEAN NOT NULL DEFAULT FALSE
);

-- The business event exactly as entered (mirrors data/sample_transactions.csv).
CREATE TABLE IF NOT EXISTS source_transactions (
  seq              BIGSERIAL UNIQUE,
  txn_id           TEXT PRIMARY KEY,
  date             DATE NOT NULL,
  type             TEXT NOT NULL,
  description      TEXT NOT NULL CHECK (length(trim(description)) > 0),
  party            TEXT NOT NULL DEFAULT '',
  reference        TEXT NOT NULL DEFAULT '',
  category         TEXT NOT NULL DEFAULT '',
  item             TEXT NOT NULL DEFAULT '',
  quantity         TEXT NOT NULL DEFAULT '',
  unit_amount      TEXT NOT NULL DEFAULT '',
  amount           TEXT NOT NULL DEFAULT '',
  gst_rate         TEXT NOT NULL DEFAULT '',
  gst_treatment    TEXT NOT NULL DEFAULT '',
  account          TEXT NOT NULL DEFAULT '',
  settle           TEXT NOT NULL DEFAULT '',
  to_account       TEXT NOT NULL DEFAULT '',
  interest_amount  TEXT NOT NULL DEFAULT '',
  deduction_amount TEXT NOT NULL DEFAULT '',
  useful_life_years TEXT NOT NULL DEFAULT '',
  residual_value   TEXT NOT NULL DEFAULT ''
);

-- Posted double-entry journal (derived from source transactions by the accounting engine, written atomically).
CREATE TABLE IF NOT EXISTS journal_entries (
  id             TEXT PRIMARY KEY,
  txn_id         TEXT NOT NULL UNIQUE REFERENCES source_transactions(txn_id) ON DELETE CASCADE,
  date           DATE NOT NULL,
  reference      TEXT NOT NULL,
  description    TEXT NOT NULL,
  category       TEXT NOT NULL,
  party          TEXT,
  gst_rate       TEXT,
  gst_treatment  TEXT,
  gst_amount     NUMERIC(18,2)
);

CREATE TABLE IF NOT EXISTS journal_lines (
  id            BIGSERIAL PRIMARY KEY,
  entry_id      TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  line_no       INT  NOT NULL,
  account_code  TEXT NOT NULL REFERENCES accounts(code),
  debit         NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit        NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  party         TEXT,
  memo          TEXT,
  CHECK ((debit > 0) <> (credit > 0)),
  UNIQUE (entry_id, line_no)
);

-- Database-level guarantee: at commit time every journal entry must have equal debits and credits.
CREATE OR REPLACE FUNCTION assert_entry_balanced() RETURNS trigger AS $$
DECLARE d NUMERIC; c NUMERIC; eid TEXT;
BEGIN
  eid := COALESCE(NEW.entry_id, OLD.entry_id);
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO d, c FROM journal_lines WHERE entry_id = eid;
  IF d <> c THEN
    RAISE EXCEPTION 'Unbalanced journal entry %: debits % <> credits %', eid, d, c;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS journal_lines_balanced ON journal_lines;
CREATE CONSTRAINT TRIGGER journal_lines_balanced
  AFTER INSERT OR UPDATE ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_entry_balanced();
