-- Migration V54: Fix Password Reset Notification Logic
-- The previous version incorrectly assumed admin_id was in the users table.
-- This version correctly fetches admin_id from the employees table.

CREATE OR REPLACE FUNCTION public.request_employee_password_reset_notification(target_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid;
    v_admin_id uuid;
    v_user_name text;
BEGIN
    -- 1. Correct logic: Find the employee in the employees table to get their admin_id
    SELECT user_id, admin_id, name INTO v_user_id, v_admin_id, v_user_name
    FROM employees
    WHERE email = target_email
    LIMIT 1;

    -- 2. If no record found in employees table, this is not an employee we manage
    -- (or they are an admin/standalone user who can reset normally)
    IF v_admin_id IS NULL THEN
        -- Check if they are in users table but maybe not in employees (unlikely but safe)
        -- In our system, if they aren't in 'employees', they are an 'admin' or standalone.
        RETURN false;
    END IF;

    -- 3. Check if a pending request already exists to prevent spam (last 1 hour)
    IF EXISTS (
        SELECT 1 FROM notifications 
        WHERE admin_id = v_admin_id 
          AND type = 'password_reset_request' 
          AND metadata->>'email' = target_email
          AND created_at > (now() - interval '1 hour')
          AND is_read = false
    ) THEN
        RETURN true; -- Already notified recently
    END IF;

    -- 4. Insert Notification for the Admin
    INSERT INTO notifications (
        admin_id,
        user_id,
        title,
        message,
        type,
        metadata,
        is_read,
        created_at
    ) VALUES (
        v_admin_id,
        v_user_id, -- Link to user profile if they have one
        'Password Reset Request',
        coalesce(v_user_name, 'Employee') || ' (' || target_email || ') requested a password reset. Please provide them with new credentials.',
        'password_reset_request',
        jsonb_build_object('email', target_email, 'name', v_user_name),
        false,
        now()
    );

    RETURN true;
END;
$$;

-- Ensure permissions are still active
GRANT EXECUTE ON FUNCTION public.is_employee_email(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.is_employee_email(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_employee_password_reset_notification(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.request_employee_password_reset_notification(TEXT) TO authenticated;
