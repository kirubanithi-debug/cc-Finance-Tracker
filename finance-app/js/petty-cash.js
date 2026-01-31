/**
 * FinanceFlow - Petty Cash Module
 * Standalone module to specific user requirements:
 * 1. Public for Admin & Employee
 * 2. Separate Funds and Expenses
 * 3. Not linked to other modules
 */

const pettyCashManager = {
    entries: [],
    employees: [],
    balance: 0,
    filters: {
        search: '',
        status: ''
    },

    async init() {
        console.log('Initializing Petty Cash Manager...');
        this.cacheDOM();
        this.bindEvents();
        await this.loadEmployees();
        await this.loadData();

        // Listen for real-time changes
        if (window.dataLayer) {
            window.dataLayer.subscribe('petty_cash_entries', () => this.loadData());
        }
    },

    cacheDOM() {
        this.dom = {
            balanceDisplay: document.getElementById('pettyCashBalanceDisplay'),
            tableBody: document.getElementById('pettyCashBody'),
            emptyState: document.getElementById('pettyCashEmptyState'),

            // Buttons
            addFundBtn: document.getElementById('addPettyCashFundBtn'),
            addExpenseBtn: document.getElementById('addPettyCashEntryBtn'),

            // Modals
            fundModal: document.getElementById('pettyCashFundModal'),
            expenseModal: document.getElementById('pettyCashExpenseModal'),

            // Forms
            fundForm: document.getElementById('pettyCashFundForm'),
            expenseForm: document.getElementById('pettyCashExpenseForm'),

            // Close Buttons
            closeFundBtn: document.getElementById('closePettyCashFundModal'),
            closeExpenseBtn: document.getElementById('closePettyCashExpenseModal'),
            cancelFundBtn: document.getElementById('cancelPettyCashFund'),
            cancelExpenseBtn: document.getElementById('cancelPettyCashExpense'),

            // Inputs
            employeeSelect: document.getElementById('pcExpenseEmployee')
        };
    },

    bindEvents() {
        // Open Modals
        if (this.dom.addFundBtn) {
            this.dom.addFundBtn.addEventListener('click', () => this.openModal('fund'));
        }
        if (this.dom.addExpenseBtn) {
            this.dom.addExpenseBtn.addEventListener('click', () => this.openModal('expense'));
        }

        // Close Modals
        [this.dom.closeFundBtn, this.dom.cancelFundBtn].forEach(btn => {
            if (btn) btn.addEventListener('click', () => this.closeModal('fund'));
        });
        [this.dom.closeExpenseBtn, this.dom.cancelExpenseBtn].forEach(btn => {
            if (btn) btn.addEventListener('click', () => this.closeModal('expense'));
        });

        // Form Submit
        if (this.dom.fundForm) {
            this.dom.fundForm.addEventListener('submit', (e) => this.handleFundSubmit(e));
        }
        if (this.dom.expenseForm) {
            this.dom.expenseForm.addEventListener('submit', (e) => this.handleExpenseSubmit(e));
        }

        // Filters
        ['pcFilterStatus', 'pcFilterStartDate', 'pcFilterEndDate'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => this.filterAndRender());
        });

        document.getElementById('pcClearFilters')?.addEventListener('click', () => {
            ['pcFilterStatus', 'pcFilterStartDate', 'pcFilterEndDate'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            this.filterAndRender();
        });

        // Close on outside click
        window.addEventListener('click', (e) => {
            if (e.target === this.dom.fundModal) this.closeModal('fund');
            if (e.target === this.dom.expenseModal) this.closeModal('expense');
        });
    },

    openModal(type) {
        if (type === 'fund' && this.dom.fundModal) {
            this.dom.fundForm.reset();
            const dateInput = document.getElementById('pcFundDate');
            if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
            this.dom.fundModal.classList.add('active');
        } else if (type === 'expense' && this.dom.expenseModal) {
            this.dom.expenseForm.reset();
            const dateInput = document.getElementById('pcExpenseDate');
            if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
            this.dom.expenseModal.classList.add('active');
        }
    },

    closeModal(type) {
        if (type === 'fund' && this.dom.fundModal) {
            this.dom.fundModal.classList.remove('active');
        } else if (type === 'expense' && this.dom.expenseModal) {
            this.dom.expenseModal.classList.remove('active');
        }
    },

    async loadEmployees() {
        try {
            if (window.dataLayer && window.dataLayer.getAllEmployees) {
                this.employees = await window.dataLayer.getAllEmployees();
                await this.populateEmployeeSelect();
            }
        } catch (error) {
            console.error('Error loading employees for petty cash:', error);
        }
    },

    async populateEmployeeSelect() {
        const select = this.dom.employeeSelect;
        if (!select) return;

        const userName = await dataLayer.getCurrentUserName();

        select.innerHTML = '<option value="">-- Select Employee --</option>';
        const meOption = document.createElement('option');
        meOption.value = 'admin'; // Keep 'admin' value to avoid breaking handleExpenseSubmit logic
        meOption.textContent = `Me (${userName})`;
        select.appendChild(meOption);

        if (this.employees && this.employees.length > 0) {
            this.employees.forEach(emp => {
                const option = document.createElement('option');
                option.value = emp.id;
                option.textContent = emp.name;
                select.appendChild(option);
            });
        }
    },

    async loadData() {
        try {
            const adminId = await dataLayer.getAdminId();
            // Fetch relevant entries
            const { data, error } = await supabaseClient
                .from('petty_cash_entries')
                .select('*')
                .eq('admin_id', adminId)
                .order('date', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.entries = data || [];
            this.filterAndRender();
        } catch (error) {
            console.error('Error loading petty cash:', error);
            showToast('Failed to load petty cash data', 'error');
        }
    },

    async filterAndRender() {
        const isAdmin = await dataLayer.isAdmin();
        // Get filter values
        const statusFilter = document.getElementById('pcFilterStatus')?.value || '';
        const startDate = document.getElementById('pcFilterStartDate')?.value || '';
        const endDate = document.getElementById('pcFilterEndDate')?.value || '';

        const displayedEntries = this.entries.filter(entry => {
            const status = entry.status || 'approved';



            let matchesStatus = true;
            if (statusFilter) {
                matchesStatus = status === statusFilter;
            }

            let matchesDate = true;
            if (startDate) {
                matchesDate = matchesDate && entry.date >= startDate;
            }
            if (endDate) {
                matchesDate = matchesDate && entry.date <= endDate;
            }

            return matchesStatus && matchesDate;
        });

        this.calculateBalance(this.entries);
        this.render(displayedEntries);
    },

    calculateBalance(entriesToCalculate) {
        let totalFunds = 0;
        let totalExpenses = 0;

        const entries = entriesToCalculate || this.entries;

        entries.forEach(entry => {
            // Only count approved entries for balance
            if (entry.status !== 'declined') { // Include pending in balance? Usually Pending expenses subtract from balance immediately or wait?
                // Standard logic: Pending expenses might not deduct yet, BUT for Petty Cash usually keys are handed over.
                // However, to keep it clean: Only APPROVED Funds add to balance. 
                // ALL Non-Declined Expenses subtract (conservative view).
                const amount = parseFloat(entry.amount) || 0;

                if (entry.transaction_type === 'add_fund') {
                    // Only approved funds count towards balance
                    if (entry.status === 'approved') {
                        totalFunds += amount;
                    }
                } else if (entry.transaction_type === 'expense') {
                    // Only approved expenses subtract from balance
                    if (entry.status === 'approved') {
                        totalExpenses += amount;
                    }
                }
            }
        });

        this.balance = totalFunds - totalExpenses;
    },

    async render(entriesToRender) {

        const entries = entriesToRender || this.entries;

        // Recalculate balance for ALL entries to ensure accuracy
        this.calculateBalance(this.entries);

        // Update Balance
        if (this.dom.balanceDisplay) {
            this.dom.balanceDisplay.textContent = formatCurrency(this.balance, window.appCurrency || '₹');
            this.dom.balanceDisplay.style.color = this.balance < 0 ? 'var(--color-danger)' : 'var(--color-success)';
        }

        const isAdmin = await dataLayer.isAdmin();
        const currentUserId = await dataLayer.getCurrentUserId();

        // Update Table
        if (this.dom.tableBody) {
            this.dom.tableBody.innerHTML = '';

            if (entries.length === 0) {
                if (this.dom.emptyState) this.dom.emptyState.classList.remove('hidden');
            } else {
                if (this.dom.emptyState) this.dom.emptyState.classList.add('hidden');

                entries.forEach(entry => {
                    const row = document.createElement('tr');
                    const isFund = entry.transaction_type === 'add_fund';
                    const amountClass = isFund ? 'text-success' : 'text-danger';
                    const amountPrefix = isFund ? '+' : '-';

                    let addedBy = entry.employee_name;
                    if (!addedBy) {
                        addedBy = isFund ? 'Admin (Deposit)' : 'Admin';
                    }

                    // Status Badge Logic
                    const status = entry.status || 'approved'; // Default compatibility
                    let badgeClass = 'badge-success';
                    if (status === 'pending') badgeClass = 'badge-warning';
                    if (status === 'declined') badgeClass = 'badge-danger';

                    // Action Buttons Logic
                    let actionsHtml = '';

                    // Approve/Decline for Admin on Pending items
                    if (isAdmin && status === 'pending') {
                        actionsHtml += `
                            <button class="btn-icon text-success" onclick="pettyCashManager.updateStatus('${entry.id}', 'approved')" title="Approve">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </button>
                            <button class="btn-icon text-danger" onclick="pettyCashManager.updateStatus('${entry.id}', 'declined')" title="Decline">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                            </button>
                        `;
                    }

                    // Delete button: Admins can delete anything. Employees can only delete their own PENDING entries.
                    const isOwnEntry = entry.user_id === currentUserId;
                    const canDelete = isAdmin || (status === 'pending' && isOwnEntry);

                    if (canDelete) {
                        actionsHtml += `
                            <button class="btn-icon delete-btn" onclick="pettyCashManager.deleteEntry('${entry.id}')" title="Delete">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                        `;
                    }

                    row.innerHTML = `
                        <td>${formatDate(entry.date)}</td>
                        <td><span class="badge ${isFund ? 'badge-primary' : 'badge-secondary'}" style="margin-bottom: 4px; display: inline-block;">${isFund ? 'Fund IN' : 'Expense OUT'}</span></td>
                        <td><span style="font-weight: 500;">${addedBy}</span></td>
                        <td>${entry.description}</td>
                        <td>${entry.category || '-'}</td>
                        <td class="${amountClass}" style="font-weight: 600;">
                            ${amountPrefix}${formatCurrency(entry.amount, window.appCurrency || '₹')}
                        </td>
                        <td><span class="badge ${badgeClass}">${status.charAt(0).toUpperCase() + status.slice(1)}</span></td>
                        <td>
                            <div class="action-buttons">
                                ${actionsHtml}
                            </div>
                        </td>
                    `;
                    this.dom.tableBody.appendChild(row);
                });
            }
        }
    },

    async handleFundSubmit(e) {
        e.preventDefault();
        const amount = document.getElementById('pcFundAmount').value;
        const description = document.getElementById('pcFundDescription').value;
        const date = document.getElementById('pcFundDate').value;

        const userName = await dataLayer.getCurrentUserName();
        const isAdmin = await dataLayer.isAdmin();

        await this.addTransaction({
            amount,
            description,
            date,
            transaction_type: 'add_fund',
            category: 'Fund Deposit',
            employee_name: isAdmin ? 'Admin' : userName
        });

        this.closeModal('fund');
    },

    async handleExpenseSubmit(e) {
        e.preventDefault();
        const amount = document.getElementById('pcExpenseAmount').value;
        const description = document.getElementById('pcExpenseDescription').value;
        const date = document.getElementById('pcExpenseDate').value;
        const category = document.getElementById('pcExpenseCategory').value;
        const employeeIdSelect = document.getElementById('pcExpenseEmployee').value;

        if (parseFloat(amount) > this.balance) {
            const confirmMsg = `Warning: Expense amount (${formatCurrency(amount)}) exceeds available balance (${formatCurrency(this.balance)}). Continue?`;
            if (!(await app.showConfirmationModal('Balance Overlimit', confirmMsg))) return;
        }

        let employeeName = 'Admin';
        let employeeId = null;

        if (employeeIdSelect && employeeIdSelect !== 'admin') {
            const emp = this.employees.find(e => e.id === employeeIdSelect);
            if (emp) {
                employeeName = emp.name;
                employeeId = emp.id;
            }
        }

        await this.addTransaction({
            amount,
            description,
            date,
            transaction_type: 'expense',
            category,
            employee_id: employeeId,
            employee_name: employeeName
        });

        this.closeModal('expense');
    },

    async addTransaction(data) {
        try {
            const userId = await dataLayer.getCurrentUserId();
            const isAdmin = await dataLayer.isAdmin();
            const adminId = await dataLayer.getAdminId();

            // Determine status
            let status = 'approved'; // Default for Admin

            // If expense added BY employee (or for employee?), it might need approval
            // Current rule: If Admin adds -> Approved. If Employee adds -> Pending.
            if (!isAdmin) {
                status = 'pending';
            }

            // Allow Admin to add on behalf of employee as "Approved" by default

            const entry = {
                ...data,
                user_id: userId,
                admin_id: adminId,
                status: status,
                created_at: new Date().toISOString()
            };

            const { error } = await supabaseClient
                .from('petty_cash_entries')
                .insert(entry);

            if (error) throw error;

            showToast(status === 'pending' ? 'Expense submitted for approval' : 'Transaction added successfully', 'success');
            await this.loadData();

        } catch (error) {
            console.error('Error adding transaction:', error);
            showToast('Failed to add transaction', 'error');
        }
    },

    async updateStatus(id, newStatus) {
        if (!(await app.showConfirmationModal('Update Status', `Are you sure you want to ${newStatus === 'approved' ? 'approve' : 'decline'} this entry?`))) return;

        try {
            // If declining an expense, it shouldn't affect balance (balance calc handles this by filtering declined)
            // If approving, it stays as expense.

            const { error } = await supabaseClient
                .from('petty_cash_entries')
                .update({ status: newStatus })
                .eq('id', parseInt(id)); // Convert string ID to integer for DB matching

            if (error) throw error;

            showToast(`Entry ${newStatus}`, 'success');
            await this.loadData(); // Re-fetch to ensure perfect sync and balance accuracy

        } catch (error) {
            console.error('Error updating status:', error);
            showToast('Failed to update status', 'error');
        }
    },

    async deleteEntry(id) {
        const entry = this.entries.find(e => e.id == id);
        if (!entry) return;

        const isAdmin = await dataLayer.isAdmin();
        const currentUserId = await dataLayer.getCurrentUserId();

        // Security check
        const isAllowedStatus = entry.status === 'pending' || entry.status === 'declined';
        if (!isAdmin && (!isAllowedStatus || entry.user_id !== currentUserId)) {
            showToast('You can only delete your own pending or declined entries', 'error');
            return;
        }

        if (!(await app.showConfirmationModal('Delete Entry', 'Are you sure you want to delete this entry?'))) return;

        try {
            const { error } = await supabaseClient
                .from('petty_cash_entries')
                .delete()
                .eq('id', parseInt(id));

            if (error) throw error;

            showToast('Entry deleted', 'success');

            // Optimistic update
            // Handle string vs number ID mismatch
            this.entries = this.entries.filter(e => e.id != id);
            this.filterAndRender();

        } catch (error) {
            console.error('Error deleting entry:', error);
            showToast('Failed to delete entry', 'error');
        }
    }
};

window.pettyCashManager = pettyCashManager;

// Auto-init removed; handled by app.js
