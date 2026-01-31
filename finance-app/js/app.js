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

        this.dashboardFilters = {
            startDate: '',
            endDate: '',
            month: '',
            year: ''
        };

        this.historyStack = [];
    }

    /**
     * Show custom confirmation modal
     * @param {string} title 
     * @param {string} message 
     * @returns {Promise<boolean>}
     */
    showConfirmationModal(title, message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmationModal');
            const titleEl = document.getElementById('confirmTitle');
            const messageEl = document.getElementById('confirmMessage');
            const confirmBtn = document.getElementById('confirmYesBtn');
            const cancelBtn = document.getElementById('confirmCancelBtn');
            const closeBtn = document.getElementById('closeConfirmModal');

            if (!modal) {
                // Fallback if modal not present
                resolve(window.confirm(message));
                return;
            }

            titleEl.textContent = title || 'Confirm Action';
            messageEl.textContent = message || 'Are you sure you want to proceed?';

            const cleanup = () => {
                modal.classList.remove('active');
                confirmBtn.removeEventListener('click', onConfirm);
                cancelBtn.removeEventListener('click', onCancel);
                closeBtn.removeEventListener('click', onCancel);
            };

            const onConfirm = () => {
                cleanup();
                resolve(true);
            };

            const onCancel = () => {
                cleanup();
                resolve(false);
            };

            confirmBtn.addEventListener('click', onConfirm);
            cancelBtn.addEventListener('click', onCancel);
            closeBtn.addEventListener('click', onCancel);

            modal.classList.add('active');
        });
    }

    /**
     * Initialize the application
     */
    async init() {
        const loadingOverlay = document.getElementById('globalLoadingOverlay');

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
            this.populateYearDropdowns();
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

            // Initialize investments manager
            if (window.investmentsManager) {
                console.log('Initializing investments manager...');
                window.investmentsManager.init();
            }

            // Initialize notifications manager
            if (window.notificationsManager) {
                console.log('Initializing notifications manager...');
                window.notificationsManager.init();
            }

            // Initialize Petty Cash Manager
            if (window.pettyCashManager) {
                console.log('Initializing petty cash manager...');
                window.pettyCashManager.init();
            }

            // Setup Realtime tracking for instant updates
            dataLayer.setupRealtime();

            // Setup role-based visibility
            console.log('Setting up role-based visibility...');
            await this.setupRoleBasedUI();

            // Subscribe to data changes
            dataLayer.subscribe(DATA_STORES.ENTRIES, () => this.onDataChange());
            dataLayer.subscribe(DATA_STORES.INVOICES, () => invoiceManager.renderInvoiceHistory());

            console.log('FinanceFlow initialized successfully');

            // Hide loading overlay with animation
            if (loadingOverlay) {
                loadingOverlay.classList.add('hidden');
                setTimeout(() => {
                    loadingOverlay.style.display = 'none';
                }, 300);
            }
        } catch (error) {
            console.error('FATAL: Failed to initialize app:', error);
            showToast(`Failed to initialize: ${error.message}`, 'error');

            // Hide loading overlay even on error
            if (loadingOverlay) {
                loadingOverlay.classList.add('hidden');
                setTimeout(() => {
                    loadingOverlay.style.display = 'none';
                }, 300);
            }
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

        // Agency details (only visible to admin, but load for all - used in invoices)
        const agencyNameEl = document.getElementById('settingsAgencyName');
        const agencyContactEl = document.getElementById('settingsAgencyContact');
        const agencyEmailEl = document.getElementById('settingsAgencyEmail');
        const agencyAddressEl = document.getElementById('settingsAgencyAddress');

        if (agencyNameEl && settings.agencyName) {
            agencyNameEl.value = settings.agencyName;
        }
        if (agencyContactEl && settings.agencyContact) {
            agencyContactEl.value = settings.agencyContact;
        }
        if (agencyEmailEl && settings.agencyEmail) {
            agencyEmailEl.value = settings.agencyEmail;
        }
        if (agencyAddressEl && settings.agencyAddress) {
            agencyAddressEl.value = settings.agencyAddress;
        }
    }

    /**
     * Populate Year Dropdowns (2024 to 2050)
     */
    populateYearDropdowns() {
        const yearSelectIds = [
            'dashFilterYear',
            'filterYear',
            'analyticsYearSelect',
            'growthYearSelect'
        ];

        const startYear = 2024;
        const endYear = 2050; // Future proofing
        const currentYear = new Date().getFullYear();

        yearSelectIds.forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;

            // Keep only the first option ("All Years" or placeholder)
            // Assuming first option is value="" or similar descriptive text
            // We want to preserve specific "All Years" option if it exists
            const hasAllOption = select.options.length > 0 && select.options[0].value === "";
            let initialHTML = hasAllOption ? select.options[0].outerHTML : '';

            // If it's a chart selector that doesn't have "All Years" usually, simply clearing is fine
            // But let's rebuild clean options

            let optionsHTML = initialHTML;
            for (let y = startYear; y <= endYear; y++) {
                optionsHTML += `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`;
            }
            select.innerHTML = optionsHTML;
        });
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
            const isOpen = sidebar.classList.contains('mobile-open');
            sidebar.classList.toggle('mobile-open');
            if (sidebarOverlay) {
                // Toggle the active class - CSS handles visibility via opacity/pointer-events
                sidebarOverlay.classList.toggle('active', !isOpen);
            }
        });

        // Close mobile menu on link click
        // Close menu on link click (Any screen size now since it's an overlay)
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                // if (window.innerWidth <= 768) { // Always close on navigation
                document.getElementById('sidebar').classList.remove('mobile-open');
                if (sidebarOverlay) {
                    sidebarOverlay.classList.remove('active');
                }
                // }
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

            // Apply to Desktop too (remove window.innerWidth check)
            if (sidebar.classList.contains('mobile-open') &&
                !sidebar.contains(e.target) &&
                !mobileBtn.contains(e.target)) {

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

        // Bug #5: Swipe Gestures for Mobile Menu
        let touchStartX = 0;
        let touchEndX = 0;

        document.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        document.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            this.handleSwipeGesture();
        }, { passive: true });
    }

    /**
     * Handle swipe gestures
     */
    handleSwipeGesture() {
        // Only on mobile
        if (window.innerWidth > 768) return;

        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        const swipeThreshold = 50; // min distance
        const leftEdgeThreshold = 30; // only swipe from left edge to open

        // Swipe Right (Open Menu)
        if (touchEndX > touchStartX + swipeThreshold) {
            // Only allow opening if starting from the left edge
            if (touchStartX < leftEdgeThreshold) {
                sidebar.classList.add('mobile-open');
                if (overlay) overlay.classList.add('active');
            }
        }

        // Swipe Left (Close Menu)
        if (touchStartX > touchEndX + swipeThreshold) {
            sidebar.classList.remove('mobile-open');
            if (overlay) overlay.classList.remove('active');
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
        const backBtnContainer = document.getElementById('globalBackBtnContainer');
        if (backBtnContainer) {
            if (this.historyStack && this.historyStack.length > 0) {
                backBtnContainer.classList.remove('hidden');
            } else {
                backBtnContainer.classList.add('hidden');
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
            employees: 'Employees',
            settings: 'Settings',
            profile: 'My Profile',
            investments: 'Investments',
            notifications: 'Notifications'
        };
        document.getElementById('pageTitle').textContent = titles[page] || 'Dashboard';

        // Load notifications if navigating to notifications page
        if (page === 'notifications' && window.notificationsManager) {
            window.notificationsManager.loadNotifications();
        }

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

        addEntryBtn.addEventListener('click', () => {
            this.openEntryModal();
            // Reset toggle visibility on open
            const typeSelect = document.getElementById('entryType');
            const toggleWrapper = document.getElementById('pettyCashToggleWrapper');
            if (typeSelect && toggleWrapper) {
                toggleWrapper.style.display = typeSelect.value === 'expense' ? 'flex' : 'none';
            }
        });

        // Ensure Petty Cash Toggle overrides
        const typeSelect = document.getElementById('entryType');
        const toggleWrapper = document.getElementById('pettyCashToggleWrapper');
        if (typeSelect && toggleWrapper) {
            typeSelect.addEventListener('change', () => {
                toggleWrapper.style.display = typeSelect.value === 'expense' ? 'flex' : 'none';
            });
        }

        // Auto-select "Petty Cash" client when toggle is ON
        const toggleInput = document.getElementById('addToPettyCashToggle');
        const clientSelect = document.getElementById('entryClient');
        if (toggleInput && clientSelect) {
            toggleInput.addEventListener('change', (e) => {
                if (e.target.checked) {
                    // Check availability
                    let option = Array.from(clientSelect.options).find(opt => opt.value === 'Petty Cash');
                    if (!option) {
                        option = document.createElement('option');
                        option.value = 'Petty Cash';
                        option.text = 'Petty Cash';
                        clientSelect.add(option);
                    }
                    clientSelect.value = 'Petty Cash';
                } else {
                    clientSelect.value = ''; // Reset
                }
            });
        }
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

        document.getElementById('globalSearch').addEventListener('input', (e) => {
            this.filters.search = e.target.value;
            this.applyFilters();
        });

        // Dashboard Filters
        document.getElementById('dashStartDate')?.addEventListener('change', (e) => {
            this.dashboardFilters.startDate = e.target.value;
            this.updateStats();
        });

        document.getElementById('dashEndDate')?.addEventListener('change', (e) => {
            this.dashboardFilters.endDate = e.target.value;
            this.updateStats();
        });

        document.getElementById('dashFilterMonth')?.addEventListener('change', (e) => {
            this.dashboardFilters.month = e.target.value;
            this.updateStats();
        });

        document.getElementById('dashFilterYear')?.addEventListener('change', (e) => {
            this.dashboardFilters.year = e.target.value;
            this.updateStats();
        });

        document.getElementById('dashClearFilters')?.addEventListener('click', () => {
            this.clearDashboardFilters();
        });
        // Year selectors for charts
        // Dashboard year select removed per request

        document.getElementById('analyticsYearSelect')?.addEventListener('change', (e) => {
            chartsManager.onYearChange(e.target.value, 'analytics');
        });

        // Settings
        this.bindSettingsEvents();
    }

    /**
     * Clear dashboard filters
     */
    async clearDashboardFilters() {
        this.dashboardFilters = {
            startDate: '',
            endDate: '',
            month: '',
            year: ''
        };

        const inputs = ['dashStartDate', 'dashEndDate', 'dashFilterMonth', 'dashFilterYear'];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        await this.updateStats();
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
        const saveAgencyBtn = document.getElementById('saveAgencySettings');
        if (saveAgencyBtn) {
            saveAgencyBtn.addEventListener('click', async (e) => {
                // Prevent default if inside form
                e.preventDefault();

                const originalText = saveAgencyBtn.innerHTML;
                saveAgencyBtn.disabled = true;
                saveAgencyBtn.innerHTML = '<span class="spinner-small"></span> Saving...';

                try {
                    await dataLayer.setSetting('agencyName', document.getElementById('settingsAgencyName').value);
                    await dataLayer.setSetting('agencyContact', document.getElementById('settingsAgencyContact').value);
                    await dataLayer.setSetting('agencyEmail', document.getElementById('settingsAgencyEmail').value);
                    await dataLayer.setSetting('agencyAddress', document.getElementById('settingsAgencyAddress').value);

                    showToast('Agency details saved successfully', 'success');
                } catch (error) {
                    console.error('Failed to save settings:', error);
                    showToast('Failed to save settings. Please try again.', 'error');
                } finally {
                    saveAgencyBtn.disabled = false;
                    saveAgencyBtn.innerHTML = originalText;
                }
            });
        }

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
        const loginNameInput = document.getElementById('entryLoginName');

        // Refresh client dropdowns
        await clientsManager.populateClientDropdowns();

        form.reset();

        // Get user's name from profile (priority) or fallback to localStorage
        let userName = '';
        let isFromProfile = false;

        if (window.profileManager && window.profileManager.currentUser &&
            window.profileManager.currentUser.name &&
            window.profileManager.currentUser.name !== 'User') {
            userName = window.profileManager.currentUser.name;
            isFromProfile = true;
        } else {
            // Fallback to localStorage saved name
            userName = localStorage.getItem('lastLoginName') || '';
        }

        // Set the login name field
        loginNameInput.value = userName;

        // If name comes from profile, make field read-only
        if (isFromProfile) {
            loginNameInput.readOnly = true;
            loginNameInput.style.opacity = '0.7';
            loginNameInput.style.cursor = 'not-allowed';
            loginNameInput.title = 'Name from your profile';
        } else {
            loginNameInput.readOnly = false;
            loginNameInput.style.opacity = '1';
            loginNameInput.style.cursor = 'text';
            loginNameInput.title = '';
        }

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
        let loginName = '';

        // Prioritize name from Profile Manager if available
        if (window.profileManager && window.profileManager.currentUser && window.profileManager.currentUser.name && window.profileManager.currentUser.name !== 'User') {
            loginName = window.profileManager.currentUser.name;
        } else {
            // Fallback to manual input
            loginName = document.getElementById('entryLoginName').value.trim();
        }

        if (!loginName) {
            showToast('Please enter your name', 'error');
            return;
        }

        // Save name for next time (even if from profile, good to cache)
        localStorage.setItem('lastLoginName', loginName);

        // Determine Role Label
        const role = await dataLayer.getCurrentUserRole();
        const roleLabel = role === 'admin' ? 'Admin' : 'Employee';
        const formattedCreatedBy = `${roleLabel} - ${loginName}`;

        const entry = {
            date: document.getElementById('entryDate').value,
            client: document.getElementById('entryClient').value, // Fixed key: client (not clientName)
            description: document.getElementById('entryDescription').value,
            amount: parseFloat(document.getElementById('entryAmount').value),
            type: document.getElementById('entryType').value,
            status: document.getElementById('entryStatus')?.value || 'pending', // Handle if hidden
            paymentMode: document.getElementById('entryPaymentMode').value,
            created_by_name: formattedCreatedBy
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
            showToast('Failed to save: ' + (error.message || 'Unknown error'), 'error');
        }
    }

    /**
     * Delete an entry
     */
    async deleteEntry(id) {
        if (!(await this.showConfirmationModal('Delete Entry', 'Are you sure you want to delete this entry?'))) return;

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
        // Use dashboard filters if available, otherwise default to empty
        const filters = this.dashboardFilters || {};

        // Pass filters to data layer
        const summary = await dataLayer.getFinancialSummary(filters);
        const currency = window.appCurrency;

        document.getElementById('totalIncome').textContent = formatCurrency(summary.totalIncome, currency);
        document.getElementById('totalExpense').textContent = formatCurrency(summary.totalExpense, currency);
        document.getElementById('pendingAmount').textContent = formatCurrency(summary.pendingAmount, currency);
        document.getElementById('netBalance').textContent = formatCurrency(summary.netBalance, currency);

        const availableEl = document.getElementById('availableBalance');
        if (availableEl) {
            availableEl.textContent = formatCurrency(summary.availableBalance, currency);
        }
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
                <td>${entry.createdByName || '-'}</td>
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

            // 1. Show/Hide Admin-Only elements (General)
            document.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = this.isAdmin ? '' : 'none';
            });

            // 2. Hide Dashboard and Analytics for Employees
            // 3. Redirect if they are on those pages
            if (!this.isAdmin) {
                // Hide Nav Items
                const dashboardNav = document.querySelector('a[data-page="dashboard"]')?.parentElement;
                const analyticsNav = document.querySelector('a[data-page="analytics"]')?.parentElement;

                if (dashboardNav) dashboardNav.style.display = 'none';
                if (analyticsNav) analyticsNav.style.display = 'none';

                // Handle Agency Details for Employees (Visible but Read-Only)
                const agencySection = document.getElementById('agencyDetailsSection');
                if (agencySection) {
                    // Start by showing it (in case it was hidden by generic rules previously)
                    agencySection.style.display = 'block';

                    // Make inputs read-only
                    agencySection.querySelectorAll('input, textarea').forEach(input => {
                        input.disabled = true;
                        input.style.backgroundColor = 'var(--color-bg-secondary)'; // Visual clue
                        input.style.cursor = 'not-allowed';
                    });

                    // Hide Save Button
                    const saveBtn = agencySection.querySelector('#saveAgencySettings');
                    if (saveBtn) saveBtn.style.display = 'none';
                }

                // Redirect to Entries if currently on restricted page OR default home page (dashboard)
                if (this.currentPage === 'dashboard' || this.currentPage === 'analytics') {
                    console.log('Employee detected on restricted page, redirecting to Entries...');
                    this.navigateTo('entries');
                }
            } else {
                // Admin: Ensure Agency Details are editable
                const agencySection = document.getElementById('agencyDetailsSection');
                if (agencySection) {
                    agencySection.querySelectorAll('input, textarea').forEach(input => {
                        input.disabled = false;
                        input.style.backgroundColor = '';
                        input.style.cursor = '';
                    });
                    const saveBtn = agencySection.querySelector('#saveAgencySettings');
                    if (saveBtn) saveBtn.style.display = '';
                }

                // Check if we need to show nav items (in case role changed dynamically without reload)
                const dashboardNav = document.querySelector('a[data-page="dashboard"]')?.parentElement;
                const analyticsNav = document.querySelector('a[data-page="analytics"]')?.parentElement;
                if (dashboardNav) dashboardNav.style.display = '';
                if (analyticsNav) analyticsNav.style.display = '';
            }

            // Update profile badge to show role
            const roleBadge = document.querySelector('.profile-badges .badge-primary');
            if (roleBadge) {
                roleBadge.textContent = this.isAdmin ? 'Admin' : 'Employee';
            }

            console.log(`User role: ${this.isAdmin ? 'Admin' : 'Employee'}`);
        } catch (error) {
            console.error('Error setting up role-based UI:', error);
            // Default to minimal access on error
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

            if (countBadge) {
                countBadge.textContent = pendingEntries.length;
            }

            if (pendingEntries.length === 0) {
                section.style.display = 'none';
                return;
            }

            section.style.display = 'block';

            container.innerHTML = pendingEntries.map(entry => {
                const isDeletion = entry.deletionRequested;

                return `
                <div class="pending-entry-card" data-id="${entry.id}" style="${isDeletion ? 'border: 1px solid var(--color-danger); background: rgba(239, 68, 68, 0.05);' : ''}">
                    <div class="pending-entry-info">
                        ${isDeletion ? '<div style="color: var(--color-danger); font-weight: bold; margin-bottom: 5px; font-size: 0.8rem;">⚠️ DELETION REQUESTED</div>' : ''}
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
                            <small>By</small>
                            <strong>${entry.createdByName || 'Unknown'}</strong>
                        </span>
                        <div class="pending-entry-description" style="grid-column: span 2; margin-top: 5px;">
                            <small style="display: block; font-size: 0.75rem; color: var(--color-text-muted);">Description</small>
                            <div style="font-size: 0.85rem; color: var(--color-text-secondary); line-height: 1.4; max-height: 50px; overflow-y: auto;">
                                ${entry.description || '<span style="color: var(--color-text-muted); font-style: italic;">No description provided</span>'}
                            </div>
                        </div>
                    </div>
                    <div class="pending-entry-actions">
                        <button class="btn-view" data-id="${entry.id}" title="View Details">
                            👁 View
                        </button>
                        <button class="btn-approve" data-id="${entry.id}" data-type="${isDeletion ? 'delete' : 'approve'}" 
                                title="${isDeletion ? 'Confirm Delete' : 'Approve'}" 
                                style="${isDeletion ? 'background-color: var(--color-danger); color: white;' : ''}">
                            ${isDeletion ? '🗑 Confirm' : '✓ Approve'}
                        </button>
                        <button class="btn-decline" data-id="${entry.id}" data-type="${isDeletion ? 'cancel' : 'decline'}" 
                                title="${isDeletion ? 'Cancel Request' : 'Decline'}">
                             ${isDeletion ? '✕ Cancel' : '✕ Decline'}
                        </button>
                    </div>
                </div>
            `;
            }).join('');

            // Bind approve/confirm buttons
            container.querySelectorAll('.btn-approve').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    const type = btn.dataset.type;
                    try {
                        if (type === 'delete') {
                            if (!confirm('Confirm deletion of this entry? This cannot be undone.')) return;
                            await dataLayer.deleteEntry(id); // Admin delete = actual delete
                            showToast('Entry deleted successfully', 'success');
                        } else {
                            await dataLayer.approveEntry(id);
                            showToast('Entry approved successfully', 'success');
                        }
                        await this.refreshData();
                        // Also remove from local list for immediate visual update
                        btn.closest('.pending-entry-card')?.remove();
                        if (container.children.length === 0) {
                            section.style.display = 'none';
                        }
                    } catch (error) {
                        console.error('Error action:', error);
                        showToast('Action failed', 'error');
                    }
                });
            });

            // Bind decline/cancel buttons
            container.querySelectorAll('.btn-decline').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    const type = btn.dataset.type;
                    try {
                        if (type === 'cancel') {
                            if (!(await this.showConfirmationModal('Cancel Deletion Request', 'Are you sure you want to cancel this deletion request?'))) return;
                            await dataLayer.declineDeletionRequest(id);
                            showToast('Deletion request cancelled', 'info');
                        } else {
                            if (!(await this.showConfirmationModal('Decline Entry', 'Are you sure you want to decline this entry?'))) return;
                            await dataLayer.declineEntry(id);
                            showToast('Entry declined', 'info');
                        }
                        await this.renderPendingApprovals();
                        await this.refreshData();
                    } catch (error) {
                        console.error('Error declining:', error);
                        showToast('Action failed', 'error');
                    }
                });
            });

            // Bind view buttons
            container.querySelectorAll('.btn-view').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = btn.dataset.id;
                    try {
                        const entry = await dataLayer.getEntry(parseInt(id));
                        this.openEntryModal(entry);
                    } catch (error) {
                        console.error('Error fetching entry:', error);
                        showToast('Failed to load entry details', 'error');
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
    window.app = new App();
    window.app.init();
});
