-- ============================================================
-- Migration v16: Fix Security Advisors & Performance Issues
-- ============================================================

-- ------------------------------------------------------------
-- 1. SECURITY: Fix Mutable Search Path in Function
-- ------------------------------------------------------------
-- Fixes "Function Search Path Mutable" warning for is_employee_email
CREATE OR REPLACE FUNCTION public.is_employee_email(check_email TEXT)
RETURNS BOOLEAN 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public -- Explicitly set search path for security
AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM employees WHERE email = check_email);
END;
$$;

-- ------------------------------------------------------------
-- 2. SECURITY: Tighten Investments Insert Policy
-- ------------------------------------------------------------
-- Fixes "RLS Policy Always True" warning
DROP POLICY IF EXISTS "investments_insert" ON investments;

CREATE POLICY "investments_insert" ON investments FOR INSERT TO authenticated 
    WITH CHECK (
        -- User can insert if they are assigning it to themselves
        (created_by = (SELECT auth.uid()))
        OR
        -- OR if they are an admin assigning it to their organization
        (admin_id = (SELECT auth.uid()))
    );

-- ------------------------------------------------------------
-- 3. CLEANUP: Remove Duplicate Permissive Policies
-- ------------------------------------------------------------
-- Fixes "Multiple Permissive Policies" warning on finance_entries
-- We recently created "finance_entries_delete/update", so we remove the old "entries_delete/update"
DROP POLICY IF EXISTS "entries_delete" ON finance_entries;
DROP POLICY IF EXISTS "entries_update" ON finance_entries;
-- Also check for other potential duplicates based on naming conventions used previously
DROP POLICY IF EXISTS "Enable delete for users based on user_id" ON finance_entries;
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON finance_entries;

-- ------------------------------------------------------------
-- 4. PERFORMANCE: Add Missing Indicies
-- ------------------------------------------------------------
-- Fixes "Unindexed foreign keys" warnings

-- Index for finance_entries created_by (if column exists and is FK)
CREATE INDEX IF NOT EXISTS idx_finance_entries_created_by ON finance_entries(created_by);

-- Index for investments admin_id
CREATE INDEX IF NOT EXISTS idx_investments_admin_id ON investments(admin_id);

-- Index for invoice_services invoice_id (Crucial for invoice loading speed)
CREATE INDEX IF NOT EXISTS idx_invoice_services_invoice_id ON invoice_services(invoice_id);

-- Index for employees user_id (checking roles)
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id);

-- Index for employees admin_id (filtering by admin)
CREATE INDEX IF NOT EXISTS idx_employees_admin_id ON employees(admin_id);
