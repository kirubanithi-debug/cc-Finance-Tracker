-- ============================================================
-- Migration v14: Fix Employees Insert Policy and Users Profile Check
-- ============================================================

-- 1. ERROR: "new row violated row-level security policy for table 'employees'"
-- Caused because the Admin (auth.uid = X) is trying to INSERT a row into 'employees'
-- where 'user_id' = Y (the new employee's ID).
-- We need to check the exact policy. If it requires 'user_id = auth.uid()', that's wrong for this case.
-- Admin should be able to insert valid rows where 'admin_id = auth.uid()'.

DROP POLICY IF EXISTS "employees_insert" ON employees;

CREATE POLICY "employees_insert" ON employees FOR INSERT TO authenticated 
    WITH CHECK (
        -- Allow if the inserted admin_id matches the current user (The Admin)
        admin_id = (SELECT auth.uid())
    );

-- 2. Relax update policy for employees table as well
-- Admin should be able to update their own employees
DROP POLICY IF EXISTS "employees_update" ON employees;
CREATE POLICY "employees_update" ON employees FOR UPDATE TO authenticated 
    USING (admin_id = (SELECT auth.uid()));

-- 3. Relax delete policy for employees table
DROP POLICY IF EXISTS "employees_delete" ON employees;
CREATE POLICY "employees_delete" ON employees FOR DELETE TO authenticated 
    USING (admin_id = (SELECT auth.uid()));

-- 4. Fix User Profile Update Issue "failed to update profile"
-- The previous v13 migration tried to fix this, but let's double check.
-- Sometimes the trigger setup fails if the function ownership is wrong.
-- We will GRANT execute permission to authenticated users just in case.

GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;

-- 5. Ensure Users Policy allows INSERT by Admin for Employee (if that logic exists)
-- In the JS code: `supabaseClient.from('users').insert({...})` runs as the Admin logged in.
-- But the record has `id = new_employee_id`. 
-- The existing policy `(id = auth.uid())` BLOCKS this because Admin ID != Employee ID.
-- We must allow Admins to insert User profiles for their employees.

DROP POLICY IF EXISTS "Users can insert own profile" ON users;
DROP POLICY IF EXISTS "users_insert_own_or_admin" ON users;

CREATE POLICY "users_insert_own_or_admin" ON users FOR INSERT TO authenticated 
    WITH CHECK (
        -- User inserting their own profile (Signup)
        id = (SELECT auth.uid())
        OR
        -- Admin inserting a profile for an employee
        -- (We check if the *current user* is an admin in the employees table for this new user? No, we can't link easily yet)
        -- (Instead, we check if the current user has the 'admin' role in the users table)
        EXISTS (SELECT 1 FROM users WHERE id = (SELECT auth.uid()) AND role = 'admin')
    );

