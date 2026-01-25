/**
 * Investments Manager
 * Handles investment tracking and UI
 */
class InvestmentsManager {
    constructor() {
        this.investments = [];
    }

    async init() {
        this.bindEvents();
        await this.loadInvestments();
    }

    bindEvents() {
        // Modal
        const modal = document.getElementById('investmentModal');
        const addBtn = document.getElementById('addInvestmentBtn');
        const closeBtn = document.getElementById('closeInvestmentModal');
        const cancelBtn = document.getElementById('cancelInvestment');
        const form = document.getElementById('investmentForm');

        if (addBtn) addBtn.addEventListener('click', () => this.openModal());
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeModal());
        if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeModal());

        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeModal();
            });
        }

        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveInvestment();
            });
        }
    }

    async loadInvestments() {
        try {
            this.investments = await dataLayer.getInvestments();
            this.renderTable();
            this.renderChart();
        } catch (error) {
            console.error('Failed to load investments:', error);
        }
    }

    renderChart() {
        const canvas = document.getElementById('investmentChart');
        if (!canvas) return;

        // Destroy existing chart if it exists
        if (this.chart) {
            this.chart.destroy();
        }

        if (this.investments.length === 0) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            return;
        }

        // Only include approved investments for the chart? 
        // User didn't specify, but usually charts show approved data.
        // Let's show all for now, or maybe color code them.

        const typeTotals = {};
        this.investments.forEach(inv => {
            const type = inv.type.charAt(0).toUpperCase() + inv.type.slice(1);
            typeTotals[type] = (typeTotals[type] || 0) + parseFloat(inv.amount);
        });

        const labels = Object.keys(typeTotals);
        const data = Object.values(typeTotals);

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#e2e8f0' : '#475569';

        this.chart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Investment Amount',
                    data: data,
                    backgroundColor: [
                        'rgba(59, 130, 246, 0.8)',
                        'rgba(16, 185, 129, 0.8)',
                        'rgba(245, 158, 11, 0.8)',
                        'rgba(239, 68, 68, 0.8)',
                        'rgba(139, 92, 246, 0.8)',
                        'rgba(236, 72, 153, 0.8)'
                    ],
                    borderRadius: 8,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            color: textColor,
                            callback: (value) => (window.appCurrency || '₹') + value.toLocaleString()
                        },
                        grid: {
                            color: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'
                        }
                    },
                    x: {
                        ticks: {
                            color: textColor
                        },
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    }

    async renderTable() {
        const tbody = document.getElementById('investmentsBody');
        const emptyState = document.getElementById('investmentsEmptyState');
        const currency = window.appCurrency || '₹';
        const isAdmin = await dataLayer.isAdmin();

        if (!tbody) return;

        if (this.investments.length === 0) {
            tbody.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        tbody.innerHTML = this.investments.map(inv => `
            <tr>
                <td>${inv.item_name}</td>
                <td><span class="badge badge-primary">${inv.type}</span></td>
                <td style="font-weight: 600;">${currency}${parseFloat(inv.amount).toFixed(2)}</td>
                <td>${formatDate(inv.date_bought)}</td>
                <td>${inv.purpose || '-'}</td>
                <td>
                    <span class="badge ${inv.status === 'approved' ? 'badge-success' : (inv.status === 'declined' ? 'badge-danger' : 'badge-warning')}">
                        ${inv.status}
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                         ${inv.status === 'pending' && isAdmin ? `
                            <button class="action-btn edit" onclick="investmentsManager.approve('${inv.id}')" title="Approve">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            </button>
                            <button class="action-btn delete" onclick="investmentsManager.decline('${inv.id}')" title="Decline">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                            </button>
                         ` : ''}
                         <button class="action-btn delete" onclick="investmentsManager.delete('${inv.id}')" title="Delete">
                             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                         </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    renderChart() {
        const ctx = document.getElementById('investmentsChart')?.getContext('2d');
        if (!ctx) return;

        // Destroy previous chart if exists
        if (this.chart) {
            this.chart.destroy();
        }

        if (this.investments.length === 0) return;

        // Group by type
        const typeData = {};
        this.investments.forEach(inv => {
            if (inv.status !== 'declined') { // Include pending and approved
                const amount = parseFloat(inv.amount) || 0;
                typeData[inv.type] = (typeData[inv.type] || 0) + amount;
            }
        });

        const labels = Object.keys(typeData).map(t => t.charAt(0).toUpperCase() + t.slice(1).replace('_', ' '));
        const data = Object.values(typeData);

        // Colors
        const colors = [
            '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'
        ];

        this.chart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            usePointStyle: true,
                            padding: 20
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let label = context.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed !== null) {
                                    label += formatCurrency(context.parsed);
                                }
                                return label;
                            }
                        }
                    }
                },
                cutout: '70%'
            }
        });
    }

    openModal() {
        const modal = document.getElementById('investmentModal');
        const form = document.getElementById('investmentForm');
        form.reset();
        document.getElementById('investmentDate').value = new Date().toISOString().split('T')[0];
        modal.classList.add('active');
    }

    closeModal() {
        document.getElementById('investmentModal').classList.remove('active');
    }

    async saveInvestment() {
        const item = {
            item_name: document.getElementById('investmentItem').value,
            type: document.getElementById('investmentType').value,
            amount: parseFloat(document.getElementById('investmentAmount').value),
            date_bought: document.getElementById('investmentDate').value,
            purpose: document.getElementById('investmentPurpose').value
        };

        try {
            await dataLayer.addInvestment(item);
            showToast('Investment added successfully', 'success');
            this.closeModal();
            this.loadInvestments();
        } catch (error) {
            console.error('Error saving investment:', error);
            showToast('Failed to save investment', 'error');
        }
    }

    async approve(id) {
        if (!confirm('Approve this investment?')) return;
        try {
            await dataLayer.updateInvestmentStatus(id, 'approved');
            showToast('Approved', 'success');
            this.loadInvestments();
        } catch (e) { showToast('Error', 'error'); }
    }

    async decline(id) {
        if (!confirm('Decline this investment?')) return;
        try {
            await dataLayer.updateInvestmentStatus(id, 'declined');
            showToast('Declined', 'success');
            this.loadInvestments();
        } catch (e) { showToast('Error', 'error'); }
    }

    async delete(id) {
        if (!confirm('Delete this investment record?')) return;
        try {
            await dataLayer.deleteInvestment(id);
            showToast('Deleted', 'success');
            this.loadInvestments();
        } catch (e) { showToast('Error', 'error'); }
    }
}

window.investmentsManager = new InvestmentsManager();
