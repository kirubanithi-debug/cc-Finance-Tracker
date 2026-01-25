-- ============================================================
-- Migration v15: Comprehensive Fixes for 11 Reported Bugs
-- ============================================================

-- ------------------------------------------------------------
-- 1. Fix Users/Profile Updates (Bug 1: Phone update persistence)
-- ------------------------------------------------------------
-- Ensure 'users' table update policy allows user to update their own row.
-- (Re-applying with absolute certainty)
DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users FOR UPDATE TO authenticated 
    USING (id = (SELECT auth.uid()));

-- ------------------------------------------------------------
-- 2. Fix Finance Entries Permissions (Bug 2, 8: Admin Delete/Approve)
-- ------------------------------------------------------------
-- Ensure admins can DELETE entries.
-- Ensure admins can UPDATE entries (approve/decline).

DROP POLICY IF EXISTS "finance_entries_delete" ON finance_entries;
CREATE POLICY "finance_entries_delete" ON finance_entries FOR DELETE TO authenticated 
    USING (
        -- User delete their own (if policy allows)
        user_id = (SELECT auth.uid()) 
        OR
        -- Admin delete their organization's entries
        admin_id = (SELECT auth.uid())
    );

DROP POLICY IF EXISTS "finance_entries_update" ON finance_entries;
CREATE POLICY "finance_entries_update" ON finance_entries FOR UPDATE TO authenticated 
    USING (
        -- User update their own
        user_id = (SELECT auth.uid()) 
        OR
        -- Admin update their organization's entries (for approval)
        admin_id = (SELECT auth.uid())
    );

-- ------------------------------------------------------------
-- 3. Fix Investments Persistence & Flow (Bug 9, 10: Equipments)
-- ------------------------------------------------------------
-- Ensure 'investments' table exists and has necessary columns
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'investments' AND column_name = 'status') THEN
        ALTER TABLE investments ADD COLUMN status TEXT DEFAULT 'approved';
    END IF;
    
    -- Add admin_id to investments to link them properly (like entries)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'investments' AND column_name = 'admin_id') THEN
        ALTER TABLE investments ADD COLUMN admin_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- Update existing investments to have admin_id = created_by (assuming previous were mostly admins)
UPDATE investments SET admin_id = created_by WHERE admin_id IS NULL;

-- RLS for Investments
DROP POLICY IF EXISTS "investments_select" ON investments;
CREATE POLICY "investments_select" ON investments FOR SELECT TO authenticated 
    USING (
         -- Can see if created by self or belongs to my admin
         created_by = (SELECT auth.uid()) OR admin_id = (SELECT auth.uid())
         OR admin_id = (SELECT admin_id FROM employees WHERE user_id = (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "investments_insert" ON investments;
CREATE POLICY "investments_insert" ON investments FOR INSERT TO authenticated 
    WITH CHECK (true); -- Logic handled in API

DROP POLICY IF EXISTS "investments_update" ON investments;
CREATE POLICY "investments_update" ON investments FOR UPDATE TO authenticated 
    USING (
        created_by = (SELECT auth.uid()) OR admin_id = (SELECT auth.uid())
    );

-- ------------------------------------------------------------
-- 4. RPC Function for Employee Email Check (Bug 6: Forgot Password)
-- ------------------------------------------------------------
-- Securely check if an email belongs to an employee
CREATE OR REPLACE FUNCTION is_employee_email(check_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM employees WHERE email = check_email);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
