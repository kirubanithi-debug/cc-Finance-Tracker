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

        // NEW: Add Funds Button Logic
        const addFundBtn = document.getElementById('addPettyCashFundBtn');
        if (addFundBtn) {
            addFundBtn.addEventListener('click', () => {
                if (window.app && window.app.openEntryModal) {
                    window.app.openEntryModal();

                    // Auto-configure for Funding
                    setTimeout(() => {
                        const typeSelect = document.getElementById('entryType');
                        const toggleInput = document.getElementById('addToPettyCashToggle');
                        const descInput = document.getElementById('entryDescription');

                        if (typeSelect) {
                            typeSelect.value = 'expense';
                            typeSelect.dispatchEvent(new Event('change'));
                        }

                        // Small delay to allow toggle visibility to update
                        setTimeout(() => {
                            if (toggleInput) {
                                toggleInput.checked = true;
                                toggleInput.dispatchEvent(new Event('change'));
                            }
                        }, 50);

                        if (descInput) descInput.value = 'Petty Cash Replenishment';
                    }, 100);
                }
            });
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
            // We need to fetch entries where is_petty_cash = true OR client_name = 'Petty Cash'
            // This covers both strict toggle usage and manual naming convention
            const { data, error } = await supabaseClient
                .from('finance_entries')
                .select('amount, date, description, client_name')
                .or('is_petty_cash.eq.true,client_name.eq.Petty Cash');

            if (error) throw error;
            this.fundAllocations = data || [];
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
