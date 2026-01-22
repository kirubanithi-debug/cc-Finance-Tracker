/**
 * FinanceFlow - Main Application
 * Orchestrates all modules and handles UI interactions
 */

// Global currency symbol
window.appCurrency = '₹';

class App {
    constructor() {
        this.currentPage = 'dashboard';
        this.isAdmin = false;
        this.filters = {
            startDate: '',
            endDate: '',
            month: '',
            year: '',
            type: '',
            status: '',
            paymentMode: '',
            search: ''
        };
    }

    /**
     * Initialize the application
     */
    async init() {
        // Check Authentication using Supabase session
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            window.location.href = 'login.html';
            return;
        }

        try {
            // Initialize database
            await dataLayer.init();

            // Initialize theme
            themeManager.init();

            // Load settings
            console.log('Loading settings...');
            await this.loadSettings();

            // Initialize UI
            this.bindEvents();
            this.bindNavigation();

            // Initial data load
            console.log('Refreshing data...');
            await this.refreshData();

            // Initialize charts
            console.log('Initializing charts...');
            try {
                await chartsManager.init();
            } catch (err) {
                console.error('Charts failed to init:', err);
            }

            // Initialize invoice manager
            console.log('Initializing invoice manager...');
            try {
                await invoiceManager.init();
            } catch (err) {
                console.error('Invoice Manager init failed:', err);
            }

            // Initialize clients manager
            console.log('Initializing client manager...');
            try {
                await clientsManager.init();
            } catch (err) {
                console.error('Client Manager init failed:', err);
            }

            // Initialize profile manager
            if (window.profileManager) {
                console.log('Initializing profile manager...');
                window.profileManager.init();
            }

            // Setup role-based visibility
            console.log('Setting up role-based visibility...');
            await this.setupRoleBasedUI();

            // Subscribe to data changes
            dataLayer.subscribe(DATA_STORES.ENTRIES, () => this.onDataChange());
            dataLayer.subscribe(DATA_STORES.INVOICES, () => invoiceManager.renderInvoiceHistory());

            console.log('FinanceFlow initialized successfully');
        } catch (error) {
            console.error('FATAL: Failed to initialize app:', error);
            showToast(`Failed to initialize: ${error.message}`, 'error');
        }
    }

    /**
     * Load user settings
     */
    async loadSettings() {
        let settings = {};
        try {
            settings = await dataLayer.getAllSettings();
        } catch (e) {
            console.warn('Could not load settings, using defaults', e);
        }

        settings = settings || {};

        // Currency
        window.appCurrency = settings.currency || '₹';
        const currencySelect = document.getElementById('settingsCurrency');
        if (currencySelect) {
            currencySelect.value = window.appCurrency;
        }

        // Default tax (0 by default, user can set their own)
        const defaultTax = settings.defaultTax !== undefined ? settings.defaultTax : 0;
        const taxInput = document.getElementById('settingsDefaultTax');
        if (taxInput) {
            taxInput.value = defaultTax;
        }

        // Agency details
        if (settings.agencyName) {
            document.getElementById('settingsAgencyName').value = settings.agencyName;
        }
        if (settings.agencyContact) {
            document.getElementById('settingsAgencyContact').value = settings.agencyContact;
        }
        if (settings.agencyEmail) {
            document.getElementById('settingsAgencyEmail').value = settings.agencyEmail;
        }
        if (settings.agencyAddress) {
            document.getElementById('settingsAgencyAddress').value = settings.agencyAddress;
        }
    }

    /**
     * Bind navigation events
     */
    bindNavigation() {
        // Sidebar navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;
                if (page) {
                    this.navigateTo(page);
                }
            });
        });

        // View all links
        document.querySelectorAll('.view-all-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;
                this.navigateTo(page);
            });
        });

        // Sidebar toggle
        const sidebarToggle = document.getElementById('sidebarToggle');
        sidebarToggle.addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('collapsed');
        });

        // Mobile menu
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        const sidebarOverlay = document.getElementById('sidebarOverlay');

        mobileMenuBtn.addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            sidebar.classList.toggle('mobile-open');
            if (sidebarOverlay) {
                sidebarOverlay.classList.toggle('active');
            }
        });

        // Close mobile menu on link click
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    document.getElementById('sidebar').classList.remove('mobile-open');
                    if (sidebarOverlay) {
                        sidebarOverlay.classList.remove('active');
                    }
                }
            });
        });

        // Close mobile menu on overlay click
        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', () => {
                document.getElementById('sidebar').classList.remove('mobile-open');
                sidebarOverlay.classList.remove('active');
            });
        }

        // Close mobile menu on outside click
        document.addEventListener('click', (e) => {
            const sidebar = document.getElementById('sidebar');
            const mobileBtn = document.getElementById('mobileMenuBtn');

            if (window.innerWidth <= 768 &&
                !sidebar.contains(e.target) &&
                !mobileBtn.contains(e.target) &&
                sidebar.classList.contains('mobile-open')) {
                sidebar.classList.remove('mobile-open');
                if (sidebarOverlay) {
                    sidebarOverlay.classList.remove('active');
                }
            }
        });

        // Header avatar click - navigate to profile
        const headerAvatar = document.getElementById('headerAvatar');
        if (headerAvatar) {
            headerAvatar.addEventListener('click', () => {
                this.navigateTo('profile');
            });
        }
    }

    /**
     * Navigate to a page
     */
    navigateTo(page, addToHistory = true) {
        if (addToHistory && this.currentPage && this.currentPage !== page) {
            // Initialize history stack if needed
            if (!this.historyStack) this.historyStack = [];
            this.historyStack.push(this.currentPage);
        }

        this.currentPage = page;

        // Toggle Back Button visibility
        const backBtn = document.getElementById('globalBackBtn');
        if (backBtn) {
            if (this.historyStack && this.historyStack.length > 0) {
                backBtn.classList.remove('hidden');
                backBtn.style.display = 'flex'; // Ensure it's visible
            } else {
                backBtn.classList.add('hidden');
                backBtn.style.display = 'none';
            }
        }


        // Update active nav link
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.toggle('active', link.dataset.page === page);
        });

        // Update page title
        const titles = {
            dashboard: 'Dashboard',
            entries: 'Finance Entries',
            analytics: 'Analytics',
            invoices: 'Invoices',
            clients: 'Clients',
            employees: 'Employees',
            settings: 'Settings',
            profile: 'My Profile'
        };
        document.getElementById('pageTitle').textContent = titles[page] || 'Dashboard';

        // Render pending approvals if on entries page and is admin
        if (page === 'entries' && this.isAdmin) {
            this.renderPendingApprovals();
        }

        // Show active page
        document.querySelectorAll('.page').forEach(p => {
            p.classList.remove('active');
        });

        const targetPage = document.getElementById(`${page}Page`);
        if (targetPage) {
            targetPage.classList.add('active');
        }

        // Refresh charts if navigating to analytics
        if (page === 'analytics' || page === 'dashboard') {
            chartsManager.updateAllCharts();
        }

        // Load profile if navigating to profile
        if (page === 'profile' && window.profileManager) {
            window.profileManager.renderProfilePage();
        }
    }

    /**
     * Go back to previous page
     */
    goBack() {
        if (this.historyStack && this.historyStack.length > 0) {
            const prevPage = this.historyStack.pop();
            this.navigateTo(prevPage, false); // Don't add to history when going back
        }
    }

    /**
     * Bind UI events
     */
    bindEvents() {
        // Global Back Button
        document.getElementById('globalBackBtn')?.addEventListener('click', () => {
            this.goBack();
        });

        // Logout
        document.getElementById('logoutBtn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            await supabaseClient.auth.signOut();
            localStorage.removeItem('user');
            window.location.href = 'login.html';
        });

        // Entry modal
        const entryModal = document.getElementById('entryModal');
        const addEntryBtn = document.getElementById('addEntryBtn');
        const closeModal = document.getElementById('closeModal');
        const cancelEntry = document.getElementById('cancelEntry');
        const entryForm = document.getElementById('entryForm');

        addEntryBtn.addEventListener('click', () => this.openEntryModal());
        closeModal.addEventListener('click', () => this.closeEntryModal());
        cancelEntry.addEventListener('click', () => this.closeEntryModal());

        entryModal.addEventListener('click', (e) => {
            if (e.target === entryModal) this.closeEntryModal();
        });

        entryForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveEntry();
        });

        // Entry type change - hide status for expenses
        document.getElementById('entryType').addEventListener('change', (e) => {
            this.toggleStatusField(e.target.value);
        });

        // Filters
        document.getElementById('filterStartDate').addEventListener('change', (e) => {
            this.filters.startDate = e.target.value;
            this.applyFilters();
        });

        document.getElementById('filterEndDate').addEventListener('change', (e) => {
            this.filters.endDate = e.target.value;
            this.applyFilters();
        });

        document.getElementById('filterMonth').addEventListener('change', (e) => {
            this.filters.month = e.target.value;
            this.applyFilters();
        });

        document.getElementById('filterYear').addEventListener('change', (e) => {
            this.filters.year = e.target.value;
            this.applyFilters();
        });

        document.getElementById('filterType').addEventListener('change', (e) => {
            this.filters.type = e.target.value;
            this.applyFilters();
        });

        document.getElementById('filterStatus').addEventListener('change', (e) => {
            this.filters.status = e.target.value;
            this.applyFilters();
        });

        document.getElementById('filterPaymentMode').addEventListener('change', (e) => {
            this.filters.paymentMode = e.target.value;
            this.applyFilters();
        });

        document.getElementById('clearFilters').addEventListener('click', () => this.clearFilters());

        // Global search
        document.getElementById('globalSearch').addEventListener('input', (e) => {
            this.filters.search = e.target.value;
            this.applyFilters();
        });

        // Year selectors for charts
        document.getElementById('dashboardYearSelect').addEventListener('change', (e) => {
            chartsManager.onYearChange(e.target.value, 'dashboard');
        });

        document.getElementById('analyticsYearSelect').addEventListener('change', (e) => {
            chartsManager.onYearChange(e.target.value, 'analytics');
        });

        // Settings
        this.bindSettingsEvents();
    }

    /**
     * Bind settings page events
     */
    bindSettingsEvents() {
        // Currency change
        document.getElementById('settingsCurrency').addEventListener('change', async (e) => {
            window.appCurrency = e.target.value;
            await dataLayer.setSetting('currency', e.target.value);
            await this.refreshData();
            showToast('Currency updated', 'success');
        });

        // Default tax change
        document.getElementById('settingsDefaultTax').addEventListener('change', async (e) => {
            await dataLayer.setSetting('defaultTax', e.target.value);
            showToast('Default tax rate updated', 'success');
        });

        // Save agency details
        document.getElementById('saveAgencySettings').addEventListener('click', async () => {
            await dataLayer.setSetting('agencyName', document.getElementById('settingsAgencyName').value);
            await dataLayer.setSetting('agencyContact', document.getElementById('settingsAgencyContact').value);
            await dataLayer.setSetting('agencyEmail', document.getElementById('settingsAgencyEmail').value);
            await dataLayer.setSetting('agencyAddress', document.getElementById('settingsAgencyAddress').value);
            showToast('Agency details saved', 'success');
        });

        // Export data
        document.getElementById('exportDataBtn').addEventListener('click', async () => {
            const data = await dataLayer.exportData();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `financeflow_backup_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Data exported successfully', 'success');
        });

        // Import data
        const importInput = document.getElementById('importDataInput');
        document.getElementById('importDataBtn').addEventListener('click', () => importInput.click());

        importInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);
                await dataLayer.importData(data);
                await this.refreshData();
                await chartsManager.updateAllCharts();
                await invoiceManager.renderInvoiceHistory();
                showToast('Data imported successfully', 'success');
            } catch (error) {
                console.error('Import error:', error);
                showToast('Failed to import data', 'error');
            }

            importInput.value = '';
        });

        // Clear data
        document.getElementById('clearDataBtn').addEventListener('click', async () => {
            if (!confirm('Are you sure you want to delete all data? This cannot be undone.')) return;

            await dataLayer.clearAll();
            await this.refreshData();
            await chartsManager.updateAllCharts();
            await invoiceManager.renderInvoiceHistory();
            showToast('All data cleared', 'success');
        });
    }

    /**
     * Open entry modal for adding/editing
     */
    async openEntryModal(entry = null) {
        const modal = document.getElementById('entryModal');
        const title = document.getElementById('modalTitle');
        const form = document.getElementById('entryForm');

        // Refresh client dropdowns
        await clientsManager.populateClientDropdowns();

        form.reset();

        if (entry) {
            title.textContent = 'Edit Finance Entry';
            document.getElementById('entryId').value = entry.id;
            document.getElementById('entryDate').value = entry.date;
            document.getElementById('entryClient').value = entry.clientName;
            document.getElementById('entryDescription').value = entry.description || '';
            document.getElementById('entryAmount').value = entry.amount;
            document.getElementById('entryType').value = entry.type;
            document.getElementById('entryStatus').value = entry.status;
            document.getElementById('entryPaymentMode').value = entry.paymentMode;
            // Toggle status field based on saved entry type
            this.toggleStatusField(entry.type);
        } else {
            title.textContent = 'Add Finance Entry';
            document.getElementById('entryId').value = '';
            document.getElementById('entryDate').value = new Date().toISOString().split('T')[0];
            // Default to income, show status field
            this.toggleStatusField('income');
        }

        modal.classList.add('active');
    }

    /**
     * Toggle status field visibility based on entry type
     * Hide status for expenses (expenses are always considered paid/received)
     */
    toggleStatusField(type) {
        const statusGroup = document.getElementById('statusFormGroup');
        const statusSelect = document.getElementById('entryStatus');

        if (type === 'expense') {
            // Hide status field for expenses
            statusGroup.style.display = 'none';
            statusSelect.removeAttribute('required');
            // Set status to 'received' for expenses (already paid)
            statusSelect.value = 'received';
        } else {
            // Show status field for income
            statusGroup.style.display = 'block';
            statusSelect.setAttribute('required', 'required');
        }
    }

    /**
     * Close entry modal
     */
    closeEntryModal() {
        document.getElementById('entryModal').classList.remove('active');
    }

    /**
     * Save entry (add or update)
     */
    async saveEntry() {
        const id = document.getElementById('entryId').value;
        const entry = {
            date: document.getElementById('entryDate').value,
            clientName: document.getElementById('entryClient').value,
            description: document.getElementById('entryDescription').value,
            amount: parseFloat(document.getElementById('entryAmount').value),
            type: document.getElementById('entryType').value,
            status: document.getElementById('entryStatus').value,
            paymentMode: document.getElementById('entryPaymentMode').value
        };

        try {
            if (id) {
                await dataLayer.updateEntry(parseInt(id), entry);
                showToast('Entry updated successfully', 'success');
            } else {
                await dataLayer.addEntry(entry);
                showToast('Entry added successfully', 'success');
            }

            this.closeEntryModal();
        } catch (error) {
            console.error('Error saving entry:', error);
            showToast('Failed to save entry', 'error');
        }
    }

    /**
     * Delete an entry
     */
    async deleteEntry(id) {
        if (!confirm('Are you sure you want to delete this entry?')) return;

        try {
            await dataLayer.deleteEntry(id);
            showToast('Entry deleted', 'success');
        } catch (error) {
            console.error('Error deleting entry:', error);
            showToast('Failed to delete entry', 'error');
        }
    }

    /**
     * Apply current filters
     */
    async applyFilters() {
        await this.renderEntriesTable();
    }

    /**
     * Clear all filters
     */
    async clearFilters() {
        this.filters = {
            startDate: '',
            endDate: '',
            month: '',
            year: '',
            type: '',
            status: '',
            paymentMode: '',
            search: ''
        };

        document.getElementById('filterStartDate').value = '';
        document.getElementById('filterEndDate').value = '';
        document.getElementById('filterMonth').value = '';
        document.getElementById('filterYear').value = '';
        document.getElementById('filterType').value = '';
        document.getElementById('filterStatus').value = '';
        document.getElementById('filterPaymentMode').value = '';
        document.getElementById('globalSearch').value = '';

        await this.renderEntriesTable();
    }

    /**
     * Handle data changes
     */
    async onDataChange() {
        await this.refreshData();
        await chartsManager.updateAllCharts();
    }

    /**
     * Refresh all data
     */
    async refreshData() {
        await this.updateStats();
        await this.renderRecentTransactions();
        await this.renderEntriesTable();
        if (this.isAdmin) {
            await this.renderPendingApprovals();
        }
    }

    /**
     * Update dashboard stats
     */
    async updateStats() {
        const summary = await dataLayer.getFinancialSummary();
        const currency = window.appCurrency;

        document.getElementById('totalIncome').textContent = formatCurrency(summary.totalIncome, currency);
        document.getElementById('totalExpense').textContent = formatCurrency(summary.totalExpense, currency);
        document.getElementById('pendingAmount').textContent = formatCurrency(summary.pendingAmount, currency);
        document.getElementById('netBalance').textContent = formatCurrency(summary.netBalance, currency);
    }

    /**
     * Render recent transactions on dashboard
     */
    async renderRecentTransactions() {
        const entries = await dataLayer.getAllEntries();
        const recent = entries.slice(0, 5);
        const tbody = document.getElementById('recentTransactions');
        const currency = window.appCurrency;

        if (recent.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 2rem; color: var(--color-text-muted);">
                        No transactions yet
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = recent.map(entry => `
            <tr>
                <td>${formatDate(entry.date)}</td>
                <td>${entry.clientName}</td>
                <td>${entry.description || '-'}</td>
                <td style="font-weight: 600; color: ${entry.type === 'income' ? 'var(--color-success)' : 'var(--color-danger)'}">
                    ${entry.type === 'income' ? '+' : '-'}${formatCurrency(entry.amount, currency)}
                </td>
                <td><span class="badge badge-${entry.type}">${entry.type}</span></td>
                <td><span class="badge badge-${entry.status}">${entry.status}</span></td>
            </tr>
        `).join('');
    }

    /**
     * Render entries table on Finance Entries page
     */
    async renderEntriesTable() {
        const entries = await dataLayer.getFilteredEntries(this.filters);
        const tbody = document.getElementById('financeEntriesBody');
        const emptyState = document.getElementById('entriesEmptyState');
        const currency = window.appCurrency;

        if (entries.length === 0) {
            tbody.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        tbody.innerHTML = entries.map(entry => `
            <tr>
                <td>${formatDate(entry.date)}</td>
                <td>${entry.clientName}</td>
                <td>${entry.description || '-'}</td>
                <td style="font-weight: 600; color: ${entry.type === 'income' ? 'var(--color-success)' : 'var(--color-danger)'}">
                    ${entry.type === 'income' ? '+' : '-'}${formatCurrency(entry.amount, currency)}
                </td>
                <td><span class="badge badge-${entry.type}">${entry.type}</span></td>
                <td><span class="badge badge-${entry.status}">${entry.status}</span></td>
                <td>${formatPaymentMode(entry.paymentMode)}</td>
                <td>${entry.createdByName || '-'}</td>
                <td>
                    <span class="badge ${entry.approvalStatus === 'approved' ? 'badge-success' : (entry.approvalStatus === 'declined' ? 'badge-danger' : 'badge-warning')}">
                        ${formatStatus(entry.approvalStatus || 'pending')}
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="action-btn edit" data-id="${entry.id}" title="Edit">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="action-btn delete" data-id="${entry.id}" title="Delete">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        // Bind edit/delete buttons
        tbody.querySelectorAll('.action-btn.edit').forEach(btn => {
            btn.addEventListener('click', async () => {
                const entry = await dataLayer.getEntry(parseInt(btn.dataset.id));
                this.openEntryModal(entry);
            });
        });

        tbody.querySelectorAll('.action-btn.delete').forEach(btn => {
            btn.addEventListener('click', () => {
                this.deleteEntry(parseInt(btn.dataset.id));
            });
        });
    }

    /**
     * Setup role-based UI visibility
     */
    async setupRoleBasedUI() {
        try {
            this.isAdmin = await dataLayer.isAdmin();

            // Store role in localStorage for quick access
            localStorage.setItem('userRole', this.isAdmin ? 'admin' : 'employee');

            // Show/hide admin-only elements
            document.querySelectorAll('.admin-only').forEach(el => {
                // Force double check
                el.style.display = this.isAdmin ? '' : 'none';
            });

            // Update profile badge to show role
            const roleBadge = document.querySelector('.profile-badges .badge-primary');
            if (roleBadge) {
                roleBadge.textContent = this.isAdmin ? 'Admin' : 'Employee';
            }

            console.log(`User role: ${this.isAdmin ? 'Admin' : 'Employee'}`);
        } catch (error) {
            console.error('Error setting up role-based UI:', error);
            // Default to hidden for security
            this.isAdmin = false;
        }
    }

    /**
     * Render pending approvals section (admin only)
     */
    async renderPendingApprovals() {
        if (!this.isAdmin) return;

        const container = document.getElementById('pendingEntriesList');
        const countBadge = document.getElementById('pendingCount');
        const section = document.getElementById('pendingApprovalsSection');
        const currency = window.appCurrency;

        if (!container || !section) return;

        try {
            const pendingEntries = await dataLayer.getPendingEntries();

            // Update count badge
            if (countBadge) {
                countBadge.textContent = pendingEntries.length;
            }

            // Hide section if no pending entries
            if (pendingEntries.length === 0) {
                section.style.display = 'none';
                return;
            }

            section.style.display = 'block';

            container.innerHTML = pendingEntries.map(entry => `
                <div class="pending-entry-card" data-id="${entry.id}">
                    <div class="pending-entry-info">
                        <span>
                            <small>Date</small>
                            <strong>${formatDate(entry.date)}</strong>
                        </span>
                        <span>
                            <small>Client</small>
                            <strong>${entry.clientName}</strong>
                        </span>
                        <span>
                            <small>Amount</small>
                            <strong style="color: ${entry.type === 'income' ? 'var(--color-success)' : 'var(--color-danger)'}">
                                ${entry.type === 'income' ? '+' : '-'}${formatCurrency(entry.amount, currency)}
                            </strong>
                        </span>
                        <span>
                            <small>Created By</small>
                            <strong>${entry.createdByName || 'Unknown'}</strong>
                        </span>
                        <span>
                            <small>Description</small>
                            <strong>${entry.description || '-'}</strong>
                        </span>
                    </div>
                    <div class="pending-entry-actions">
                        <button class="btn-approve" data-id="${entry.id}" title="Approve">
                            ✓ Approve
                        </button>
                        <button class="btn-decline" data-id="${entry.id}" title="Decline">
                            ✕ Decline
                        </button>
                    </div>
                </div>
            `).join('');

            // Bind approve/decline buttons
            container.querySelectorAll('.btn-approve').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    try {
                        await dataLayer.approveEntry(id);
                        showToast('Entry approved successfully', 'success');
                        await this.renderPendingApprovals();
                        await this.refreshData();
                    } catch (error) {
                        console.error('Error approving entry:', error);
                        showToast('Failed to approve entry', 'error');
                    }
                });
            });

            container.querySelectorAll('.btn-decline').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    if (!confirm('Are you sure you want to decline this entry?')) return;
                    try {
                        await dataLayer.declineEntry(id);
                        showToast('Entry declined', 'info');
                        await this.renderPendingApprovals();
                    } catch (error) {
                        console.error('Error declining entry:', error);
                        showToast('Failed to decline entry', 'error');
                    }
                });
            });
        } catch (error) {
            console.error('Error rendering pending approvals:', error);
        }
    }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-message">${message}</span>
        <button class="toast-close" aria-label="Close">×</button>
    `;

    container.appendChild(toast);

    // Close button
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.remove();
    });

    // Auto remove after 4 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }
    }, 4000);
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});
