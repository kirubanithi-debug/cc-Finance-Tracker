# Implementation Plan: Fix 11 Identified Bugs

This plan addresses the 11 bugs and feature requests identified by the user, organized by module.

## Group 1: User Profile & Authentication (Bugs 1, 5, 6)
- **Bug 1: Profile Persistence & Read-Only Email**
  - **Issue:** Phone number update fails; Data disappears on refresh; Email should be read-only.
  - **Fix:** 
    - Verify `users` table RLS policies for updates.
    - Modify `js/profile.js` to ensure proper error handling and success verification.
    - Set the Email input field to `readonly` or `disabled` in HTML (`index.html`).
- **Bug 5: Password Reset UI**
  - **Issue:** specific "New Password" fields lack a "Show Password" eye icon.
  - **Fix:** Update `reset-password.html` to include the password toggle visibility icon and logic.
- **Bug 6: Employee Password Reset Restriction**
  - **Issue:** Employees should not be able to reset passwords via "Forgot Password".
  - **Fix:** Update `js/auth.js` (`forgotPasswordForm` handler) to check if the email belongs to an employee (via RPC or query) before sending the reset link. If employee, show alert.

## Group 2: Finance Entries & Permissions (Bugs 2, 3, 8, 11)
- **Bug 2: Admin Delete Entry**
  - **Issue:** Admin deletion is not working.
  - **Fix:** Check `finance_entries` RLS policy for `DELETE`. Ensure Admins can delete any entry created by them or their employees.
- **Bug 8: Approval/Decline Logic**
  - **Issue:** Admin approval/decline fails; Employee delete requests need approval.
  - **Fix:** 
    - Verify RLS for `UPDATE` on `finance_entries` (specifically `approval_status` column).
    - Ensure logical flow in `js/data-api.js` for handling delete requests vs immediate deletes.
- **Bug 3 & 11: "Created By" Display (Entries & Invoices)**
  - **Issue:** Shows "Unknown"; needs to show "Admin - [Name]" or "Employee - [Name]".
  - **Fix:** 
    - Modify `js/data-api.js` (`addEntry`, `addInvoice`) to store or fetch the creator's role.
    - Update `js/main.js` (rendering logic) to format the "Created By" column as requested.

## Group 3: Invoices (Bugs 4, 7)
- **Bug 4: Invoice Date Defaults**
  - **Issue:** Date defaults need adjustment.
  - **Fix:** Update `js/invoices.js` (or creation modal init) to set:
    - Invoice Date = Today.
    - Due Date = Today + 3 Days.
- **Bug 7: Client Address Field**
  - **Issue:** Field is too large.
  - **Fix:** Update `css/styles.css` to restrict the height/size of the generic textarea or specific client address field in the invoice form.

## Group 4: Investments (Bugs 9, 10)
- **Bug 9: Admin Investment Persistence**
  - **Issue:** Investments disappear on refresh.
  - **Fix:** Check RLS on `investments` table (`SELECT` policy likely missing or too strict).
- **Bug 10: Employee Investments Flow**
  - **Issue:** Employees can add investments; they should be "Pending" until Admin approves.
  - **Fix:** 
    - Ensure `investments` table has `status` column (default 'pending' for employees).
    - Update `js/investments.js` to show pending status.
    - Add Admin approval UI for investments (similar to finance entries).

## Execution Strategy
1.  **Database Fixes (High Priority):** Create `supabase_migration_v15_fixes_all.sql` to address all RLS (Row Level Security) issues for Users, Entries, Investments, and Invoices.
2.  **Frontend Logic:** Systematically update JS files (`profile.js`, `auth.js`, `data-api.js`, `invoices.js`, `investments.js`).
3.  **UI Polish:** Update HTML/CSS for Password Toggle and Input sizing.

**User Approval:** Waiting for user confirmation to proceed with this plan.
