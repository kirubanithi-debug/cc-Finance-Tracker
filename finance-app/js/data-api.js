/**
 * FinanceFlow - Supabase Data Layer
 * Direct connection to Supabase - No backend required
 */

// Helper functions to convert between JS camelCase and database snake_case
const toDbEntry = (entry) => ({
    date: entry.date,
    client_name: entry.clientName,
    description: entry.description,
    amount: entry.amount,
    type: entry.type,
    status: entry.status,
    payment_mode: entry.paymentMode
});

const fromDbEntry = (row) => ({
    id: row.id,
    date: row.date,
    clientName: row.client_name,
    description: row.description,
    amount: row.amount,
    type: row.type,
    status: row.status,
    paymentMode: row.payment_mode,
    userId: row.user_id,
    createdAt: row.created_at,
    // Approval workflow fields
    approvalStatus: row.approval_status || 'approved',
    createdByName: row.created_by_name || 'Unknown',
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    deletionRequested: row.deletion_requested,
    deletionRequestedBy: row.deletion_requested_by
});

const toDbInvoice = (invoice) => ({
    invoice_number: invoice.invoiceNumber,
    invoice_date: invoice.invoiceDate,
    due_date: invoice.dueDate,
    client_name: invoice.clientName,
    client_address: invoice.clientAddress,
    client_phone: invoice.clientPhone,
    agency_name: invoice.agencyName,
    agency_contact: invoice.agencyContact,
    agency_address: invoice.agencyAddress,
    agency_logo: invoice.agencyLogo,
    subtotal: invoice.subtotal,
    tax_percent: invoice.taxPercent,
    tax_amount: invoice.taxAmount,
    discount_percent: invoice.discountPercent,
    discount_amount: invoice.discountAmount,
    grand_total: invoice.grandTotal,
    payment_status: invoice.paymentStatus
});

const fromDbInvoice = (row) => ({
    id: row.id,
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    clientName: row.client_name,
    clientAddress: row.client_address,
    clientPhone: row.client_phone,
    agencyName: row.agency_name,
    agencyContact: row.agency_contact,
    agencyAddress: row.agency_address,
    agencyLogo: row.agency_logo,
    subtotal: row.subtotal,
    taxPercent: row.tax_percent,
    taxAmount: row.tax_amount,
    discountPercent: row.discount_percent,
    discountAmount: row.discount_amount,
    grandTotal: row.grand_total,
    paymentStatus: row.payment_status,
    services: row.invoice_services?.map(s => ({
        id: s.id,
        name: s.name,
        quantity: s.quantity,
        rate: s.rate,
        amount: s.amount
    })) || [],
    createdAt: row.created_at
});

class DataLayerAPI {
    constructor() {
        this.listeners = new Map();
    }

    /**
     * Initialize the data layer
     */
    async init() {
        console.log('Supabase DataLayer initialized');

        // Check authentication status
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) {
            const isAuthPage = window.location.pathname.includes('login.html') ||
                window.location.pathname.includes('signup.html');
            if (!isAuthPage) {
                console.warn('No active session, redirecting to login');
                window.location.href = 'login.html';
                return;
            }
        }

