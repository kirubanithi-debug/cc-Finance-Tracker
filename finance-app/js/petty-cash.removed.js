/**
 * FinanceFlow - Petty Cash Manager
 * Handles petty cash expenses and balance tracking
 */

class PettyCashManager {
    constructor() {
        this.entries = [];
        this.fundAllocations = [];
        this.balance = 0;
    }

    /**
     * Initialize manager
     */
    async init() {
        this.bindEvents();
        await this.refreshData();

        // Subscribe to data changes from main entries (for allocations)
        dataLayer.subscribe(DATA_STORES.ENTRIES, async () => {
            console.log('Main entries changed, refreshing petty cash headers...');
            await this.loadFundAllocations();
            this.calculateBalance();
            this.updateUI();
        });
    }

    /**
     * Bind UI events
     */
    bindEvents() {
        // "Add Entry" Toggle Logic (Global Add Entry Modal)
        const typeSelect = document.getElementById('entryType');
        const toggleWrapper = document.getElementById('pettyCashToggleWrapper');
        const toggleInput = document.getElementById('addToPettyCashToggle');
        const clientSelect = document.getElementById('entryClient'); // In entry form

        // NEW: Add Funds Button Logic (Simplified Dedicated Modal)
        const addFundBtn = document.getElementById('addPettyCashFundBtn');
        const fundModal = document.getElementById('pettyCashFundModal');
        const fundForm = document.getElementById('pettyCashFundForm');

        if (addFundBtn && fundModal) {
            addFundBtn.addEventListener('click', () => {
                if (fundForm) {
                    fundForm.reset();
                    // Set default description
                    const desc = document.getElementById('pcfDescription');
                    if (desc) desc.value = 'Petty Cash Replenishment';
                }
                fundModal.classList.add('active');
            });

            // Close Logic
            const closeBtn = document.getElementById('closePettyCashFundModal');
            const cancelBtn = document.getElementById('cancelPettyCashFund');
            const closeFundModal = () => fundModal.classList.remove('active');

            if (closeBtn) closeBtn.addEventListener('click', closeFundModal);
            if (cancelBtn) cancelBtn.addEventListener('click', closeFundModal);
            fundModal.addEventListener('click', (e) => {
                if (e.target === fundModal) closeFundModal();
            });

            // Submit Logic
            if (fundForm) {
                // Remove old listeners to avoid duplicates if re-bound? 
                // bindEvents usually runs once. Safe.
                fundForm.addEventListener('submit', async (e) => {
                    e.preventDefault();

                    const submitBtn = fundForm.querySelector('button[type="submit"]');
                    const originalText = submitBtn.innerHTML;
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = 'Adding...';

                    try {
                        const amount = parseFloat(document.getElementById('pcfAmount').value);
                        const description = document.getElementById('pcfDescription').value;
                        const paymentMode = document.getElementById('pcfPaymentMode').value;

                        const entry = {
                            date: new Date().toISOString().split('T')[0],
                            client: 'Petty Cash',
                            description: description,
                            amount: amount,
                            type: 'expense',
                            status: 'pending', // data-api will auto-approve for admin
                            paymentMode: paymentMode,
                            isPettyCash: true
                        };

                        await dataLayer.addEntry(entry);
                        showToast('Funds added successfully', 'success');
                        closeFundModal();
                        this.refreshData(); // Refresh UI to show new balance
                    } catch (error) {
                        console.error('Failed to add funds:', error);
                        showToast('Failed to add funds: ' + error.message, 'error');
                    } finally {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = originalText;
                    }
                });
            }
        }

        if (typeSelect && toggleWrapper) {
            // Function to handle visibility
            const updateToggleVisibility = () => {
                if (typeSelect.value === 'expense') {
                    toggleWrapper.style.display = 'flex';
                } else {
                    toggleWrapper.style.display = 'none';
                    toggleInput.checked = false;
                    this.resetClientSelection(clientSelect);
                }
            };

            typeSelect.addEventListener('change', updateToggleVisibility);

            // Initial check (in case page loads with Expense selected)
            // setTimeout to ensure DOM is ready? Just calling it safely.
            updateToggleVisibility();

            // Toggle Behavior: When ON, visual feedback on Client Field
            toggleInput.addEventListener('change', (e) => {
                if (e.target.checked) {
                    // Lock client to "Petty Cash"
                    this.createPettyCashClientOption(clientSelect);
                } else {
                    this.resetClientSelection(clientSelect);
                }
            });
        }

        // Petty Cash Module Events
        const addBtn = document.getElementById('addPettyCashEntryBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.openModal());
        }

        const form = document.getElementById('pettyCashForm');
        if (form) {
            form.addEventListener('submit', (e) => this.handleFormSubmit(e));
        }

        // Close modal handlers
        document.getElementById('closePettyCashModal')?.addEventListener('click', () => this.closeModal());
        document.getElementById('cancelPettyCash')?.addEventListener('click', () => this.closeModal());
        document.getElementById('pettyCashModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'pettyCashModal') this.closeModal();
        });
    }

    // --- Helpers for Add Entry Modal Integration ---

    createPettyCashClientOption(selectElement) {
        if (!selectElement) return;

        // Check if option exists, if not add it
        let option = Array.from(selectElement.options).find(opt => opt.value === 'Petty Cash');
        if (!option) {
            option = document.createElement('option');
            option.value = 'Petty Cash';
            option.text = 'Petty Cash';
            selectElement.add(option);
        }

        // Select it and disable interaction to enforce it
        selectElement.value = 'Petty Cash';
        // selectElement.disabled = true; // Optional: user might want to undo
    }

    resetClientSelection(selectElement) {
        if (!selectElement) return;
        selectElement.disabled = false;
        selectElement.value = ''; // Reset to default "Select Client"
    }

    /**
     * Refresh all petty cash data
     */
    async refreshData() {
        await Promise.all([
            this.loadEntries(),
            this.loadFundAllocations()
        ]);
        this.calculateBalance();
        this.updateUI();
    }

    /**
     * Load expenses (Spending from fund)
     */
    async loadEntries() {
        try {
            const { data, error } = await supabaseClient
                .from('petty_cash_entries')
                .select('*')
                .order('date', { ascending: false });

            if (error) throw error;
            this.entries = data || [];
        } catch (error) {
            console.error('Error loading petty cash entries:', error);
            showToast('Failed to load petty cash history', 'error');
        }
    }

    /**
     * Load Allocations (Money IN from Main Expenses)
     */
    async loadFundAllocations() {
        try {
            // Fetch by Flag
            const q1 = supabaseClient
                .from('finance_entries')
                .select('id, amount, date, description, client_name')
                .eq('is_petty_cash', true);

            // Fetch by Name (Legacy/Fallback)
            const q2 = supabaseClient
                .from('finance_entries')
                .select('id, amount, date, description, client_name')
                .eq('client_name', 'Petty Cash');

            const [r1, r2] = await Promise.all([q1, q2]);

            if (r1.error) throw r1.error;
            if (r2.error) throw r2.error;

            // Merge and Deduplicate by ID
            const map = new Map();
            (r1.data || []).forEach(e => map.set(e.id, e));
            (r2.data || []).forEach(e => map.set(e.id, e));

            this.fundAllocations = Array.from(map.values());
        } catch (error) {
            console.error('Error loading petty cash allocations:', error);
        }
    }

    /**
     * Calculate current available balance
     */
    calculateBalance() {
        // Total In (Allocations)
        const totalIn = this.fundAllocations.reduce((sum, item) => sum + Number(item.amount), 0);

        // Total Out (Spending)
        const totalOut = this.entries.reduce((sum, item) => sum + Number(item.amount), 0);

        this.balance = totalIn - totalOut;
    }

    /**
     * Render the UI
     */
    updateUI() {
        // Update Balance Card
        const balanceEl = document.getElementById('pettyCashBalanceDisplay');
        if (balanceEl) {
            balanceEl.textContent = formatCurrency(this.balance);
            // Visual cue for low balance?
            balanceEl.style.color = this.balance < 1000 ? 'var(--color-warning)' : 'var(--color-primary)';
        }

        // Render Table
        const tbody = document.getElementById('pettyCashBody');
        const emptyState = document.getElementById('pettyCashEmptyState');

        if (!tbody) return;

        tbody.innerHTML = '';

        if (this.entries.length === 0) {
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
            this.entries.forEach(entry => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${formatDate(entry.date)}</td>
                    <td><span class="badge badge-secondary">User</span></td> <!-- Ideally fetch user name -->
                    <td>${entry.description}</td>
                    <td><span class="badge badge-outline">${entry.category || 'General'}</span></td>
                    <td style="color: var(--color-danger); font-weight: 500;">-${formatCurrency(entry.amount)}</td>
                    <td>
                        <button class="btn-icon delete-btn" data-id="${entry.id}" title="Delete">
                             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </td>
                `;

                // Bind delete
                tr.querySelector('.delete-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteEntry(entry.id);
                });

                tbody.appendChild(tr);
            });
        }
    }

    /**
     * Open Add Expense Modal
     */
    openModal() {
        const modal = document.getElementById('pettyCashModal');
        const form = document.getElementById('pettyCashForm');
        form.reset();
        modal.classList.add('active');
    }

    closeModal() {
        const modal = document.getElementById('pettyCashModal');
        modal.classList.remove('active');
    }

    /**
     * Handle Manual Expense Addition (Spending)
     */
    async handleFormSubmit(e) {
        e.preventDefault();

        const description = document.getElementById('pcDescription').value;
        const amount = parseFloat(document.getElementById('pcAmount').value);
        const category = document.getElementById('pcCategory').value;

        // Validation: Check if balance creates negative
        if (amount > this.balance) {
            const proceed = confirm(`Warning: This amount (${formatCurrency(amount)}) exceeds current petty cash balance (${formatCurrency(this.balance)}). Proceed anyway?`);
            if (!proceed) return;
        }

        try {
            const userInfo = await dataLayer.getUserInfo(); // Helper to get ID

            const { error } = await supabaseClient
                .from('petty_cash_entries')
                .insert({
                    description,
                    amount,
                    category,
                    admin_id: userInfo.adminId,
                    user_id: userInfo.userId
                });

            if (error) throw error;

            showToast('Expense added successfully', 'success');
            this.closeModal();
            this.refreshData(); // Reload and re-calc

        } catch (error) {
            console.error('Error adding petty cash expense:', error);
            showToast('Failed to save expense', 'error');
        }
    }

    async deleteEntry(id) {
        if (!confirm('Delete this expense?')) return;

        try {
            const { error } = await supabaseClient
                .from('petty_cash_entries')
                .delete()
                .eq('id', id);

            if (error) throw error;
            showToast('Expense deleted', 'success');
            this.refreshData();
        } catch (e) {
            console.error('Delete error', e);
            showToast('Failed to delete', 'error');
        }
    }
}

// Export singleton
const pettyCashManager = new PettyCashManager();
