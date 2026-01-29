/**
 * FinanceFlow - Petty Cash Module
 * Standalone module to specific user requirements:
 * 1. Public for Admin & Employee
 * 2. Separate Funds and Expenses
 * 3. Not linked to other modules
 */

const pettyCashManager = {
    entries: [],
    balance: 0,

    async init() {
        console.log('Initializing Petty Cash Manager...');
        this.cacheDOM();
        this.bindEvents();
        await this.loadData();
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
            cancelExpenseBtn: document.getElementById('cancelPettyCashExpense')
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

        // Close on outside click
        window.addEventListener('click', (e) => {
            if (e.target === this.dom.fundModal) this.closeModal('fund');
            if (e.target === this.dom.expenseModal) this.closeModal('expense');
        });
    },

    openModal(type) {
        if (type === 'fund' && this.dom.fundModal) {
            this.dom.fundForm.reset();
            this.dom.fundModal.classList.add('active');
        } else if (type === 'expense' && this.dom.expenseModal) {
            this.dom.expenseForm.reset();
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

    async loadData() {
        try {
            // Fetch all entries
            const { data, error } = await supabaseClient
                .from('petty_cash_entries')
                .select('*')
                .order('date', { ascending: false });

            if (error) throw error;

            this.entries = data || [];
            this.calculateBalance();
            this.render();
        } catch (error) {
            console.error('Error loading petty cash:', error);
            showToast('Failed to load petty cash data', 'error');
        }
    },

    calculateBalance() {
        let totalFunds = 0;
        let totalExpenses = 0;

        this.entries.forEach(entry => {
            const amount = parseFloat(entry.amount) || 0;
            if (entry.transaction_type === 'add_fund') {
                totalFunds += amount;
            } else if (entry.transaction_type === 'expense') {
                totalExpenses += amount;
            }
        });

        this.balance = totalFunds - totalExpenses;
    },

    render() {
        // Update Balance
        if (this.dom.balanceDisplay) {
            this.dom.balanceDisplay.textContent = formatCurrency(this.balance, window.appCurrency || '₹');
            this.dom.balanceDisplay.style.color = this.balance < 0 ? 'var(--color-danger)' : 'var(--color-success)';
        }

        // Update Table
        if (this.dom.tableBody) {
            this.dom.tableBody.innerHTML = '';

            if (this.entries.length === 0) {
                if (this.dom.emptyState) this.dom.emptyState.classList.remove('hidden');
            } else {
                if (this.dom.emptyState) this.dom.emptyState.classList.add('hidden');

                this.entries.forEach(entry => {
                    const row = document.createElement('tr');
                    const isFund = entry.transaction_type === 'add_fund';
                    const amountClass = isFund ? 'text-success' : 'text-danger';
                    const amountPrefix = isFund ? '+' : '-';

                    row.innerHTML = `
                        <td>${formatDate(entry.date)}</td>
                        <td>${entry.type || (isFund ? 'Fund Added' : 'Expense')}</td>
                        <td>${entry.description}</td>
                        <td>${entry.category || '-'}</td>
                        <td class="${amountClass}" style="font-weight: 600;">
                            ${amountPrefix}${formatCurrency(entry.amount, window.appCurrency || '₹')}
                        </td>
                        <td>
                             <button class="btn-icon delete-btn" onclick="pettyCashManager.deleteEntry('${entry.id}')" title="Delete">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
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

        await this.addTransaction({
            amount,
            description,
            date,
            transaction_type: 'add_fund',
            category: 'Fund Deposit'
        });

        this.closeModal('fund');
    },

    async handleExpenseSubmit(e) {
        e.preventDefault();
        const amount = document.getElementById('pcExpenseAmount').value;
        const description = document.getElementById('pcExpenseDescription').value;
        const date = document.getElementById('pcExpenseDate').value;
        const category = document.getElementById('pcExpenseCategory').value;

        if (parseFloat(amount) > this.balance) {
            const confirmMsg = `Warning: Expense amount (${formatCurrency(amount)}) exceeds available balance (${formatCurrency(this.balance)}). Continue?`;
            if (!confirm(confirmMsg)) return;
        }

        await this.addTransaction({
            amount,
            description,
            date,
            transaction_type: 'expense',
            category
        });

        this.closeModal('expense');
    },

    async addTransaction(data) {
        try {
            const user = await supabaseClient.auth.getUser();
            const userId = user.data.user?.id;

            // Get Admin ID (simplified, assuming single tenant or current user context)
            // For now we use the user's ID as admin_id if they are the creator, 
            // OR we should get it from the user profile if they are an employee.
            // Using existing helper if available or simple fetch

            let adminId = userId;
            // Try to get admin_id from local profile if available
            const profile = JSON.parse(localStorage.getItem('finance_user_profile') || '{}');
            if (profile.admin_id) adminId = profile.admin_id;

            const entry = {
                ...data,
                user_id: userId,
                admin_id: adminId,
                created_at: new Date().toISOString()
            };

            const { error } = await supabaseClient
                .from('petty_cash_entries')
                .insert(entry);

            if (error) throw error;

            showToast('Transaction added successfully', 'success');
            await this.loadData();

        } catch (error) {
            console.error('Error adding transaction:', error);
            showToast('Failed to add transaction', 'error');
        }
    },

    async deleteEntry(id) {
        if (!confirm('Are you sure you want to delete this entry?')) return;

        try {
            const { error } = await supabaseClient
                .from('petty_cash_entries')
                .delete()
                .eq('id', id);

            if (error) throw error;

            showToast('Entry deleted', 'success');
            await this.loadData();
        } catch (error) {
            console.error('Error deleting entry:', error);
            showToast('Failed to delete entry', 'error');
        }
    }
};

// Initialize when DOM is ready
// Auto-init removed; handled by app.js
