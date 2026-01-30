/**
 * FinanceFlow - Charts Manager
 * Handles all Chart.js visualizations
 */

class ChartsManager {
    constructor() {
        this.charts = {};
        this.chartColors = {
            primary: '#6366f1',
            primaryLight: 'rgba(99, 102, 241, 0.2)',
            success: '#10b981',
            successLight: 'rgba(16, 185, 129, 0.2)',
            danger: '#ef4444',
            dangerLight: 'rgba(239, 68, 68, 0.2)',
            warning: '#f59e0b',
            warningLight: 'rgba(245, 158, 11, 0.2)',
            info: '#06b6d4',
            infoLight: 'rgba(6, 182, 212, 0.2)',
            purple: '#8b5cf6',
            purpleLight: 'rgba(139, 92, 246, 0.2)',
            pink: '#ec4899',
            pinkLight: 'rgba(236, 72, 153, 0.2)'
        };

        this.months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    }

    /**
     * Get chart colors based on current theme
     */
    getThemeColors() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        return {
            textColor: isDark ? '#cbd5e1' : '#475569',
            gridColor: isDark ? 'rgba(71, 85, 105, 0.3)' : 'rgba(226, 232, 240, 0.8)',
            bgColor: isDark ? '#1e293b' : '#ffffff'
        };
    }

    /**
     * Initialize all charts
     */
    async init() {
        // Check if Chart.js is loaded
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js library is not loaded. Analytics visualizations will be disabled.');
            return;
        }

        // Set Chart.js defaults
        Chart.defaults.font.family = "'Inter', sans-serif";
        Chart.defaults.responsive = true;
        Chart.defaults.maintainAspectRatio = false;

        this.bindChartEvents();
        await this.renderAllCharts();
    }

    /**
     * Bind events for dynamic charts
     */
    bindChartEvents() {
        const growthViewMode = document.getElementById('growthViewMode');
        const growthYearSelect = document.getElementById('growthYearSelect');
        const growthMonthSelect = document.getElementById('growthMonthSelect');

        if (growthViewMode) {
            growthViewMode.addEventListener('change', (e) => {
                const mode = e.target.value;
                growthYearSelect.classList.toggle('hidden', mode === 'yearly');
                growthMonthSelect.classList.toggle('hidden', mode !== 'daily');
                this.renderRevenueGrowthChart();
            });
        }

        if (growthYearSelect) {
            growthYearSelect.addEventListener('change', () => this.renderRevenueGrowthChart());
        }

        if (growthMonthSelect) {
            growthMonthSelect.addEventListener('change', () => this.renderRevenueGrowthChart());
        }
    }

    /**
     * Render all charts with current data
     */
    async renderAllCharts() {
        const currentYear = new Date().getFullYear();

        await Promise.all([
            this.renderDashboardBarChart(currentYear),
            this.renderDashboardPieChart(),
            this.renderMonthlyBarChart(currentYear),
            this.renderStatusPieChart(),
            this.renderPaymentDonutChart(),
            this.renderRevenueGrowthChart()
        ]);
    }

    /**
     * Update all charts (call after data changes)
     */
    async updateAllCharts() {
        await this.renderAllCharts();
    }

    /**
     * Dashboard Bar Chart - Monthly Income vs Expense (compact)
     */
    async renderDashboardBarChart(year) {
        const ctx = document.getElementById('dashboardBarChart');
        if (!ctx) return;

        const monthlyData = await dataLayer.getMonthlyData(year);
        const themeColors = this.getThemeColors();

        // Destroy existing chart
        if (this.charts.dashboardBar) {
            this.charts.dashboardBar.destroy();
        }

        this.charts.dashboardBar = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: this.months,
                datasets: [
                    {
                        label: 'Income',
                        data: monthlyData.map(m => m.income),
                        backgroundColor: this.chartColors.success,
                        borderRadius: 4,
                        barThickness: 12
                    },
                    {
                        label: 'Expense',
                        data: monthlyData.map(m => m.expense),
                        backgroundColor: this.chartColors.danger,
                        borderRadius: 4,
                        barThickness: 12
                    }
                ]
            },
            options: {
                plugins: {
                    legend: {
                        position: 'top',
                        align: 'end',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'circle',
                            color: themeColors.textColor,
                            padding: 20
                        }
                    },
                    tooltip: {
                        backgroundColor: themeColors.bgColor,
                        titleColor: themeColors.textColor,
                        bodyColor: themeColors.textColor,
                        borderColor: this.chartColors.primary,
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: function (context) {
                                return `${context.dataset.label}: ₹${context.raw.toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: themeColors.textColor }
                    },
                    y: {
                        grid: { color: themeColors.gridColor },
                        ticks: {
                            color: themeColors.textColor,
                            callback: function (value) {
                                return '₹' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Dashboard Pie Chart - Payment Status (compact)
     */
    async renderDashboardPieChart() {
        const ctx = document.getElementById('dashboardPieChart');
        if (!ctx) return;

        const statusData = await dataLayer.getStatusDistribution();
        const themeColors = this.getThemeColors();

        // Destroy existing chart
        if (this.charts.dashboardPie) {
            this.charts.dashboardPie.destroy();
        }

        this.charts.dashboardPie = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Received', 'Pending'],
                datasets: [{
                    data: [statusData.received, statusData.pending],
                    backgroundColor: [this.chartColors.success, this.chartColors.warning],
                    borderWidth: 0,
                    spacing: 2
                }]
            },
            options: {
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'circle',
                            color: themeColors.textColor,
                            padding: 15,
                            boxWidth: 8
                        }
                    },
                    tooltip: {
                        backgroundColor: themeColors.bgColor,
                        titleColor: themeColors.textColor,
                        bodyColor: themeColors.textColor,
                        borderColor: this.chartColors.primary,
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: function (context) {
                                return `${context.label}: ₹${context.raw.toLocaleString()}`;
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Analytics - Monthly Income vs Expense Bar Chart
     */
    async renderMonthlyBarChart(year) {
        const ctx = document.getElementById('monthlyBarChart');
        if (!ctx) return;

        const monthlyData = await dataLayer.getMonthlyData(year);
        const themeColors = this.getThemeColors();

        // Destroy existing chart
        if (this.charts.monthlyBar) {
            this.charts.monthlyBar.destroy();
        }

        this.charts.monthlyBar = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: this.months,
                datasets: [
                    {
                        label: 'Income',
                        data: monthlyData.map(m => m.income),
                        backgroundColor: this.createGradient(ctx, this.chartColors.success, this.chartColors.successLight),
                        borderColor: this.chartColors.success,
                        borderWidth: 2,
                        borderRadius: 6,
                        barThickness: 20
                    },
                    {
                        label: 'Expense',
                        data: monthlyData.map(m => m.expense),
                        backgroundColor: this.createGradient(ctx, this.chartColors.danger, this.chartColors.dangerLight),
                        borderColor: this.chartColors.danger,
                        borderWidth: 2,
                        borderRadius: 6,
                        barThickness: 20
                    }
                ]
            },
            options: {
                plugins: {
                    legend: {
                        position: 'top',
                        align: 'end',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'circle',
                            color: themeColors.textColor,
                            padding: 20,
                            font: { weight: 500 }
                        }
                    },
                    tooltip: {
                        backgroundColor: themeColors.bgColor,
                        titleColor: themeColors.textColor,
                        bodyColor: themeColors.textColor,
                        borderColor: this.chartColors.primary,
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: function (context) {
                                return `${context.dataset.label}: ₹${context.raw.toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: themeColors.textColor, font: { weight: 500 } }
                    },
                    y: {
                        grid: { color: themeColors.gridColor },
                        ticks: {
                            color: themeColors.textColor,
                            callback: function (value) {
                                return '₹' + value.toLocaleString();
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Analytics - Pending vs Received Pie Chart
     */
    async renderStatusPieChart() {
        const ctx = document.getElementById('statusPieChart');
        if (!ctx) return;

        const statusData = await dataLayer.getStatusDistribution();
        const themeColors = this.getThemeColors();

        // Destroy existing chart
        if (this.charts.statusPie) {
            this.charts.statusPie.destroy();
        }

        const total = statusData.received + statusData.pending;
        const receivedPercent = total > 0 ? ((statusData.received / total) * 100).toFixed(1) : 0;
        const pendingPercent = total > 0 ? ((statusData.pending / total) * 100).toFixed(1) : 0;

        this.charts.statusPie = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: [`Received (${receivedPercent}%)`, `Pending (${pendingPercent}%)`],
                datasets: [{
                    data: [statusData.received, statusData.pending],
                    backgroundColor: [this.chartColors.success, this.chartColors.warning],
                    borderWidth: 0,
                    hoverOffset: 10
                }]
            },
            options: {
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'circle',
                            color: themeColors.textColor,
                            padding: 15
                        }
                    },
                    tooltip: {
                        backgroundColor: themeColors.bgColor,
                        titleColor: themeColors.textColor,
                        bodyColor: themeColors.textColor,
                        borderColor: this.chartColors.primary,
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: function (context) {
                                return `₹${context.raw.toLocaleString()}`;
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Analytics - Payment Mode Distribution Donut Chart
     */
    async renderPaymentDonutChart() {
        const ctx = document.getElementById('paymentDonutChart');
        if (!ctx) return;

        const paymentData = await dataLayer.getPaymentModeDistribution();
        const themeColors = this.getThemeColors();

        // Destroy existing chart
        if (this.charts.paymentDonut) {
            this.charts.paymentDonut.destroy();
        }

        const labels = Object.keys(paymentData).map(formatPaymentMode);
        const values = Object.values(paymentData);
        const colors = [
            this.chartColors.primary,
            this.chartColors.success,
            this.chartColors.warning,
            this.chartColors.info,
            this.chartColors.purple,
            this.chartColors.pink
        ];

        this.charts.paymentDonut = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 0,
                    spacing: 3
                }]
            },
            options: {
                cutout: '60%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'circle',
                            color: themeColors.textColor,
                            padding: 10,
                            font: { size: 11 }
                        }
                    },
                    tooltip: {
                        backgroundColor: themeColors.bgColor,
                        titleColor: themeColors.textColor,
                        bodyColor: themeColors.textColor,
                        borderColor: this.chartColors.primary,
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: function (context) {
                                return `${context.label}: ₹${context.raw.toLocaleString()}`;
                            }
                        }
                    }
                }
            }
        });
    }

    /**
     * Analytics - Revenue Growth Line Chart (Multi-View: Yearly, Monthly, Daily)
     */
    async renderRevenueGrowthChart() {
        const ctx = document.getElementById('yearLineChart');
        if (!ctx) return;

        const viewMode = document.getElementById('growthViewMode')?.value || 'yearly';
        const year = document.getElementById('growthYearSelect')?.value || new Date().getFullYear();
        const month = document.getElementById('growthMonthSelect')?.value || new Date().getMonth();

        const themeColors = this.getThemeColors();

        // Destroy existing chart
        if (this.charts.revenueGrowth) {
            this.charts.revenueGrowth.destroy();
        }

        let labels = [];
        let incomeData = [];
        let expenseData = [];
        let profitData = [];

        if (viewMode === 'yearly') {
            const yearlyData = await dataLayer.getYearlyRevenue();
            const years = Object.keys(yearlyData).sort();
            labels = years;
            incomeData = years.map(y => yearlyData[y].income);
            expenseData = years.map(y => yearlyData[y].expense);
            profitData = years.map(y => yearlyData[y].income - yearlyData[y].expense);
        } else if (viewMode === 'monthly') {
            const monthlyData = await dataLayer.getMonthlyData(year);
            labels = this.months;
            incomeData = monthlyData.map(m => m.income);
            expenseData = monthlyData.map(m => m.expense);
            profitData = monthlyData.map(m => m.income - m.expense);
        } else if (viewMode === 'daily') {
            const dailyData = await dataLayer.getDailyData(year, month);
            labels = dailyData.map((_, i) => (i + 1).toString());
            incomeData = dailyData.map(d => d.income);
            expenseData = dailyData.map(d => d.expense);
            profitData = dailyData.map(d => d.income - d.expense);
        }

        this.charts.revenueGrowth = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Income',
                        data: incomeData,
                        borderColor: this.chartColors.success,
                        backgroundColor: this.chartColors.successLight,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: this.chartColors.success
                    },
                    {
                        label: 'Expenses',
                        data: expenseData,
                        borderColor: this.chartColors.danger,
                        backgroundColor: this.chartColors.dangerLight,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: this.chartColors.danger
                    },
                    {
                        label: 'Net Profit',
                        data: profitData,
                        borderColor: this.chartColors.primary,
                        backgroundColor: this.chartColors.primaryLight,
                        fill: false,
                        tension: 0.4,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        pointBackgroundColor: this.chartColors.primary,
                        borderDash: [5, 5]
                    }
                ]
            },
            options: {
                plugins: {
                    legend: {
                        position: 'top',
                        align: 'end',
                        labels: {
                            usePointStyle: true,
                            pointStyle: 'circle',
                            color: themeColors.textColor,
                            padding: 20
                        }
                    },
                    tooltip: {
                        backgroundColor: themeColors.bgColor,
                        titleColor: themeColors.textColor,
                        bodyColor: themeColors.textColor,
                        borderColor: this.chartColors.primary,
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        mode: 'index',
                        intersect: false,
                        callbacks: {
                            label: function (context) {
                                return `${context.dataset.label}: ₹${context.raw.toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: themeColors.textColor }
                    },
                    y: {
                        grid: { color: themeColors.gridColor },
                        ticks: {
                            color: themeColors.textColor,
                            callback: function (value) {
                                return '₹' + value.toLocaleString();
                            }
                        }
                    }
                },
                interaction: {
                    mode: 'nearest',
                    axis: 'x',
                    intersect: false
                }
            }
        });
    }

    /**
     * Create gradient for bars
     */
    createGradient(ctx, color1, color2) {
        const canvas = ctx.getContext ? ctx : ctx.canvas;
        const context = canvas.getContext ? canvas.getContext('2d') : ctx;
        const gradient = context.createLinearGradient(0, 0, 0, 300);
        gradient.addColorStop(0, color1);
        gradient.addColorStop(1, color2);
        return gradient;
    }

    /**
     * Handle theme change - update chart colors
     */
    onThemeChange() {
        this.updateAllCharts();
    }

    /**
     * Handle year selection change
     */
    async onYearChange(year, chartType) {
        if (chartType === 'dashboard') {
            await this.renderDashboardBarChart(year);
        } else if (chartType === 'analytics') {
            await this.renderMonthlyBarChart(year);
        }
    }
}

// Create and export singleton instance
const chartsManager = new ChartsManager();
