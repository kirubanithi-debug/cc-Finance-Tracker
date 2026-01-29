-- Function to handle password reset requests securely
-- This allows unauthenticated users (anon) to request a reset without exposing user data via RLS

CREATE OR REPLACE FUNCTION request_password_reset(email_input text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with privileges of the creator (postgres/admin)
SET search_path = public -- Secure search path
AS $$
DECLARE
    v_user_id uuid;
    v_role text;
    v_admin_id uuid;
    v_name text;
BEGIN
    -- 1. Check if user exists in our public users table
    SELECT id, role, admin_id, name 
    INTO v_user_id, v_role, v_admin_id, v_name
    FROM users 
    WHERE email = email_input;

    -- If user not found, return generic success to prevent email enumeration (or specific code if you prefer UI feedback)
    IF v_user_id IS NULL THEN
        RETURN json_build_object('status', 'not_found');
    END IF;

    -- 2. If Employee, create notification and BLOCK reset
    IF v_role = 'employee' AND v_admin_id IS NOT NULL THEN
        
        -- Insert notification for the admin
        INSERT INTO notifications (
            admin_id,
            user_id,
            title,
            message,
            type,
            metadata
        ) VALUES (
            v_admin_id,
            NULL, -- User is not logged in, so no user_id link or use v_user_id if you want to link to the profile
            'Password Reset Request',
            'Employee ' || COALESCE(v_name, email_input) || ' (' || email_input || ') has requested a password reset. Approve to allow them to reset it.',
            'password_reset_request',
            json_build_object('email', email_input, 'name', v_name)
        );
        
        RETURN json_build_object('status', 'employee_approval_needed');
    END IF;

    -- 3. If Admin or standard user, allow reset
    RETURN json_build_object('status', 'allowed');

END;
$$;

-- Grant execute permission to anon (public) so forgot password page can call it
GRANT EXECUTE ON FUNCTION request_password_reset(text) TO anon;
GRANT EXECUTE ON FUNCTION request_password_reset(text) TO authenticated;
GRANT EXECUTE ON FUNCTION request_password_reset(text) TO service_role;
