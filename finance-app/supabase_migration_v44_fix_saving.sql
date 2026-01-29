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

-- CONSOLIDATED SELECT POLICY (Own Entries + Team Petty Cash Allocations)
DROP POLICY IF EXISTS "Users can view own entries" ON finance_entries;
DROP POLICY IF EXISTS "Team can view petty cash allocations" ON finance_entries;
DROP POLICY IF EXISTS "Users can view relevant entries" ON finance_entries;

CREATE POLICY "Users can view relevant entries" ON finance_entries
    FOR SELECT 
    USING (
        ((select auth.uid()) = user_id) OR 
        (admin_id = (select auth.uid())) OR
        (
            (is_petty_cash = true OR client_name = 'Petty Cash') 
            AND 
            admin_id IN (
                SELECT admin_id FROM employees WHERE user_id = (select auth.uid())
            )
        )
    );

DROP POLICY IF EXISTS "Users can update own entries" ON finance_entries;
CREATE POLICY "Users can update own entries" ON finance_entries
    FOR UPDATE
    USING ((select auth.uid()) = user_id OR admin_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can delete own entries" ON finance_entries;
CREATE POLICY "Users can delete own entries" ON finance_entries
    FOR DELETE
    USING ((select auth.uid()) = user_id OR admin_id = (select auth.uid()));


-- ====================
-- PETTY CASH ENTRIES CLEANUP
-- ====================

-- Drop ALL potential legacy policy names to clear warnings
DROP POLICY IF EXISTS "Admins can manage petty cash entries" ON petty_cash_entries;
DROP POLICY IF EXISTS "Employees can view their admin's petty cash" ON petty_cash_entries;
DROP POLICY IF EXISTS "Users can insert petty cash" ON petty_cash_entries;
DROP POLICY IF EXISTS "Users can view petty cash" ON petty_cash_entries;
DROP POLICY IF EXISTS "Admins can delete petty cash" ON petty_cash_entries;
DROP POLICY IF EXISTS "Employees can spend petty cash" ON petty_cash_entries;
DROP POLICY IF EXISTS "Employees can manage own petty cash entries" ON petty_cash_entries;

-- Drop newly created policies to allow re-run updates
DROP POLICY IF EXISTS "View petty cash entries" ON petty_cash_entries;
DROP POLICY IF EXISTS "Insert petty cash entries" ON petty_cash_entries;
DROP POLICY IF EXISTS "Manage petty cash entries" ON petty_cash_entries;
DROP POLICY IF EXISTS "Update petty cash entries" ON petty_cash_entries;

ALTER TABLE petty_cash_entries ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: Users see their own entries, Admins see their team's entries, Employees see their Admin's entries
CREATE POLICY "View petty cash entries" ON petty_cash_entries
    FOR SELECT
    USING (
        (select auth.uid()) = user_id OR 
        admin_id = (select auth.uid()) OR
        admin_id IN (SELECT admin_id FROM employees WHERE user_id = (select auth.uid()))
    );

-- 2. INSERT: Users can insert if valid admin link
CREATE POLICY "Insert petty cash entries" ON petty_cash_entries
    FOR INSERT
    WITH CHECK (
        (select auth.uid()) = user_id AND
        admin_id IN (
            SELECT admin_id FROM employees WHERE user_id = (select auth.uid())
            UNION SELECT (select auth.uid()) -- Self-admin
        )
    );

-- 3. UPDATE/DELETE: Users manage their own, Admins manage their team's
CREATE POLICY "Manage petty cash entries" ON petty_cash_entries
    FOR DELETE
    USING ((select auth.uid()) = user_id OR admin_id = (select auth.uid()));

CREATE POLICY "Update petty cash entries" ON petty_cash_entries
    FOR UPDATE
    USING ((select auth.uid()) = user_id OR admin_id = (select auth.uid()));

-- 3. Ensure sequences are synced
SELECT setval('finance_entries_id_seq', (SELECT MAX(id) FROM finance_entries));

-- 4. PERFORMANCE FIX: Add indexes for RLS policies
-- Without these, the "admin_id = auth.uid()" check forces a full table scan on every query.
CREATE INDEX IF NOT EXISTS idx_finance_entries_user_id ON finance_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_finance_entries_admin_id ON finance_entries(admin_id);
CREATE INDEX IF NOT EXISTS idx_finance_entries_is_petty_cash ON finance_entries(is_petty_cash);

-- 5. SETTINGS VISIBILITY FIX
-- Employees need to see Admin's settings (Agency Name/Logo for Invoices)
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Drop legacy/duplicate policies
DROP POLICY IF EXISTS "settings_select" ON settings;
DROP POLICY IF EXISTS "settings_insert" ON settings;
DROP POLICY IF EXISTS "settings_update" ON settings;
DROP POLICY IF EXISTS "settings_delete" ON settings;
DROP POLICY IF EXISTS "Team can view settings" ON settings;
DROP POLICY IF EXISTS "Admins can manage settings" ON settings;
DROP POLICY IF EXISTS "Admins manage settings" ON settings; -- Explicitly drop policy named in warning
DROP POLICY IF EXISTS "Admins insert settings" ON settings;
DROP POLICY IF EXISTS "Admins update settings" ON settings;
DROP POLICY IF EXISTS "Admins delete settings" ON settings;
DROP POLICY IF EXISTS "View team settings" ON settings;
DROP POLICY IF EXISTS "View team settings" ON settings;

-- Policy 1: Everyone in the team (Admin + Employees) can VIEW the team's settings
CREATE POLICY "View team settings" ON settings
    FOR SELECT
    USING (
        admin_id = (select auth.uid()) 
        OR 
        admin_id IN (SELECT admin_id FROM employees WHERE user_id = (select auth.uid()))
    );

-- Policy 2: Only Admins can INSERT/UPDATE/DELETE
-- Usage of FOR ALL created an overlap on SELECT with the "View team settings" policy.
-- Splitting it eliminates the warning.
CREATE POLICY "Admins insert settings" ON settings
    FOR INSERT
    WITH CHECK (admin_id = (select auth.uid()));

CREATE POLICY "Admins update settings" ON settings
    FOR UPDATE
    USING (admin_id = (select auth.uid()));

CREATE POLICY "Admins delete settings" ON settings
    FOR DELETE
    USING (admin_id = (select auth.uid()));
