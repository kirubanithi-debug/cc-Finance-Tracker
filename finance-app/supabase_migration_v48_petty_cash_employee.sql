-- Add employee tracking to petty cash entries
ALTER TABLE petty_cash_entries ADD COLUMN IF NOT EXISTS employee_id uuid;
ALTER TABLE petty_cash_entries ADD COLUMN IF NOT EXISTS employee_name text;

-- Policy update not needed as RLS already covers insert/select for authenticated users
