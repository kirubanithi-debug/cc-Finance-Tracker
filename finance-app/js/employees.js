/**
 * FinanceFlow - Employees Module
 * Handles employee management UI for admins
 */

class EmployeesManager {
    constructor() {
        this.employees = [];
        this.editingEmployeeId = null;
    }

    /**
     * Initialize the employees module
     */
    async init() {
        // Check if user is admin
        const isAdmin = await dataLayer.isAdmin();
        if (!isAdmin) {
            this.hideEmployeesSection();
            return;
        }

        this.bindEvents();
        await this.loadEmployees();
    }

    /**
     * Hide employees section for non-admins
     */
    hideEmployeesSection() {
        const navItem = document.querySelector('[data-page="employees"]');
        if (navItem) {
            navItem.closest('.nav-item').style.display = 'none';
        }
        const employeesPage = document.getElementById('employeesPage');
        if (employeesPage) {
            employeesPage.style.display = 'none';
        }
    }

    /**
     * Bind UI events
     */
    bindEvents() {
        // Add employee button
        const addBtn = document.getElementById('addEmployeeBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.openEmployeeModal());
        }

        // Employee form submission
        const form = document.getElementById('employeeForm');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveEmployee();
            });
        }

        // Modal close buttons
        const closeBtn = document.getElementById('closeEmployeeModal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeEmployeeModal());
        }

        const cancelBtn = document.getElementById('cancelEmployeeBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.closeEmployeeModal());
        }

        // Close modal on backdrop click
        const modal = document.getElementById('employeeModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeEmployeeModal();
                }
            });
        }

        // Subscribe to data changes
        dataLayer.subscribe(DATA_STORES.EMPLOYEES, () => this.loadEmployees());
    }

    /**
     * Load and render employees
     */
    async loadEmployees() {
        try {
            this.employees = await dataLayer.getAllEmployees();
            this.renderEmployees();
        } catch (error) {
            console.error('Error loading employees:', error);
            showToast('Error loading employees', 'error');
        }
    }

    /**
     * Render employees list
     */
    renderEmployees() {
        const container = document.getElementById('employeesList');
        if (!container) return;

        if (this.employees.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    <h3>No Employees Yet</h3>
                    <p>Add your first employee to get started</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.employees.map(emp => `
            <div class="employee-card" data-id="${emp.id}">
                <div class="employee-avatar">
                    <span>${this.getInitials(emp.name)}</span>
                </div>
                <div class="employee-info">
                    <h4 class="employee-name">${this.escapeHtml(emp.name)}</h4>
                    <p class="employee-email">${this.escapeHtml(emp.email)}</p>
                    <span class="employee-status badge ${emp.user_id ? 'badge-success' : 'badge-warning'}">
                        ${emp.user_id ? 'Active' : 'Pending Setup'}
                    </span>
                </div>
                <div class="employee-actions">
                    <button class="btn-icon" onclick="employeesManager.editEmployee('${emp.id}')" title="Edit">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="btn-icon btn-danger" onclick="employeesManager.deleteEmployee('${emp.id}')" title="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                    <button class="btn-icon" onclick="employeesManager.sendResetLink('${emp.email}')" title="Send Password Reset Link">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                             <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                             <polyline points="10 17 15 12 10 7"/>
                             <line x1="15" y1="12" x2="3" y2="12"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Open employee modal for add/edit
     */
    openEmployeeModal(employee = null) {
        const modal = document.getElementById('employeeModal');
        const title = document.getElementById('employeeModalTitle');
        const form = document.getElementById('employeeForm');
        const passwordGroup = document.getElementById('employeePasswordGroup');

        if (!modal || !form) return;

        // Reset form
        form.reset();
        this.editingEmployeeId = null;

        if (employee) {
            // Edit mode
            title.textContent = 'Edit Employee';
            this.editingEmployeeId = employee.id;
            document.getElementById('employeeName').value = employee.name;
            document.getElementById('employeeEmail').value = employee.email;

            // Show password if available (admin view)
            if (employee.plain_password) {
                if (passwordGroup) passwordGroup.style.display = 'block';
                document.getElementById('employeePassword').value = employee.plain_password;
            } else {
                // If no plain password stored (old records), hide it or show empty
                if (passwordGroup) passwordGroup.style.display = 'block';
                document.getElementById('employeePassword').value = '';
                document.getElementById('employeePassword').placeholder = 'Password not saved (reset required)';
            }
        } else {
            // Add mode
            title.textContent = 'Add Employee';
            if (passwordGroup) passwordGroup.style.display = 'block';
            document.getElementById('employeePassword').value = '';
            document.getElementById('employeePassword').placeholder = 'Minimum 6 characters';
        }

        modal.classList.add('active');
    }

    /**
     * Close employee modal
     */
    closeEmployeeModal() {
        const modal = document.getElementById('employeeModal');
        if (modal) {
            modal.classList.remove('active');
        }
        this.editingEmployeeId = null;
    }

    /**
     * Save employee (add or update)
     */
    async saveEmployee() {
        const name = document.getElementById('employeeName').value.trim();
        const email = document.getElementById('employeeEmail').value.trim();
        const password = document.getElementById('employeePassword')?.value;
        const saveBtn = document.getElementById('saveEmployeeBtn');

        if (!name || !email) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        // Show loading state
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Creating Account...';
        }

        try {
            if (this.editingEmployeeId) {
                // Update existing employee
                await dataLayer.updateEmployee(this.editingEmployeeId, { name, email });

                // If password was entered during edit, send a reset link as we can't directly change it
                if (password && password.length > 0) {
                    await supabaseClient.auth.resetPasswordForEmail(email, {
                        redirectTo: window.location.origin + '/login.html' // Redirect to login after reset
                    });
                    showToast('Employee updated & Password reset link sent', 'success');
                } else {
                    showToast('Employee updated successfully', 'success');
                }
            } else {
                // Add new employee with account creation
                if (!password || password.length < 6) {
                    showToast('Password must be at least 6 characters', 'error');
                    if (saveBtn) {
                        saveBtn.disabled = false;
                        saveBtn.textContent = 'Save & Give Access';
                    }
                    return;
                }

                // Get current admin's ID
                const adminId = await dataLayer.getCurrentUserId();

                // Create Supabase auth account for employee
                const { data: authData, error: authError } = await supabaseClient.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            name: name,
                            role: 'employee',
                            admin_id: adminId
                        },
                        emailRedirectTo: window.location.origin + '/verify.html'
                    }
                });

                if (authError) {
                    throw new Error(authError.message);
                }

                if (authData.user) {
                    // Create employee record in employees table
                    const { error: empError } = await supabaseClient
                        .from('employees')
                        .insert({
                            admin_id: adminId,
                            user_id: authData.user.id, // Store key auth ID
                            name: name,
                            email: email,
                            plain_password: password
                        });

                    if (empError) {
                        console.error('Error creating employee record:', empError);
                        throw new Error('Failed to save employee data: ' + empError.message);
                    }

                    // Create user record with employee role (optional, for redundancy)
                    const { error: userError } = await supabaseClient
                        .from('users')
                        .insert({
                            id: authData.user.id,
                            name: name,
                            email: email,
                            role: 'employee'
                        });

                    if (userError) {
                        console.warn('Error creating user record (non-fatal):', userError);
                    }

                    await this.loadEmployees(); // Explicitly refresh list
                    showToast(`Employee created! Login credentials sent to ${email}`, 'success');
                } else {
                    throw new Error('Failed to create auth account (no user returned)');
                }
            }

            this.closeEmployeeModal();
            // Add small delay to ensure DB propagation
            setTimeout(async () => {
                await this.loadEmployees();
            }, 500);

        } catch (error) {
            console.error('Error saving employee:', error);
            showToast(error.message || 'Error saving employee', 'error');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = this.editingEmployeeId ? 'Save Changes' : 'Save & Give Access';
            }
        }
    }

    /**
     * Edit employee
     */
    async editEmployee(id) {
        const employee = this.employees.find(e => e.id === id);
        if (employee) {
            this.openEmployeeModal(employee);
        }
    }

    /**
     * Delete employee
     * Note: Finance entries, invoices, and other data created by the employee
     * are AUTOMATICALLY PRESERVED - they are not deleted with the employee.
     */
    async deleteEmployee(id) {
        const employee = this.employees.find(e => e.id === id);
        const empName = employee?.name || 'this employee';

        const confirmMessage = `Delete ${empName}?\n\n` +
            `• The employee's login access will be removed\n` +
            `• All entries, invoices, and data created by them will be PRESERVED\n` +
            `• The data will still show "${empName}" as the creator\n\n` +
            `This action cannot be undone.`;

        if (!confirm(confirmMessage)) {
            return;
        }

        try {
            await dataLayer.deleteEmployee(id);
            showToast(`${empName} deleted. Their entries are preserved.`, 'success');
            await this.loadEmployees();
        } catch (error) {
            console.error('Error deleting employee:', error);
            showToast('Error deleting employee', 'error');
        }
    }

    /**
     * Send password reset link manually
     */
    async sendResetLink(email) {
        if (!confirm(`Send password reset link to ${email}?`)) return;

        try {
            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/login.html'
            });

            if (error) throw error;
            showToast(`Reset link sent to ${email}`, 'success');
        } catch (error) {
            console.error('Error sending reset link:', error);
            showToast('Failed to send reset link', 'error');
        }
    }

    /**
     * Get initials from name
     */
    getInitials(name) {
        if (!name) return '?';
        return name.split(' ')
            .map(word => word.charAt(0).toUpperCase())
            .slice(0, 2)
            .join('');
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Create global instance
const employeesManager = new EmployeesManager();

// Global password toggle function for employee modal
window.toggleEmployeePassword = function () {
    const input = document.getElementById('employeePassword');
    const btn = input.parentElement.querySelector('.password-toggle');
    const eyeIcon = btn.querySelector('.eye-icon');
    const eyeOffIcon = btn.querySelector('.eye-off-icon');

    if (input.type === 'password') {
        input.type = 'text';
        eyeIcon.classList.add('hidden');
        eyeOffIcon.classList.remove('hidden');
    } else {
        input.type = 'password';
        eyeIcon.classList.remove('hidden');
        eyeOffIcon.classList.add('hidden');
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for dataLayer to be ready
    setTimeout(() => {
        employeesManager.init();
    }, 500);
});
