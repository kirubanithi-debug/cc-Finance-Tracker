-- ============================================================
-- Migration v17: Final Performance Cleanup
-- ============================================================

-- ------------------------------------------------------------
-- 1. Remove Duplicate Index
-- ------------------------------------------------------------
-- Supabase reports "idx_employees_user_id" and "idx_employees_user_id_fk" are identical.
-- We keep the cleaner named one.
DROP INDEX IF EXISTS idx_employees_user_id_fk;

-- ------------------------------------------------------------
-- 2. Add Missing Index for Invoices
-- ------------------------------------------------------------
-- Supabase reports "invoices_user_id_fkey" is unindexed.
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
