-- Migration V46: Remove Petty Cash Module completely
-- User requested full removal of "petty case".

-- 1. Drop the Petty Cash spending ledger table
DROP TABLE IF EXISTS petty_cash_entries;

-- 2. Update RLS FIRST to remove dependency on is_petty_cash column
DROP POLICY IF EXISTS "Users can view relevant entries" ON finance_entries;

CREATE POLICY "Users can view relevant entries" ON finance_entries
    FOR SELECT 
    USING (
        ((select auth.uid()) = user_id) OR 
        (admin_id = (select auth.uid())) 
        -- Removed: Petty Cash shared visibility logic
    );

-- 3. Now safe to remove the 'is_petty_cash' flag
ALTER TABLE finance_entries DROP COLUMN IF EXISTS is_petty_cash;
