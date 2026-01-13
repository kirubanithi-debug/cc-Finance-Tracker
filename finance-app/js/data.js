/**
 * FinanceFlow - Data Layer
 * Handles all data operations with IndexedDB
 * Designed for easy migration to Supabase
 */

const DB_NAME = 'financeflow_db';
const DB_VERSION = 2; // Bumped to add clients store

// Store names
const STORES = {
    ENTRIES: 'finance_entries',
    INVOICES: 'invoices',
    CLIENTS: 'clients',
    SETTINGS: 'settings'
};

class DataLayer {
    constructor() {
        this.db = null;
        this.listeners = new Map();
    }

    /**
     * Initialize the database
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Finance Entries Store
                if (!db.objectStoreNames.contains(STORES.ENTRIES)) {
                    const entriesStore = db.createObjectStore(STORES.ENTRIES, {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    entriesStore.createIndex('date', 'date', { unique: false });
                    entriesStore.createIndex('clientName', 'clientName', { unique: false });
                    entriesStore.createIndex('type', 'type', { unique: false });
                    entriesStore.createIndex('status', 'status', { unique: false });
                    entriesStore.createIndex('paymentMode', 'paymentMode', { unique: false });
                    entriesStore.createIndex('createdAt', 'createdAt', { unique: false });
                }

                // Invoices Store
                if (!db.objectStoreNames.contains(STORES.INVOICES)) {
                    const invoicesStore = db.createObjectStore(STORES.INVOICES, {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    invoicesStore.createIndex('invoiceNumber', 'invoiceNumber', { unique: true });
                    invoicesStore.createIndex('clientName', 'clientName', { unique: false });
                    invoicesStore.createIndex('invoiceDate', 'invoiceDate', { unique: false });
                    invoicesStore.createIndex('status', 'status', { unique: false });
                    invoicesStore.createIndex('createdAt', 'createdAt', { unique: false });
                }

                // Clients Store
                if (!db.objectStoreNames.contains(STORES.CLIENTS)) {
                    const clientsStore = db.createObjectStore(STORES.CLIENTS, {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    clientsStore.createIndex('name', 'name', { unique: false });
                    clientsStore.createIndex('phone', 'phone', { unique: false });
                    clientsStore.createIndex('createdAt', 'createdAt', { unique: false });
                }

                // Settings Store
                if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
                    db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
                }
            };
        });
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
            this.listeners.get(storeName).delete(callback);
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

    /**
     * Generic add operation
     */
    async add(storeName, data) {
        const item = {
            ...data,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(item);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                item.id = request.result;
                this.notifyListeners(storeName);
                resolve(item);
            };
        });
    }

    /**
     * Generic update operation
     */
    async update(storeName, id, data) {
        const existing = await this.getById(storeName, id);
        const updated = {
            ...existing,
            ...data,
            id,
            updatedAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(updated);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.notifyListeners(storeName);
                resolve(updated);
            };
        });
    }

    /**
     * Generic delete operation
     */
    async delete(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.notifyListeners(storeName);
                resolve(true);
            };
        });
    }

    /**
     * Get by ID
     */
    async getById(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    }

    /**
     * Get all records from a store
     */
    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result || []);
        });
    }

    /**
     * Clear a store
     */
    async clearStore(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.notifyListeners(storeName);
                resolve(true);
            };
        });
    }

    /**
     * Clear all data
     */
    async clearAll() {
        await this.clearStore(STORES.ENTRIES);
        await this.clearStore(STORES.INVOICES);
        // Don't clear settings
    }

    // ==================== Finance Entries ====================

    async addEntry(entry) {
        return this.add(STORES.ENTRIES, entry);
    }

    async updateEntry(id, entry) {
        return this.update(STORES.ENTRIES, id, entry);
    }

    async deleteEntry(id) {
        return this.delete(STORES.ENTRIES, id);
    }

    async getEntry(id) {
        return this.getById(STORES.ENTRIES, id);
    }

    async getAllEntries() {
        const entries = await this.getAll(STORES.ENTRIES);
        // Sort by date descending
        return entries.sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    async getFilteredEntries(filters = {}) {
        let entries = await this.getAllEntries();

        // Apply filters
        if (filters.startDate) {
            entries = entries.filter(e => new Date(e.date) >= new Date(filters.startDate));
        }
        if (filters.endDate) {
            entries = entries.filter(e => new Date(e.date) <= new Date(filters.endDate));
        }
        if (filters.month !== '' && filters.month !== undefined) {
            entries = entries.filter(e => new Date(e.date).getMonth() === parseInt(filters.month));
        }
        if (filters.year) {
            entries = entries.filter(e => new Date(e.date).getFullYear() === parseInt(filters.year));
        }
        if (filters.type) {
            entries = entries.filter(e => e.type === filters.type);
        }
        if (filters.status) {
            entries = entries.filter(e => e.status === filters.status);
        }
        if (filters.paymentMode) {
            entries = entries.filter(e => e.paymentMode === filters.paymentMode);
        }
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            entries = entries.filter(e =>
                e.clientName.toLowerCase().includes(searchLower) ||
                (e.description && e.description.toLowerCase().includes(searchLower))
            );
        }

        return entries;
    }

    /**
     * Calculate financial summary
     */
    async getFinancialSummary(filters = {}) {
        const entries = await this.getFilteredEntries(filters);

        const summary = {
            totalIncome: 0,
            totalExpense: 0,
            pendingAmount: 0,
            receivedAmount: 0,
            netBalance: 0
        };

        entries.forEach(entry => {
            const amount = parseFloat(entry.amount) || 0;

            if (entry.type === 'income') {
                summary.totalIncome += amount;
                if (entry.status === 'pending') {
                    summary.pendingAmount += amount;
                } else {
                    summary.receivedAmount += amount;
                }
            } else {
                summary.totalExpense += amount;
            }
        });

        summary.netBalance = summary.totalIncome - summary.totalExpense;

        return summary;
    }

    /**
     * Get monthly data for charts
     */
    async getMonthlyData(year) {
        const entries = await this.getAllEntries();
        const yearEntries = entries.filter(e => new Date(e.date).getFullYear() === parseInt(year));

        const monthlyData = Array(12).fill(null).map(() => ({ income: 0, expense: 0 }));

        yearEntries.forEach(entry => {
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

    /**
     * Get payment mode distribution
     */
    async getPaymentModeDistribution() {
        const entries = await this.getAllEntries();
        const distribution = {};

        entries.forEach(entry => {
            const mode = entry.paymentMode || 'other';
            const amount = parseFloat(entry.amount) || 0;

            if (!distribution[mode]) {
                distribution[mode] = 0;
            }
            distribution[mode] += amount;
        });

        return distribution;
    }

    /**
     * Get status distribution (pending vs received)
     */
    async getStatusDistribution() {
        const entries = await this.getAllEntries();
        const distribution = { pending: 0, received: 0 };

        entries.forEach(entry => {
            const amount = parseFloat(entry.amount) || 0;
            if (entry.status === 'pending') {
                distribution.pending += amount;
            } else {
                distribution.received += amount;
            }
        });

        return distribution;
    }

    /**
     * Get yearly revenue data for line chart
     */
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
        return this.add(STORES.INVOICES, invoice);
    }

    async updateInvoice(id, invoice) {
        return this.update(STORES.INVOICES, id, invoice);
    }

    async deleteInvoice(id) {
        return this.delete(STORES.INVOICES, id);
    }

    async getInvoice(id) {
        return this.getById(STORES.INVOICES, id);
    }

    async getAllInvoices() {
        const invoices = await this.getAll(STORES.INVOICES);
        // Sort by date descending
        return invoices.sort((a, b) => new Date(b.invoiceDate) - new Date(a.invoiceDate));
    }

    async getNextInvoiceNumber() {
        const invoices = await this.getAllInvoices();
        if (invoices.length === 0) {
            return 'INV-0001';
        }

        // Extract numbers from invoice numbers and find max
        const numbers = invoices.map(inv => {
            const match = inv.invoiceNumber.match(/INV-(\d+)/);
            return match ? parseInt(match[1]) : 0;
        });

        const maxNumber = Math.max(...numbers);
        return `INV-${String(maxNumber + 1).padStart(4, '0')}`;
    }

    // ==================== Clients ====================

    async addClient(client) {
        return this.add(STORES.CLIENTS, client);
    }

    async updateClient(id, client) {
        return this.update(STORES.CLIENTS, id, client);
    }

    async deleteClient(id) {
        return this.delete(STORES.CLIENTS, id);
    }

    async getClient(id) {
        return this.getById(STORES.CLIENTS, id);
    }

    async getAllClients() {
        const clients = await this.getAll(STORES.CLIENTS);
        // Sort by name
        return clients.sort((a, b) => a.name.localeCompare(b.name));
    }

    async getClientByName(name) {
        const clients = await this.getAllClients();
        return clients.find(c => c.name.toLowerCase() === name.toLowerCase());
    }

    // ==================== Settings ====================

    async getSetting(key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.SETTINGS], 'readonly');
            const store = transaction.objectStore(STORES.SETTINGS);
            const request = store.get(key);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                resolve(request.result ? request.result.value : null);
            };
        });
    }

    async setSetting(key, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORES.SETTINGS], 'readwrite');
            const store = transaction.objectStore(STORES.SETTINGS);
            const request = store.put({ key, value });

            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(true);
        });
    }

    async getAllSettings() {
        const settings = await this.getAll(STORES.SETTINGS);
        const result = {};
        settings.forEach(s => {
            result[s.key] = s.value;
        });
        return result;
    }

    // ==================== Export/Import ====================

    async exportData() {
        const entries = await this.getAllEntries();
        const invoices = await this.getAllInvoices();
        const clients = await this.getAllClients();
        const settings = await this.getAllSettings();

        return {
            version: DB_VERSION,
            exportDate: new Date().toISOString(),
            entries,
            invoices,
            clients,
            settings
        };
    }

    async importData(data) {
        if (!data || !data.entries || !data.invoices) {
            throw new Error('Invalid data format');
        }

        // Clear existing data
        await this.clearStore(STORES.ENTRIES);
        await this.clearStore(STORES.INVOICES);
        if (data.clients) {
            await this.clearStore(STORES.CLIENTS);
        }

        // Import entries
        for (const entry of data.entries) {
            const { id, ...entryData } = entry;
            await this.addEntry(entryData);
        }

        // Import invoices
        for (const invoice of data.invoices) {
            const { id, ...invoiceData } = invoice;
            await this.addInvoice(invoiceData);
        }

        // Import clients
        if (data.clients) {
            for (const client of data.clients) {
                const { id, ...clientData } = client;
                await this.addClient(clientData);
            }
        }

        // Import settings
        if (data.settings) {
            for (const [key, value] of Object.entries(data.settings)) {
                await this.setSetting(key, value);
            }
        }

        return true;
    }
}

// Create and export singleton instance
const dataLayer = new DataLayer();

// Helper functions for formatting
const formatCurrency = (amount, currency = '₹') => {
    const num = parseFloat(amount) || 0;
    return `${currency}${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
};

const formatPaymentMode = (mode) => {
    const modes = {
        cash: 'Cash',
        upi: 'UPI',
        bank_transfer: 'Bank Transfer',
        card: 'Card',
        cheque: 'Cheque'
    };
    return modes[mode] || mode;
};

// Export store names for reference
const DATA_STORES = STORES;