        return Promise.resolve();
    }

    /**
     * Get map of all users for enriching entries
     */
    async getUsersMap() {
        try {
            const { data: users } = await supabaseClient
                .from('users')
                .select('id, name, role');

            const map = new Map();
            if (users) {
                users.forEach(u => map.set(u.id, u));
            }
            return map;
        } catch (e) {
            console.warn('Failed to fetch users map:', e);
            return new Map();
        }
    }

    /**
     * Enrich entry with real-time user name from users table
     */
    enrichEntry(entry, userMap) {
        if (entry && entry.userId && userMap.has(entry.userId)) {
            const user = userMap.get(entry.userId);
            const roleLabel = user.role === 'admin' ? 'Admin' : 'Employee';
            const name = user.name || 'Unknown';
            entry.createdByName = `${roleLabel} - ${name}`;
        }
        return entry;
    }

    /**
     * Get current user object
     */
    async getCurrentUser() {
        const { data: { session } } = await supabaseClient.auth.getSession();
        return session?.user || null;
    }

    /**
     * Get current user ID
     */
    async getCurrentUserId() {
        const { data: { session } } = await supabaseClient.auth.getSession();
        return session?.user?.id || null;
    }

    /**
     * Get current user's role (admin/employee)
     * Enhanced to handle users created directly in Supabase Auth
     */
    async getCurrentUserRole() {
        const userId = await this.getCurrentUserId();
        if (!userId) return null;

        // First, try to get role from users table
        const { data, error } = await supabaseClient
            .from('users')
            .select('role')
            .eq('id', userId)
            .single();

        if (data?.role) {
            return data.role;
        }

        // If no user record found, check session metadata
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session?.user?.user_metadata?.role) {
            return session.user.user_metadata.role;
        }

        // Check if user is linked as employee in employees table
        const { data: employeeData } = await supabaseClient
            .from('employees')
            .select('id')
            .eq('user_id', userId)
            .single();

        if (employeeData) {
            return 'employee';
        }

        // Default: if no user record exists and not an employee, treat as admin
        // This handles admin accounts created directly in Supabase
        if (error && error.code === 'PGRST116') {
            console.log('No user record found, defaulting to admin role');
            return 'admin';
        }

        console.warn('Could not determine user role, defaulting to employee for security');
        return 'employee';
    }

    /**
     * Get admin ID for the current user
     * If user is admin, returns their own ID
     * If user is employee, returns their linked admin's ID
     */
    async getUserInfo() {
        return {
            userId: await this.getCurrentUserId(),
            adminId: await this.getAdminId()
        };
    }

    async getAdminId() {
        const userId = await this.getCurrentUserId();
        const userRole = await this.getCurrentUserRole();

        if (userRole === 'admin') return userId;

        // For employees, get admin_id from user metadata or employees table
        const { data: { session } } = await supabaseClient.auth.getSession();
        let adminId = session?.user?.user_metadata?.admin_id;

        if (!adminId) {
            const { data: employeeData } = await supabaseClient
                .from('employees')
                .select('admin_id')
                .eq('user_id', userId)
                .single();
            adminId = employeeData?.admin_id;
        }

        return adminId || userId;
    }

    /**
     * Check if current user is admin
     */
    async isAdmin() {
        const role = await this.getCurrentUserRole();
        const isAdminRole = role === 'admin';
        console.log(`Role check: ${role}, isAdmin: ${isAdminRole}`);
        return isAdminRole;
    }

    /**
     * Get current user's name
     */
    async getCurrentUserName() {
        const userId = await this.getCurrentUserId();
        if (!userId) return 'Unknown';

        const { data } = await supabaseClient
            .from('users')
            .select('name')
            .eq('id', userId)
            .single();

        return data?.name || 'Unknown';
    }

    /**
     * Handle Supabase errors
     */
    handleError(error, context = 'Operation') {
        console.error(`${context} error:`, error);
        if (error.code === 'PGRST301' || error.message?.includes('JWT')) {
            // Auth error - redirect to login
            localStorage.removeItem('user');
            window.location.href = 'login.html';
        }
        throw new Error(error.message || `${context} failed`);
    }

    /**
     * Add a change listener
     */
    subscribe(storeName, callback) {
        if (!this.listeners.has(storeName)) {
            this.listeners.set(storeName, new Set());
        }
        this.listeners.get(storeName).add(callback);

        return () => {
            if (this.listeners.has(storeName)) {
                this.listeners.get(storeName).delete(callback);
            }
        };
    }

    /**
     * Notify listeners of changes
     */
    notifyListeners(storeName) {
        if (this.listeners.has(storeName)) {
            this.listeners.get(storeName).forEach(callback => callback());
        }
    }

    // ==================== Finance Entries ====================

    async addEntry(entry) {
        const user = await this.getCurrentUser();
        if (!user) throw new Error('User not logged in');

        const role = await this.getCurrentUserRole();
        // Determine status: Admin -> approved, Employee -> pending (unless configured otherwise)
        // Correction per request: preserve what was passed, or default based on role
        if (!entry.status) {
            entry.status = role === 'admin' ? 'approved' : 'pending';
        }

        // If status is received/pending, map to approval_status
        // Logic: if status is 'pending' payment, is it approved? 
        // We use approval_status for Admin check.
        const approvalStatus = role === 'admin' ? 'approved' : 'pending';

        const dbEntry = {
            user_id: user.id,
            admin_id: await this.getAdminId(), // Key for RLS
            date: entry.date,
            client_name: entry.client,
            description: entry.description,
            amount: entry.amount,
            type: entry.type,
            status: entry.status || 'pending', // Payment status
            payment_mode: entry.paymentMode,
            approval_status: approvalStatus,
            created_by_name: await this.getCurrentUserName(),
            // New Petty Cash Flag
            is_petty_cash: entry.isPettyCash || false
        };

        const { data, error } = await supabaseClient
            .from('finance_entries')
            .insert(dbEntry)
            .select()
            .single();

        if (error) this.handleError(error, 'Add entry');

        this.notifyListeners(DATA_STORES.ENTRIES);
        return fromDbEntry(data);
    }

    async updateEntry(id, entry) {
        const dbEntry = toDbEntry(entry);
        const userRole = await this.getCurrentUserRole();

        // If employee updates entry, it goes back to pending
        if (userRole !== 'admin') {
            dbEntry.approval_status = 'pending';
        }

        const { data, error } = await supabaseClient
            .from('finance_entries')
            .update(dbEntry)
            .eq('id', id)
            .select()
            .single();

        if (error) this.handleError(error, 'Update entry');
        this.notifyListeners(DATA_STORES.ENTRIES);
        return fromDbEntry(data);
    }

    async deleteEntry(id) {
        const isAdmin = await this.isAdmin();
        const userId = await this.getCurrentUserId();

        if (isAdmin) {
            // Admin can delete immediately
            const { error } = await supabaseClient
                .from('finance_entries')
                .delete()
                .eq('id', id);

            if (error) this.handleError(error, 'Delete entry');
        } else {
            // Employee requests deletion
            const { error } = await supabaseClient
                .from('finance_entries')
                .update({
                    deletion_requested: true,
                    deletion_requested_by: userId
                })
                .eq('id', id);

            if (error) this.handleError(error, 'Request delete entry');
            // Maybe show a different toast here? Handled in UI likely.
        }

        this.notifyListeners(DATA_STORES.ENTRIES);
        return true;
    }

    async getEntry(id) {
        const { data, error } = await supabaseClient
            .from('finance_entries')
            .select('*')
            .eq('id', id)
            .single();

        if (error) this.handleError(error, 'Get entry');
        return fromDbEntry(data);
    }

    async getAllEntries(includeAllStatuses = false) {
        const userId = await this.getCurrentUserId();
        const isUserAdmin = await this.isAdmin();

        let query;

        if (isUserAdmin) {
            // Admin: see all entries where admin_id = current user (own + employees')
            query = supabaseClient
                .from('finance_entries')
                .select('*')
                .eq('admin_id', userId);
        } else {
            // Employee: see only own entries
            query = supabaseClient
                .from('finance_entries')
                .select('*')
                .eq('user_id', userId);
        }

        // By default, only show approved entries (for dashboard/stats)
        if (!includeAllStatuses) {
            query = query.eq('approval_status', 'approved');
        }

        const { data, error } = await query.order('date', { ascending: false });

        if (error) this.handleError(error, 'Get all entries');

        const entries = (data || []).map(fromDbEntry);
        const userMap = await this.getUsersMap();
        return entries.map(e => this.enrichEntry(e, userMap));
    }

    /**
     * Get entries pending approval (admin only)
     * Shows entries created by employees that belong to this admin
     */
    async getPendingEntries() {
        const userId = await this.getCurrentUserId();
        const isUserAdmin = await this.isAdmin();

        if (!isUserAdmin) {
            // Employees can only see their own pending entries
            const { data, error } = await supabaseClient
                .from('finance_entries')
                .select('*')
                .eq('user_id', userId)
                .eq('approval_status', 'pending')
                .order('created_at', { ascending: false });

            if (error) this.handleError(error, 'Get pending entries');

            const entries = (data || []).map(fromDbEntry);
            const userMap = await this.getUsersMap();
            return entries.map(e => this.enrichEntry(e, userMap));
        }

        // Admin: Get all pending entries where admin_id = current user
        // This shows entries from all employees under this admin
        const { data, error } = await supabaseClient
            .from('finance_entries')
            .select('*')
            .eq('admin_id', userId)
            .or('approval_status.eq.pending,deletion_requested.eq.true')
            .order('created_at', { ascending: false });

        if (error) this.handleError(error, 'Get pending entries');

        const entries = (data || []).map(fromDbEntry);
        const userMap = await this.getUsersMap();
        return entries.map(e => this.enrichEntry(e, userMap));
    }

    /**
     * Approve an entry (admin only)
     */
    async approveEntry(id) {
        const userId = await this.getCurrentUserId();
        const { data, error } = await supabaseClient
            .from('finance_entries')
            .update({
                approval_status: 'approved',
                approved_by: userId,
                approved_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) this.handleError(error, 'Approve entry');
        this.notifyListeners(DATA_STORES.ENTRIES);
        return fromDbEntry(data);
    }

    /**
     * Decline an entry (admin only)
     */
    async declineEntry(id) {
        const { data, error } = await supabaseClient
            .from('finance_entries')
            .update({ approval_status: 'declined' })
            .eq('id', id)
            .select()
            .single();

        if (error) this.handleError(error, 'Decline entry');
        this.notifyListeners(DATA_STORES.ENTRIES);
        return fromDbEntry(data);
    }

    async declineDeletionRequest(id) {
        const { error } = await supabaseClient
            .from('finance_entries')
            .update({ deletion_requested: false, deletion_requested_by: null })
            .eq('id', id);
        if (error) this.handleError(error, 'Decline deletion request');
        this.notifyListeners(DATA_STORES.ENTRIES);
        return true;
    }

    async getFilteredEntries(filters = {}) {
        const userId = await this.getCurrentUserId();
        const isUserAdmin = await this.isAdmin();

        let query;

        if (isUserAdmin) {
            // Admin: see all entries where admin_id = current user
            query = supabaseClient.from('finance_entries').select('*').eq('admin_id', userId);
        } else {
            // Employee: see only own entries
            query = supabaseClient.from('finance_entries').select('*').eq('user_id', userId);
        }

        if (filters.startDate) {
            query = query.gte('date', filters.startDate);
        }
        if (filters.endDate) {
            query = query.lte('date', filters.endDate);
        }
        if (filters.type) {
            query = query.eq('type', filters.type);
        }
        if (filters.status) {
            query = query.eq('status', filters.status);
        }
        if (filters.paymentMode) {
            query = query.eq('payment_mode', filters.paymentMode);
        }
        if (filters.search) {
            query = query.or(`client_name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
        }

        if (filters.statusOnly) {
            query = query.eq('approval_status', filters.statusOnly);
        }

        // Handle month/year filtering
        if (filters.month !== '' && filters.month !== undefined && filters.year) {
            const month = parseInt(filters.month) + 1; // JS months are 0-indexed
            const year = parseInt(filters.year);
            const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
            const endDate = new Date(year, month, 0).toISOString().split('T')[0];
            query = query.gte('date', startDate).lte('date', endDate);
        } else if (filters.year) {
            query = query.gte('date', `${filters.year}-01-01`).lte('date', `${filters.year}-12-31`);
        }

        query = query.order('date', { ascending: false });

        const { data, error } = await query;
        if (error) this.handleError(error, 'Filter entries');

        const entries = (data || []).map(fromDbEntry);
        const userMap = await this.getUsersMap();
        return entries.map(e => this.enrichEntry(e, userMap));
    }

    async getFinancialSummary(filters = {}) {
        // Ensure we only summarize approved entries
        const summaryFilters = { ...filters, statusOnly: 'approved' };
        const entries = await this.getFilteredEntries(summaryFilters);

        let totalIncome = 0;
        let totalExpense = 0;
        let pendingAmount = 0;
        let receivedAmount = 0;

        // Logic:
        // Net Balance = Total Income (Received + Pending) - Total Expense
        // Available Balance = Income (Received Only) - Total Expense
        // Pending Amount = Income (Pending)

        let availableIncome = 0;

        entries.forEach(entry => {
            const amount = parseFloat(entry.amount) || 0;
            if (entry.type === 'income') {
                totalIncome += amount;
                if (entry.status === 'pending') {
                    pendingAmount += amount;
                } else {
                    receivedAmount += amount;
                    availableIncome += amount; // Only received income counts for available
                }
            } else {
                totalExpense += amount;
            }
        });

        // Ensure available doesn't go below zero if expense > available income? 
        // User didn't specify, but standard acc: can be negative (overdraft).

        return {
            totalIncome,
            totalExpense,
            pendingAmount,
            receivedAmount,
            netBalance: totalIncome - totalExpense,
            availableBalance: availableIncome - totalExpense
        };
    }

    async getMonthlyData(year) {
        const userId = await this.getCurrentUserId();
        const isUserAdmin = await this.isAdmin();

        let query = supabaseClient
            .from('finance_entries')
            .select('*')
            .eq('approval_status', 'approved')
            .gte('date', `${year}-01-01`)
            .lte('date', `${year}-12-31`);

        if (isUserAdmin) {
            query = query.eq('admin_id', userId);
        } else {
            query = query.eq('user_id', userId);
        }

        const { data, error } = await query;

        if (error) this.handleError(error, 'Get monthly data');

        // Aggregate by month
        const monthlyData = Array(12).fill(null).map(() => ({ income: 0, expense: 0 }));

        (data || []).forEach(entry => {
            const month = new Date(entry.date).getMonth();
            const amount = parseFloat(entry.amount) || 0;
            if (entry.type === 'income') {
                monthlyData[month].income += amount;
            } else {
                monthlyData[month].expense += amount;
            }
        });

        return monthlyData;
    }

    async getPaymentModeDistribution() {
        const entries = await this.getAllEntries();
        const distribution = {};

        entries.forEach(entry => {
            // Fix: Use correct property name from mapped object (paymentMode not payment_mode)
            const mode = entry.paymentMode || 'unknown';
            const amount = parseFloat(entry.amount) || 0;
            distribution[mode] = (distribution[mode] || 0) + amount;
        });

        return distribution;
    }

    async getStatusDistribution() {
        const entries = await this.getAllEntries();
        let pending = 0;
        let received = 0;

        entries.forEach(entry => {
            const amount = parseFloat(entry.amount) || 0;
            if (entry.status === 'pending') {
                pending += amount;
            } else {
                received += amount;
            }
        });

        return { pending, received };
    }

    async getYearlyRevenue() {
        const entries = await this.getAllEntries();
        const yearlyData = {};

        entries.forEach(entry => {
            const year = new Date(entry.date).getFullYear();
            const amount = parseFloat(entry.amount) || 0;
            if (!yearlyData[year]) {
                yearlyData[year] = { income: 0, expense: 0 };
            }
            if (entry.type === 'income') {
                yearlyData[year].income += amount;
            } else {
                yearlyData[year].expense += amount;
            }
        });

        return yearlyData;
    }

    // ==================== Invoices ====================

    async addInvoice(invoice) {
        const userId = await this.getCurrentUserId();
        const adminId = await this.getAdminId(); // Fix: Define adminId
        const { services, ...invoiceData } = invoice;
        const dbInvoice = toDbInvoice(invoiceData);

        // Insert invoice
        // Add creator details
        const userName = await this.getCurrentUserName();
        const { data: { session } } = await supabaseClient.auth.getSession();
        const userEmail = session?.user?.email;

        // Use manual name if provided, otherwise fallback
        const formattedCreatedBy = invoice.created_by_name || `${await this.isAdmin() ? 'Admin' : 'Employee'} - ${userName}`;

        const { data: invoiceResult, error: invoiceError } = await supabaseClient
            .from('invoices')
            .insert({
                ...dbInvoice,
                user_id: userId,
                admin_id: adminId,
                created_by: userId,
                created_by_name: formattedCreatedBy,
                created_by_email: userEmail
            })
            .select()
            .single();

        if (invoiceError) this.handleError(invoiceError, 'Add invoice');

        // Insert services if present
        if (services && services.length > 0) {
            const servicesWithInvoiceId = services.map(s => ({
                name: s.name,
                quantity: s.quantity,
                rate: s.rate,
                amount: s.amount,
                invoice_id: invoiceResult.id
            }));

            const { error: servicesError } = await supabaseClient
                .from('invoice_services')
                .insert(servicesWithInvoiceId);

            if (servicesError) {
                console.warn('Error inserting services:', servicesError);
            }
        }

        this.notifyListeners(DATA_STORES.INVOICES);
        return fromDbInvoice({ ...invoiceResult, invoice_services: services || [] });
    }

    async updateInvoice(id, invoice) {
        const { services, ...invoiceData } = invoice;
        const dbInvoice = toDbInvoice(invoiceData);

        const { data, error } = await supabaseClient
            .from('invoices')
            .update(dbInvoice)
            .eq('id', id)
            .select()
            .single();

        if (error) this.handleError(error, 'Update invoice');

        // Update services if provided
        if (services) {
            // Delete existing services
            await supabaseClient.from('invoice_services').delete().eq('invoice_id', id);

            // Insert new services
            if (services.length > 0) {
                const servicesWithInvoiceId = services.map(s => ({
                    name: s.name,
                    quantity: s.quantity,
                    rate: s.rate,
                    amount: s.amount,
                    invoice_id: id
                }));
                await supabaseClient.from('invoice_services').insert(servicesWithInvoiceId);
            }
        }

        this.notifyListeners(DATA_STORES.INVOICES);
        return fromDbInvoice({ ...data, invoice_services: services || [] });
    }

    async deleteInvoice(id) {
        // Delete services first (cascade might be configured in DB)
        await supabaseClient.from('invoice_services').delete().eq('invoice_id', id);

        const { error } = await supabaseClient
            .from('invoices')
            .delete()
            .eq('id', id);

        if (error) this.handleError(error, 'Delete invoice');
        this.notifyListeners(DATA_STORES.INVOICES);
        return true;
    }

    async importInvoices(invoices) {
        const userId = await this.getCurrentUserId();
        const results = [];

        for (const invoice of invoices) {
            try {
                const result = await this.addInvoice({ ...invoice, user_id: userId });
                results.push(result);
            } catch (err) {
                console.warn('Error importing invoice:', err);
            }
        }

        this.notifyListeners(DATA_STORES.INVOICES);
        return results;
    }

    async getInvoice(id) {
        const { data, error } = await supabaseClient
            .from('invoices')
            .select('*, invoice_services(*)')
            .eq('id', id)
            .single();

        if (error) this.handleError(error, 'Get invoice');
        return fromDbInvoice(data);
    }

    async getAllInvoices() {
        const adminId = await this.getAdminId();
        const { data, error } = await supabaseClient
            .from('invoices')
            .select('*, invoice_services(*)')
            .eq('admin_id', adminId)
            .order('created_at', { ascending: false });

        if (error) this.handleError(error, 'Get all invoices');
        return (data || []).map(fromDbInvoice);
    }

    async getNextInvoiceNumber() {
        try {
            const adminId = await this.getAdminId();
            // Call the database function to get the next strictly sequential number
            const { data, error } = await supabaseClient.rpc('get_next_invoice_number', {
                org_admin_id: adminId
            });

            if (error) {
                console.error('Error fetching next invoice number:', error);
                return 'INV-0001';
            }

            // Format as INV-0001 (padding to 4 digits)
            const num = data || 1;
            return `INV-${String(num).padStart(4, '0')}`;
        } catch (e) {
            console.error('Failed to get next invoice number:', e);
            return 'INV-0001';
        }
    }

    // ==================== Clients ====================

    async addClient(client) {
        const userId = await this.getCurrentUserId();
        const adminId = await this.getAdminId();
        const { data, error } = await supabaseClient
            .from('clients')
            .insert({
                ...client,
                user_id: userId,
                admin_id: adminId
            })
            .select()
            .single();

        if (error) this.handleError(error, 'Add client');
        this.notifyListeners(DATA_STORES.CLIENTS);
        return data;
    }

    async updateClient(id, client) {
        const { data, error } = await supabaseClient
            .from('clients')
            .update({
                ...client,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) this.handleError(error, 'Update client');
        this.notifyListeners(DATA_STORES.CLIENTS);
        return data;
    }

    async deleteClient(id) {
        const { error } = await supabaseClient
            .from('clients')
            .delete()
            .eq('id', id);

        if (error) this.handleError(error, 'Delete client');
        this.notifyListeners(DATA_STORES.CLIENTS);
        return true;
    }

    async getClient(id) {
        const { data, error } = await supabaseClient
            .from('clients')
            .select('*')
            .eq('id', id)
            .single();

        if (error) this.handleError(error, 'Get client');
        return data;
    }

    async getAllClients(approvedOnly = false) {
        const adminId = await this.getAdminId();
        let query = supabaseClient
            .from('clients')
            .select('*')
            .eq('admin_id', adminId)
            .order('name', { ascending: true });

        if (approvedOnly) {
            query = query.eq('approval_status', 'approved');
        }

        const { data, error } = await query;
        if (error) this.handleError(error, 'Get all clients');
        return data || [];
    }

    async getPendingClients() {
        const adminId = await this.getAdminId();

        // Only admins check this, but safety check
        if (!await this.isAdmin()) return [];

        const { data, error } = await supabaseClient
            .from('clients')
            .select('*')
            .eq('admin_id', adminId)
            .eq('approval_status', 'pending')
            .order('created_at', { ascending: false });

        if (error) this.handleError(error, 'Get pending clients');
        return data || [];
    }

    async getClientByName(name) {
        const clients = await this.getAllClients();
        return clients.find(c => c.name.toLowerCase() === name.toLowerCase());
    }

    // ==================== Investments ====================

    async addInvestment(investment) {
        const userId = await this.getCurrentUserId();
        const userName = await this.getCurrentUserName();
        const userRole = await this.getCurrentUserRole();

        // Admin entries approved by default, Employee entries pending
        const status = userRole === 'admin' ? 'approved' : 'pending';

        const adminId = await this.getAdminId();
        const { data, error } = await supabaseClient
            .from('investments')
            .insert({
                ...investment,
                created_by: userId,
                created_by_name: userName,
                status: status,
                admin_id: adminId
            })
            .select()
            .single();

        if (error) this.handleError(error, 'Add investment');
        if (DATA_STORES.INVESTMENTS) this.notifyListeners(DATA_STORES.INVESTMENTS);
        return data;
    }

    async updateInvestment(id, investment) {
        // Prevent updating admin_id or created_by ownership securely
        // Only update fields: item_name, type, amount, date_bought, purpose, status
        const updateData = {
            item_name: investment.item_name,
            type: investment.type,
            amount: investment.amount,
            date_bought: investment.date_bought,
            purpose: investment.purpose
        };

        const { data, error } = await supabaseClient
            .from('investments')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) this.handleError(error, 'Update investment');
        if (DATA_STORES.INVESTMENTS) this.notifyListeners(DATA_STORES.INVESTMENTS);
        return data;
    }

    async getInvestments() {
        const { data, error } = await supabaseClient
            .from('investments')
            .select('*')
            .order('date_bought', { ascending: false });

        if (error) this.handleError(error, 'Get investments');
        return data || [];
    }

    async updateInvestmentStatus(id, status) {
        const { data, error } = await supabaseClient
            .from('investments')
            .update({ status: status })
            .eq('id', id)
            .select()
            .single();

        if (error) this.handleError(error, 'Update investment status');
        if (DATA_STORES.INVESTMENTS) this.notifyListeners(DATA_STORES.INVESTMENTS);
        return data;
    }

    async deleteInvestment(id) {
        const { error } = await supabaseClient
            .from('investments')
            .delete()
            .eq('id', id);

        if (error) this.handleError(error, 'Delete investment');
        if (DATA_STORES.INVESTMENTS) this.notifyListeners(DATA_STORES.INVESTMENTS);
        return true;
    }

    // ==================== Employees (Admin Only) ====================

    /**
     * Add a new employee (admin only)
     * Creates a Supabase auth user and stores employee record
     */
    async addEmployee(employee) {
        const adminId = await this.getCurrentUserId();

        // First, create the auth user for the employee
        // Note: This requires Supabase service role key or admin API
        // For security, employee creation should ideally go through a backend
        // Here we'll just create the employee record and they'll need to sign up

        const { data, error } = await supabaseClient
            .from('employees')
            .insert({
                admin_id: adminId,
                name: employee.name,
                email: employee.email
            })
            .select()
            .single();

        if (error) this.handleError(error, 'Add employee');
        this.notifyListeners(DATA_STORES.EMPLOYEES);
        return data;
    }

    /**
     * Create employee auth account and link to employee record
     * This creates a Supabase auth user for the employee
     */
    async createEmployeeAccount(employeeId, email, password) {
        // Sign up the employee
        const { data: authData, error: authError } = await supabaseClient.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true,
            user_metadata: { role: 'employee' }
        });

        if (authError) {
            console.error('Error creating employee auth:', authError);
            throw authError;
        }

        // Update employee record with auth user ID
        if (authData?.user) {
            await supabaseClient
                .from('employees')
                .update({ user_id: authData.user.id })
                .eq('id', employeeId);

            // Also create entry in users table with employee role
            await supabaseClient
                .from('users')
                .insert({
                    id: authData.user.id,
                    name: (await this.getEmployee(employeeId))?.name || 'Employee',
                    email: email,
                    role: 'employee'
                });
        }

        return authData;
    }

    /**
     * Get all employees for current admin
     */
    async getAllEmployees() {
        const adminId = await this.getCurrentUserId();
        const { data, error } = await supabaseClient
            .from('employees')
            .select('*')
            .eq('admin_id', adminId)
            .order('created_at', { ascending: false });

        if (error) this.handleError(error, 'Get all employees');
        return data || [];
    }

    /**
     * Get single employee by ID
     */
    async getEmployee(id) {
        const { data, error } = await supabaseClient
            .from('employees')
            .select('*')
            .eq('id', id)
            .single();

        if (error) this.handleError(error, 'Get employee');
        return data;
    }

    /**
     * Update employee
     */
    async updateEmployee(id, employee) {
        const { data, error } = await supabaseClient
            .from('employees')
            .update({
                name: employee.name,
                email: employee.email,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) this.handleError(error, 'Update employee');
        this.notifyListeners(DATA_STORES.EMPLOYEES);
        return data;
    }

    /**
     * Delete employee
     */
    async deleteEmployee(id) {
        const { error } = await supabaseClient
            .from('employees')
            .delete()
            .eq('id', id);

        if (error) this.handleError(error, 'Delete employee');
        this.notifyListeners(DATA_STORES.EMPLOYEES);
        return true;
    }

    // ==================== Settings ====================

    async getSetting(key) {
        const adminId = await this.getAdminId();
        const { data, error } = await supabaseClient
            .from('settings')
            .select('value')
            .eq('key', key)
            .eq('admin_id', adminId)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.warn('Get setting error:', error);
        }
        return data?.value ?? null;
    }

    async setSetting(key, value) {
        const adminId = await this.getAdminId();
        const { error } = await supabaseClient
            .from('settings')
            .upsert({
                key,
                value,
                admin_id: adminId
            }, {
                onConflict: 'key, admin_id'
            });

        if (error) this.handleError(error, 'Set setting');
        return true;
    }

    async getAllSettings() {
        const adminId = await this.getAdminId();
        const { data, error } = await supabaseClient
            .from('settings')
            .select('*')
            .eq('admin_id', adminId);

        if (error) this.handleError(error, 'Get all settings');

        // Convert array of key-value pairs to object
        const settings = {};
        (data || []).forEach(item => {
            settings[item.key] = item.value;
        });
        return settings;
    }

    // ==================== Export/Import ====================

    async exportData() {
        const entries = await this.getAllEntries();
        const invoices = await this.getAllInvoices();
        const clients = await this.getAllClients();
        const settings = await this.getAllSettings();

        return { entries, invoices, clients, settings };
    }

    async importData(data) {
        if (data.clients) {
            for (const client of data.clients) {
                try {
                    await this.addClient(client);
                } catch (e) { console.warn('Import client error:', e); }
            }
        }
        if (data.entries) {
            for (const entry of data.entries) {
                try {
                    await this.addEntry(entry);
                } catch (e) { console.warn('Import entry error:', e); }
            }
        }
        if (data.invoices) {
            await this.importInvoices(data.invoices);
        }

        this.notifyListeners(DATA_STORES.ENTRIES);
        this.notifyListeners(DATA_STORES.INVOICES);
        this.notifyListeners(DATA_STORES.CLIENTS);

        return true;
    }

    async clearAll() {
        // This is a destructive operation - only clears current user's data
        const userId = await this.getCurrentUserId();
        console.warn('Clear all data requested for user:', userId);

        // Get user's invoices to delete their services
        const { data: userInvoices } = await supabaseClient
            .from('invoices')
            .select('id')
            .eq('user_id', userId);

        if (userInvoices && userInvoices.length > 0) {
            const invoiceIds = userInvoices.map(inv => inv.id);
            await supabaseClient.from('invoice_services').delete().in('invoice_id', invoiceIds);
        }

        await supabaseClient.from('invoices').delete().eq('user_id', userId);
        await supabaseClient.from('finance_entries').delete().eq('user_id', userId);
        await supabaseClient.from('clients').delete().eq('user_id', userId);

        this.notifyListeners(DATA_STORES.ENTRIES);
        this.notifyListeners(DATA_STORES.INVOICES);
        this.notifyListeners(DATA_STORES.CLIENTS);

        return true;
    }

    async clearStore(storeName) {
        console.warn(`Clear store ${storeName} requested`);
        return this.clearAll();
    }

    // ==================== Notifications ====================

    async getNotifications() {
        const userId = await this.getCurrentUserId();
        const { data, error } = await supabaseClient
            .from('notifications')
            .select('*')
            .eq('admin_id', userId)
            .order('created_at', { ascending: false });

        if (error) this.handleError(error, 'Get notifications');
        return data || [];
    }

    async getUnreadNotificationCount() {
        const userId = await this.getCurrentUserId();
        const { count, error } = await supabaseClient
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('admin_id', userId)
            .eq('is_read', false);

        if (error) this.handleError(error, 'Get unread count');
        return count || 0;
    }

    async markNotificationAsRead(id) {
        const { error } = await supabaseClient
            .from('notifications')
            .update({ is_read: true })
            .eq('id', id);

        if (error) this.handleError(error, 'Mark as read');
        this.notifyListeners(DATA_STORES.NOTIFICATIONS);
        return true;
    }

    async deleteNotification(id) {
        const { error } = await supabaseClient
            .from('notifications')
            .delete()
            .eq('id', id);

        if (error) this.handleError(error, 'Delete notification');
        this.notifyListeners(DATA_STORES.NOTIFICATIONS);
        return true;
    }
}

// Store names (kept for compatibility)
const DATA_STORES = {
    ENTRIES: 'finance_entries',
    INVOICES: 'invoices',
    CLIENTS: 'clients',
    EMPLOYEES: 'employees',
    SETTINGS: 'settings',
    INVESTMENTS: 'investments',
    NOTIFICATIONS: 'notifications'
};

// Create and export singleton instance
const dataLayer = new DataLayerAPI();

// Helper functions for formatting are in main.js
// Removed to avoid re-declaration errors
