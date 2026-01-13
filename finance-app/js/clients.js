/**
 * FinanceFlow - Clients Manager
 * Handles client CRUD operations and UI
 */

class ClientsManager {
    constructor() {
        this.clients = [];
    }

    /**
     * Initialize clients manager
     */
    async init() {
        this.bindEvents();
        await this.loadClients();
        await this.populateClientDropdowns();
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Add client button
        document.getElementById('addClientBtn').addEventListener('click', () => this.openClientModal());

        // Client form
        document.getElementById('clientForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveClient();
        });

        // Close modal
        document.getElementById('closeClientModal').addEventListener('click', () => this.closeClientModal());
        document.getElementById('cancelClient').addEventListener('click', () => this.closeClientModal());

        // Close on overlay click
        document.getElementById('clientModal').addEventListener('click', (e) => {
            if (e.target.id === 'clientModal') this.closeClientModal();
        });

        // Invoice client select - auto-fill on change
        document.getElementById('invoiceClientSelect').addEventListener('change', (e) => {
            this.onInvoiceClientSelect(e.target.value);
        });

        // Subscribe to client changes
        dataLayer.subscribe(DATA_STORES.CLIENTS, () => {
            this.loadClients();
            this.populateClientDropdowns();
        });
    }

    /**
     * Load all clients
     */
    async loadClients() {
        this.clients = await dataLayer.getAllClients();
        this.renderClientsGrid();
    }

    /**
     * Render clients grid
     */
    renderClientsGrid() {
        const grid = document.getElementById('clientsGrid');
        const emptyState = document.getElementById('clientsEmptyState');

        if (this.clients.length === 0) {
            grid.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        grid.innerHTML = this.clients.map(client => {
            const initials = this.getInitials(client.name);
            return `
                <div class="client-card" data-id="${client.id}">
                    <div class="client-card-header">
                        <div class="client-avatar">${initials}</div>
                        <div class="client-info">
                            <div class="client-name">${client.name}</div>
                            <div class="client-phone">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                                </svg>
                                ${client.phone}
                            </div>
                        </div>
                    </div>
                    ${client.address ? `<div class="client-address">${client.address.replace(/\n/g, '<br>')}</div>` : ''}
                    <div class="client-card-actions">
                        <button class="btn btn-secondary btn-sm edit-client" data-id="${client.id}">Edit</button>
                        <button class="btn btn-danger btn-sm delete-client" data-id="${client.id}">Delete</button>
                    </div>
                </div>
            `;
        }).join('');

        // Bind edit/delete buttons
        grid.querySelectorAll('.edit-client').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const clientId = parseInt(btn.dataset.id);
                const client = this.clients.find(c => c.id === clientId);
                this.openClientModal(client);
            });
        });

        grid.querySelectorAll('.delete-client').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteClient(parseInt(btn.dataset.id));
            });
        });
    }

    /**
     * Get initials from name
     */
    getInitials(name) {
        return name
            .split(' ')
            .map(part => part.charAt(0))
            .slice(0, 2)
            .join('')
            .toUpperCase();
    }

    /**
     * Open client modal
     */
    openClientModal(client = null) {
        const modal = document.getElementById('clientModal');
        const title = document.getElementById('clientModalTitle');
        const form = document.getElementById('clientForm');

        form.reset();

        if (client) {
            title.textContent = 'Edit Client';
            document.getElementById('clientId').value = client.id;
            document.getElementById('clientName').value = client.name;
            document.getElementById('clientPhone').value = client.phone;
            document.getElementById('clientAddress').value = client.address || '';
        } else {
            title.textContent = 'Add Client';
            document.getElementById('clientId').value = '';
        }

        modal.classList.add('active');
    }

    /**
     * Close client modal
     */
    closeClientModal() {
        document.getElementById('clientModal').classList.remove('active');
    }

    /**
     * Save client
     */
    async saveClient() {
        const id = document.getElementById('clientId').value;
        const client = {
            name: document.getElementById('clientName').value.trim(),
            phone: document.getElementById('clientPhone').value.trim(),
            address: document.getElementById('clientAddress').value.trim()
        };

        if (!client.name || !client.phone) {
            showToast('Please fill in all required fields', 'error');
            return;
        }

        try {
            if (id) {
                await dataLayer.updateClient(parseInt(id), client);
                showToast('Client updated successfully', 'success');
            } else {
                await dataLayer.addClient(client);
                showToast('Client added successfully', 'success');
            }

            this.closeClientModal();
        } catch (error) {
            console.error('Error saving client:', error);
            showToast('Failed to save client', 'error');
        }
    }

    /**
     * Delete client
     */
    async deleteClient(id) {
        if (!confirm('Are you sure you want to delete this client?')) return;

        try {
            await dataLayer.deleteClient(id);
            showToast('Client deleted', 'success');
        } catch (error) {
            console.error('Error deleting client:', error);
            showToast('Failed to delete client', 'error');
        }
    }

    /**
     * Populate client dropdowns in entry and invoice forms
     */
    async populateClientDropdowns() {
        const clients = await dataLayer.getAllClients();

        // Entry form dropdown
        const entryClientSelect = document.getElementById('entryClient');
        if (entryClientSelect) {
            const currentValue = entryClientSelect.value;
            entryClientSelect.innerHTML = `
                <option value="">Select Client</option>
                ${clients.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
            `;
            if (currentValue) {
                entryClientSelect.value = currentValue;
            }
        }

        // Invoice form dropdown
        const invoiceClientSelect = document.getElementById('invoiceClientSelect');
        if (invoiceClientSelect) {
            invoiceClientSelect.innerHTML = `
                <option value="">-- Select a saved client --</option>
                ${clients.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
            `;
        }
    }

    /**
     * Handle invoice client selection - auto-fill client details
     */
    async onInvoiceClientSelect(clientId) {
        if (!clientId) {
            // Clear fields if no client selected
            document.getElementById('invoiceClientName').value = '';
            document.getElementById('invoiceClientPhone').value = '';
            document.getElementById('invoiceClientAddress').value = '';
            return;
        }

        const client = await dataLayer.getClient(parseInt(clientId));
        if (client) {
            document.getElementById('invoiceClientName').value = client.name;
            document.getElementById('invoiceClientPhone').value = client.phone || '';
            document.getElementById('invoiceClientAddress').value = client.address || '';
        }
    }

    /**
     * Get client name options for autocomplete
     */
    getClientNames() {
        return this.clients.map(c => c.name);
    }
}

// Create singleton instance
const clientsManager = new ClientsManager();
