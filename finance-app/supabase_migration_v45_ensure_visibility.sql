-- Migration V45: Ensure Visibility for Employees
-- Fixes "No Agency Info" and "No Petty Cash Balance" by ensuring Admin ID lookup works.

-- 1. Ensure `employees` table is readable by the employee themselves
-- (Required for getAdminId() to work, which powers Settings and Petty Cash filtering)
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "employees_select" ON employees;
DROP POLICY IF EXISTS "employees_insert" ON employees;
DROP POLICY IF EXISTS "employees_update" ON employees;
DROP POLICY IF EXISTS "employees_delete" ON employees;
DROP POLICY IF EXISTS "Employees can view own profile" ON employees;

CREATE POLICY "Employees can view own profile" ON employees
    FOR SELECT
    USING (user_id = (select auth.uid()));

-- 2. Ensure `finance_entries` allows 'Petty Cash' name match (Redundant but safe)
-- Used for Petty Cash Balance
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

-- 3. Ensure `settings` table is readable by Team
-- Used for Invoice Agency Info
DROP POLICY IF EXISTS "View team settings" ON settings;
CREATE POLICY "View team settings" ON settings
    FOR SELECT
    USING (
        admin_id = (select auth.uid()) 
        OR 
        admin_id IN (SELECT admin_id FROM employees WHERE user_id = (select auth.uid()))
    );
