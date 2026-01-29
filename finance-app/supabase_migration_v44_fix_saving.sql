-- Migration V44: Fix Saving Entries & RLS
-- Ensure finance_entries allows inserts and contains necessary columns

-- 1. Ensure `is_petty_cash` column exists
ALTER TABLE finance_entries ADD COLUMN IF NOT EXISTS is_petty_cash BOOLEAN DEFAULT FALSE;

-- 2. Relax RLS Policies for INSERT on finance_entries
-- We drop strictly constrained policies to ensure Employees can insert records

ALTER TABLE finance_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own entries" ON finance_entries;
DROP POLICY IF EXISTS "Authenticated users can insert" ON finance_entries;
-- Drop legacy policies identified by linter
DROP POLICY IF EXISTS "entries_insert" ON finance_entries;
DROP POLICY IF EXISTS "entries_select" ON finance_entries;
DROP POLICY IF EXISTS "entries_update_comprehensive" ON finance_entries;
DROP POLICY IF EXISTS "entries_delete_comprehensive" ON finance_entries;

-- Allow any authenticated user to insert an entry if they are the owner (user_id matches)
-- Optimization: Use (select auth.uid()) to avoid re-evaluation per row
CREATE POLICY "Users can insert own entries" ON finance_entries
    FOR INSERT 
    WITH CHECK ((select auth.uid()) = user_id);

-- Also ensure they can Select/Update/Delete their own
DROP POLICY IF EXISTS "Users can view own entries" ON finance_entries;
CREATE POLICY "Users can view own entries" ON finance_entries
    FOR SELECT 
    USING ((select auth.uid()) = user_id OR admin_id = (select auth.uid())); 
    -- Users see their own. Admins see entries where they are the admin.

DROP POLICY IF EXISTS "Users can update own entries" ON finance_entries;
CREATE POLICY "Users can update own entries" ON finance_entries
    FOR UPDATE
    USING ((select auth.uid()) = user_id OR admin_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own entries" ON finance_entries;
CREATE POLICY "Users can delete own entries" ON finance_entries
    FOR DELETE
    USING ((select auth.uid()) = user_id OR admin_id = (select auth.uid()));

-- 3. Ensure sequences are synced
SELECT setval('finance_entries_id_seq', (SELECT MAX(id) FROM finance_entries));

-- 4. PERFORMANCE FIX: Add indexes for RLS policies
-- Without these, the "admin_id = auth.uid()" check forces a full table scan on every query.
CREATE INDEX IF NOT EXISTS idx_finance_entries_user_id ON finance_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_finance_entries_admin_id ON finance_entries(admin_id);
CREATE INDEX IF NOT EXISTS idx_finance_entries_is_petty_cash ON finance_entries(is_petty_cash);
