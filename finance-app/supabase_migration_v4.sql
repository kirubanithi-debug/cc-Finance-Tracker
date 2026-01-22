-- Add approval columns to finance_entries
ALTER TABLE finance_entries 
ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'declined')),
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS created_by_name TEXT;

-- Update existing entries to be approved (assuming legacy data is valid)
UPDATE finance_entries 
SET approval_status = 'approved' 
WHERE approval_status IS NULL OR approval_status = 'pending';

-- Fix created_by_name for existing entries by joining with users table
UPDATE finance_entries
SET created_by_name = users.name
FROM users
WHERE finance_entries.user_id::text = users.id::text
AND (finance_entries.created_by_name IS NULL OR finance_entries.created_by_name = 'Unknown');

-- Index for faster filtering
CREATE INDEX IF NOT EXISTS idx_finance_entries_approval ON finance_entries(approval_status);
