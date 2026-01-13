/**
 * FinanceFlow - Invoice Manager
 * Handles invoice creation, preview, and PDF generation
 */

class InvoiceManager {
    constructor() {
        this.currentInvoice = null;
        this.agencyLogo = null;
    }

    /**
     * Initialize invoice manager
     */
    async init() {
        await this.loadAgencyDetails();
        await this.generateNewInvoiceNumber();
        this.setDefaultDates();
        this.bindEvents();
        await this.renderInvoiceHistory();
    }

    /**
     * Load agency details from settings
     */
    async loadAgencyDetails() {
        const settings = await dataLayer.getAllSettings();

        document.getElementById('invoiceAgencyName').value = settings.agencyName || '';
        document.getElementById('invoiceAgencyContact').value = settings.agencyContact || '';
        document.getElementById('invoiceAgencyAddress').value = settings.agencyAddress || '';

        // Set default tax (0 by default, user can set their own)
        const defaultTax = settings.defaultTax !== undefined ? settings.defaultTax : 0;
        document.getElementById('invoiceTaxPercent').value = defaultTax;
    }

    /**
     * Generate new invoice number
     */
    async generateNewInvoiceNumber() {
        const invoiceNumber = await dataLayer.getNextInvoiceNumber();
        document.getElementById('invoiceNumber').value = invoiceNumber;
    }

    /**
     * Set default dates
     */
    setDefaultDates() {
        const today = new Date();
        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + 30);

        document.getElementById('invoiceDate').value = today.toISOString().split('T')[0];
        document.getElementById('invoiceDueDate').value = dueDate.toISOString().split('T')[0];
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Logo upload
        const logoPreview = document.getElementById('logoPreview');
        const logoInput = document.getElementById('agencyLogo');

        logoPreview.addEventListener('click', () => logoInput.click());
        logoInput.addEventListener('change', (e) => this.handleLogoUpload(e));

        // Add service row
        document.getElementById('addServiceRow').addEventListener('click', () => this.addServiceRow());

        // Remove service row (delegated)
        document.getElementById('servicesBody').addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-service')) {
                this.removeServiceRow(e.target.closest('tr'));
            }
        });

        // Service calculations (delegated)
        document.getElementById('servicesBody').addEventListener('input', (e) => {
            if (e.target.classList.contains('service-qty') || e.target.classList.contains('service-rate')) {
                this.calculateRowAmount(e.target.closest('tr'));
                this.calculateTotals();
            }
        });

        // Tax and discount changes
        document.getElementById('invoiceTaxPercent').addEventListener('input', () => this.calculateTotals());
        document.getElementById('invoiceDiscountPercent').addEventListener('input', () => this.calculateTotals());

        // Preview invoice
        document.getElementById('previewInvoiceBtn').addEventListener('click', () => this.previewInvoice());

        // Download PDF
        document.getElementById('downloadInvoiceBtn').addEventListener('click', () => this.downloadPDF());
        document.getElementById('downloadFromPreviewBtn').addEventListener('click', () => this.downloadPDF());

        // Save invoice
        document.getElementById('invoiceForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveInvoice();
        });

        // Reset invoice
        document.getElementById('resetInvoiceBtn').addEventListener('click', () => this.resetForm());

        // Close preview modal
        document.getElementById('closePreviewModal').addEventListener('click', () => this.closePreviewModal());
        document.getElementById('closePreviewBtn').addEventListener('click', () => this.closePreviewModal());
    }

    /**
     * Handle logo upload
     */
    handleLogoUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            this.agencyLogo = e.target.result;
            const logoPreview = document.getElementById('logoPreview');
            logoPreview.innerHTML = `<img src="${this.agencyLogo}" alt="Agency Logo">`;
        };
        reader.readAsDataURL(file);
    }

    /**
     * Add a new service row
     */
    addServiceRow() {
        const tbody = document.getElementById('servicesBody');
        const row = document.createElement('tr');
        row.className = 'service-row';
        row.innerHTML = `
            <td><input type="text" class="service-name" placeholder="Service name" required></td>
            <td><input type="number" class="service-qty" value="1" min="1" required></td>
            <td><input type="number" class="service-rate" value="0" min="0" step="0.01" required></td>
            <td><span class="service-amount">0.00</span></td>
            <td><button type="button" class="btn-icon remove-service" aria-label="Remove service">×</button></td>
        `;
        tbody.appendChild(row);
    }

    /**
     * Remove a service row
     */
    removeServiceRow(row) {
        const tbody = document.getElementById('servicesBody');
        if (tbody.children.length > 1) {
            row.remove();
            this.calculateTotals();
        } else {
            showToast('At least one service is required', 'warning');
        }
    }

    /**
     * Calculate amount for a service row
     */
    calculateRowAmount(row) {
        const qty = parseFloat(row.querySelector('.service-qty').value) || 0;
        const rate = parseFloat(row.querySelector('.service-rate').value) || 0;
        const amount = qty * rate;
        row.querySelector('.service-amount').textContent = amount.toFixed(2);
    }

    /**
     * Calculate invoice totals
     */
    calculateTotals() {
        const currency = window.appCurrency || '₹';
        const rows = document.querySelectorAll('.service-row');
        let subtotal = 0;

        rows.forEach(row => {
            const amount = parseFloat(row.querySelector('.service-amount').textContent) || 0;
            subtotal += amount;
        });

        const taxPercent = parseFloat(document.getElementById('invoiceTaxPercent').value) || 0;
        const discountPercent = parseFloat(document.getElementById('invoiceDiscountPercent').value) || 0;

        const taxAmount = (subtotal * taxPercent) / 100;
        const discountAmount = (subtotal * discountPercent) / 100;
        const grandTotal = subtotal + taxAmount - discountAmount;

        document.getElementById('invoiceSubtotal').textContent = `${currency}${subtotal.toFixed(2)}`;
        document.getElementById('invoiceTaxAmount').textContent = `${currency}${taxAmount.toFixed(2)}`;
        document.getElementById('invoiceDiscountAmount').textContent = `${currency}${discountAmount.toFixed(2)}`;
        document.getElementById('invoiceGrandTotal').textContent = `${currency}${grandTotal.toFixed(2)}`;
    }

    /**
     * Get invoice data from form
     */
    getInvoiceData() {
        const services = [];
        const rows = document.querySelectorAll('.service-row');

        rows.forEach(row => {
            services.push({
                name: row.querySelector('.service-name').value,
                quantity: parseFloat(row.querySelector('.service-qty').value) || 0,
                rate: parseFloat(row.querySelector('.service-rate').value) || 0,
                amount: parseFloat(row.querySelector('.service-amount').textContent) || 0
            });
        });

        const subtotal = services.reduce((sum, s) => sum + s.amount, 0);
        const taxPercent = parseFloat(document.getElementById('invoiceTaxPercent').value) || 0;
        const discountPercent = parseFloat(document.getElementById('invoiceDiscountPercent').value) || 0;
        const taxAmount = (subtotal * taxPercent) / 100;
        const discountAmount = (subtotal * discountPercent) / 100;
        const grandTotal = subtotal + taxAmount - discountAmount;

        return {
            // Agency details
            agencyLogo: this.agencyLogo,
            agencyName: document.getElementById('invoiceAgencyName').value,
            agencyContact: document.getElementById('invoiceAgencyContact').value,
            agencyAddress: document.getElementById('invoiceAgencyAddress').value,

            // Client details
            clientName: document.getElementById('invoiceClientName').value,
            clientAddress: document.getElementById('invoiceClientAddress').value,

            // Invoice details
            invoiceNumber: document.getElementById('invoiceNumber').value,
            invoiceDate: document.getElementById('invoiceDate').value,
            dueDate: document.getElementById('invoiceDueDate').value,

            // Services
            services,

            // Totals
            subtotal,
            taxPercent,
            taxAmount,
            discountPercent,
            discountAmount,
            grandTotal,

            // Status
            paymentStatus: document.getElementById('invoicePaymentStatus').value
        };
    }

    /**
     * Preview invoice in modal
     */
    previewInvoice() {
        const data = this.getInvoiceData();
        const currency = window.appCurrency || '₹';

        const previewHTML = `
            <div class="invoice-preview">
                <div class="invoice-header-preview">
                    <div class="invoice-agency-preview">
                        ${data.agencyLogo ? `<div class="invoice-logo-preview"><img src="${data.agencyLogo}" alt="Logo"></div>` : ''}
                        <div class="invoice-agency-info-preview">
                            <h2>${data.agencyName || 'Your Agency'}</h2>
                            <p>${data.agencyContact || ''}</p>
                            <p>${(data.agencyAddress || '').replace(/\n/g, '<br>')}</p>
                        </div>
                    </div>
                    <div class="invoice-details-preview">
                        <h1>INVOICE</h1>
                        <p><strong>${data.invoiceNumber}</strong></p>
                        <p>Date: ${formatDate(data.invoiceDate)}</p>
                        <p>Due: ${formatDate(data.dueDate)}</p>
                    </div>
                </div>
                
                <div class="invoice-parties-preview">
                    <div class="invoice-party-preview">
                        <h4>Bill To</h4>
                        <p><strong>${data.clientName || '-'}</strong></p>
                        <p>${(data.clientAddress || '').replace(/\n/g, '<br>')}</p>
                    </div>
                    <div class="invoice-party-preview">
                        <h4>Payment Status</h4>
                        <p><span class="badge badge-${data.paymentStatus}">${data.paymentStatus}</span></p>
                    </div>
                </div>
                
                <div class="invoice-items-preview">
                    <table class="invoice-items-table-preview">
                        <thead>
                            <tr>
                                <th>Service</th>
                                <th>Qty</th>
                                <th>Rate</th>
                                <th>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.services.map(s => `
                                <tr>
                                    <td>${s.name}</td>
                                    <td>${s.quantity}</td>
                                    <td>${currency}${s.rate.toFixed(2)}</td>
                                    <td>${currency}${s.amount.toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                
                <div class="invoice-totals-preview">
                    <table class="invoice-totals-table-preview">
                        <tr>
                            <td>Subtotal</td>
                            <td>${currency}${data.subtotal.toFixed(2)}</td>
                        </tr>
                        ${data.taxPercent > 0 ? `
                            <tr>
                                <td>Tax (${data.taxPercent}%)</td>
                                <td>${currency}${data.taxAmount.toFixed(2)}</td>
                            </tr>
                        ` : ''}
                        ${data.discountPercent > 0 ? `
                            <tr>
                                <td>Discount (${data.discountPercent}%)</td>
                                <td>-${currency}${data.discountAmount.toFixed(2)}</td>
                            </tr>
                        ` : ''}
                        <tr class="grand-total">
                            <td>Grand Total</td>
                            <td>${currency}${data.grandTotal.toFixed(2)}</td>
                        </tr>
                    </table>
                </div>
            </div>
        `;

        document.getElementById('invoicePreviewContent').innerHTML = previewHTML;
        document.getElementById('invoicePreviewModal').classList.add('active');
        this.currentInvoice = data;
    }

    /**
     * Close preview modal
     */
    closePreviewModal() {
        document.getElementById('invoicePreviewModal').classList.remove('active');
    }

    /**
     * Download invoice as PDF - Professional Design
     */
    async downloadPDF() {
        const data = this.currentInvoice || this.getInvoiceData();
        const currency = window.appCurrency || '₹';

        // Use jsPDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // Colors
        const primaryColor = [99, 102, 241]; // Indigo
        const darkColor = [15, 23, 42];
        const grayColor = [100, 116, 139];
        const lightGray = [241, 245, 249];
        const successColor = [16, 185, 129];

        // ===== HEADER SECTION =====
        // Primary color header stripe
        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, pageWidth, 45, 'F');

        // Invoice title
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(28);
        doc.setFont('helvetica', 'bold');
        doc.text('INVOICE', 20, 28);

        // Invoice number badge
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(data.invoiceNumber, 20, 38);

        // Pending stamp on header
        const warningColor = [245, 158, 11]; // Orange/Warning
        doc.setFillColor(...warningColor);
        doc.roundedRect(pageWidth - 60, 15, 45, 20, 3, 3, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('PENDING', pageWidth - 37.5, 28, { align: 'center' });

        // ===== AGENCY & INVOICE DETAILS =====
        let yPos = 60;

        // Agency Name
        doc.setTextColor(...darkColor);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(data.agencyName || 'Your Agency', 20, yPos);

        // Agency Contact & Address
        yPos += 7;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);

        if (data.agencyContact) {
            doc.text(data.agencyContact, 20, yPos);
            yPos += 5;
        }
        if (data.agencyAddress) {
            const addressLines = data.agencyAddress.split('\n');
            addressLines.forEach(line => {
                doc.text(line.trim(), 20, yPos);
                yPos += 5;
            });
        }

        // Invoice details on right side
        let rightY = 60;
        const rightX = pageWidth - 20;

        doc.setTextColor(...grayColor);
        doc.setFontSize(9);
        doc.text('Invoice Date', rightX, rightY, { align: 'right' });
        rightY += 5;
        doc.setTextColor(...darkColor);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(formatDate(data.invoiceDate), rightX, rightY, { align: 'right' });

        rightY += 10;
        doc.setTextColor(...grayColor);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text('Due Date', rightX, rightY, { align: 'right' });
        rightY += 5;
        doc.setTextColor(...darkColor);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(formatDate(data.dueDate), rightX, rightY, { align: 'right' });

        // ===== BILL TO SECTION =====
        yPos = Math.max(yPos, rightY) + 15;

        // Section divider
        doc.setDrawColor(...lightGray);
        doc.setLineWidth(0.5);
        doc.line(20, yPos, pageWidth - 20, yPos);

        yPos += 15;

        // Bill To label
        doc.setFillColor(...lightGray);
        doc.roundedRect(20, yPos - 5, 45, 14, 2, 2, 'F');
        doc.setTextColor(...primaryColor);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('BILL TO', 25, yPos + 4);

        yPos += 20;

        // Client Name
        doc.setTextColor(...darkColor);
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text(data.clientName || '-', 20, yPos);

        yPos += 6;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...grayColor);

        if (data.clientAddress) {
            const clientLines = data.clientAddress.split('\n');
            clientLines.forEach(line => {
                doc.text(line.trim(), 20, yPos);
                yPos += 5;
            });
        }

        // ===== SERVICES TABLE =====
        yPos += 10;

        const tableData = data.services.map((s, index) => [
            (index + 1).toString(),
            s.name,
            s.quantity.toString(),
            `${currency}${s.rate.toFixed(2)}`,
            `${currency}${s.amount.toFixed(2)}`
        ]);

        doc.autoTable({
            startY: yPos,
            head: [['#', 'Service Description', 'Qty', 'Rate', 'Amount']],
            body: tableData,
            theme: 'plain',
            headStyles: {
                fillColor: [...primaryColor],
                textColor: 255,
                fontStyle: 'bold',
                fontSize: 10,
                cellPadding: 6
            },
            bodyStyles: {
                fontSize: 10,
                cellPadding: 6,
                textColor: [...darkColor]
            },
            alternateRowStyles: {
                fillColor: [...lightGray]
            },
            columnStyles: {
                0: { cellWidth: 15, halign: 'center' },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 20, halign: 'center' },
                3: { cellWidth: 30, halign: 'right' },
                4: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
            },
            margin: { left: 20, right: 20 },
            tableLineColor: [...lightGray],
            tableLineWidth: 0.1
        });

        // ===== TOTALS SECTION =====
        let totalsY = doc.lastAutoTable.finalY + 15;
        const totalsBoxX = pageWidth - 100;
        const totalsBoxWidth = 80;

        // Totals background box
        const totalsHeight = data.taxPercent > 0 && data.discountPercent > 0 ? 70 :
            (data.taxPercent > 0 || data.discountPercent > 0 ? 58 : 45);
        doc.setFillColor(250, 250, 252);
        doc.roundedRect(totalsBoxX, totalsY - 5, totalsBoxWidth, totalsHeight, 3, 3, 'F');

        // Subtotal
        doc.setFontSize(10);
        doc.setTextColor(...grayColor);
        doc.setFont('helvetica', 'normal');
        doc.text('Subtotal', totalsBoxX + 5, totalsY + 5);
        doc.setTextColor(...darkColor);
        doc.text(`${currency}${data.subtotal.toFixed(2)}`, totalsBoxX + totalsBoxWidth - 5, totalsY + 5, { align: 'right' });

        totalsY += 12;

        // Tax (if applicable)
        if (data.taxPercent > 0) {
            doc.setTextColor(...grayColor);
            doc.text(`Tax (${data.taxPercent}%)`, totalsBoxX + 5, totalsY + 5);
            doc.setTextColor(...darkColor);
            doc.text(`${currency}${data.taxAmount.toFixed(2)}`, totalsBoxX + totalsBoxWidth - 5, totalsY + 5, { align: 'right' });
            totalsY += 12;
        }

        // Discount (if applicable)
        if (data.discountPercent > 0) {
            doc.setTextColor(...grayColor);
            doc.text(`Discount (${data.discountPercent}%)`, totalsBoxX + 5, totalsY + 5);
            doc.setTextColor(...successColor);
            doc.text(`-${currency}${data.discountAmount.toFixed(2)}`, totalsBoxX + totalsBoxWidth - 5, totalsY + 5, { align: 'right' });
            totalsY += 12;
        }

        // Grand Total divider
        doc.setDrawColor(...primaryColor);
        doc.setLineWidth(0.5);
        doc.line(totalsBoxX + 5, totalsY + 2, totalsBoxX + totalsBoxWidth - 5, totalsY + 2);
        totalsY += 10;

        // Grand Total
        doc.setFillColor(...primaryColor);
        doc.roundedRect(totalsBoxX, totalsY - 3, totalsBoxWidth, 18, 3, 3, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('TOTAL', totalsBoxX + 8, totalsY + 8);
        doc.setFontSize(13);
        doc.text(`${currency}${data.grandTotal.toFixed(2)}`, totalsBoxX + totalsBoxWidth - 8, totalsY + 8, { align: 'right' });

        // ===== FOOTER SECTION =====
        // Thank you note
        const footerY = pageHeight - 40;

        doc.setFillColor(...lightGray);
        doc.rect(0, footerY - 10, pageWidth, 50, 'F');

        doc.setTextColor(...darkColor);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Thank you for your business!', 20, footerY + 5);

        doc.setTextColor(...grayColor);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text('Payment is due within 30 days. Please include the invoice number with your payment.', 20, footerY + 15);

        // Generated by
        doc.setFontSize(8);
        doc.text(`Generated on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
            pageWidth - 20, footerY + 25, { align: 'right' });

        // Save PDF
        doc.save(`${data.invoiceNumber}.pdf`);
        showToast('Invoice PDF downloaded successfully', 'success');
    }

    /**
     * Save invoice to database
     */
    async saveInvoice() {
        const data = this.getInvoiceData();

        // Validate
        if (!data.clientName) {
            showToast('Please enter client name', 'error');
            return;
        }

        if (data.services.length === 0 || !data.services[0].name) {
            showToast('Please add at least one service', 'error');
            return;
        }

        try {
            await dataLayer.addInvoice(data);

            // Create finance entry if needed
            if (data.grandTotal > 0) {
                await dataLayer.addEntry({
                    date: data.invoiceDate,
                    clientName: data.clientName,
                    description: `Invoice ${data.invoiceNumber}`,
                    amount: data.grandTotal,
                    type: 'income',
                    status: data.paymentStatus === 'paid' ? 'received' : 'pending',
                    paymentMode: 'bank_transfer'
                });
            }

            showToast('Invoice saved successfully', 'success');
            await this.renderInvoiceHistory();
            this.resetForm();

            // Update charts
            if (typeof chartsManager !== 'undefined') {
                chartsManager.updateAllCharts();
            }
        } catch (error) {
            console.error('Error saving invoice:', error);
            showToast('Failed to save invoice', 'error');
        }
    }

    /**
     * Reset the invoice form
     */
    async resetForm() {
        document.getElementById('invoiceForm').reset();
        this.agencyLogo = null;
        document.getElementById('logoPreview').innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="M21 15l-5-5L5 21"/>
            </svg>
            <span>Upload Logo</span>
        `;

        // Reset services to single row
        const tbody = document.getElementById('servicesBody');
        tbody.innerHTML = `
            <tr class="service-row">
                <td><input type="text" class="service-name" placeholder="Service name" required></td>
                <td><input type="number" class="service-qty" value="1" min="1" required></td>
                <td><input type="number" class="service-rate" value="0" min="0" step="0.01" required></td>
                <td><span class="service-amount">0.00</span></td>
                <td><button type="button" class="btn-icon remove-service" aria-label="Remove service">×</button></td>
            </tr>
        `;

        await this.loadAgencyDetails();
        await this.generateNewInvoiceNumber();
        this.setDefaultDates();
        this.calculateTotals();
    }

    /**
     * Render invoice history
     */
    async renderInvoiceHistory() {
        const invoices = await dataLayer.getAllInvoices();
        const container = document.getElementById('invoiceHistoryList');
        const emptyState = document.getElementById('invoicesEmptyState');
        const currency = window.appCurrency || '₹';

        if (invoices.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';
        container.innerHTML = invoices.map(inv => `
            <div class="invoice-history-item" data-id="${inv.id}">
                <div class="invoice-history-item-header">
                    <strong>${inv.invoiceNumber}</strong>
                    <span class="badge badge-${inv.paymentStatus}">${inv.paymentStatus}</span>
                </div>
                <div class="invoice-history-item-body">
                    <div>${inv.clientName}</div>
                    <div>${formatDate(inv.invoiceDate)} • ${currency}${inv.grandTotal.toFixed(2)}</div>
                </div>
                <div class="invoice-history-actions">
                    <button class="btn btn-sm btn-secondary view-invoice" data-id="${inv.id}">View</button>
                    <button class="btn btn-sm btn-danger delete-invoice" data-id="${inv.id}">Delete</button>
                </div>
            </div>
        `).join('');

        // Bind view/delete events
        container.querySelectorAll('.view-invoice').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.viewInvoice(parseInt(btn.dataset.id));
            });
        });

        container.querySelectorAll('.delete-invoice').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteInvoice(parseInt(btn.dataset.id));
            });
        });
    }

    /**
     * View a saved invoice
     */
    async viewInvoice(id) {
        const invoice = await dataLayer.getInvoice(id);
        if (!invoice) return;

        this.currentInvoice = invoice;

        const currency = window.appCurrency || '₹';
        const previewHTML = `
            <div class="invoice-preview">
                <div class="invoice-header-preview">
                    <div class="invoice-agency-preview">
                        ${invoice.agencyLogo ? `<div class="invoice-logo-preview"><img src="${invoice.agencyLogo}" alt="Logo"></div>` : ''}
                        <div class="invoice-agency-info-preview">
                            <h2>${invoice.agencyName || 'Your Agency'}</h2>
                            <p>${invoice.agencyContact || ''}</p>
                            <p>${(invoice.agencyAddress || '').replace(/\n/g, '<br>')}</p>
                        </div>
                    </div>
                    <div class="invoice-details-preview">
                        <h1>INVOICE</h1>
                        <p><strong>${invoice.invoiceNumber}</strong></p>
                        <p>Date: ${formatDate(invoice.invoiceDate)}</p>
                        <p>Due: ${formatDate(invoice.dueDate)}</p>
                    </div>
                </div>
                
                <div class="invoice-parties-preview">
                    <div class="invoice-party-preview">
                        <h4>Bill To</h4>
                        <p><strong>${invoice.clientName || '-'}</strong></p>
                        <p>${(invoice.clientAddress || '').replace(/\n/g, '<br>')}</p>
                    </div>
                    <div class="invoice-party-preview">
                        <h4>Payment Status</h4>
                        <p><span class="badge badge-${invoice.paymentStatus}">${invoice.paymentStatus}</span></p>
                    </div>
                </div>
                
                <div class="invoice-items-preview">
                    <table class="invoice-items-table-preview">
                        <thead>
                            <tr>
                                <th>Service</th>
                                <th>Qty</th>
                                <th>Rate</th>
                                <th>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${invoice.services.map(s => `
                                <tr>
                                    <td>${s.name}</td>
                                    <td>${s.quantity}</td>
                                    <td>${currency}${s.rate.toFixed(2)}</td>
                                    <td>${currency}${s.amount.toFixed(2)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                
                <div class="invoice-totals-preview">
                    <table class="invoice-totals-table-preview">
                        <tr>
                            <td>Subtotal</td>
                            <td>${currency}${invoice.subtotal.toFixed(2)}</td>
                        </tr>
                        ${invoice.taxPercent > 0 ? `
                            <tr>
                                <td>Tax (${invoice.taxPercent}%)</td>
                                <td>${currency}${invoice.taxAmount.toFixed(2)}</td>
                            </tr>
                        ` : ''}
                        ${invoice.discountPercent > 0 ? `
                            <tr>
                                <td>Discount (${invoice.discountPercent}%)</td>
                                <td>-${currency}${invoice.discountAmount.toFixed(2)}</td>
                            </tr>
                        ` : ''}
                        <tr class="grand-total">
                            <td>Grand Total</td>
                            <td>${currency}${invoice.grandTotal.toFixed(2)}</td>
                        </tr>
                    </table>
                </div>
            </div>
        `;

        document.getElementById('invoicePreviewContent').innerHTML = previewHTML;
        document.getElementById('invoicePreviewModal').classList.add('active');
    }

    /**
     * Delete an invoice
     */
    async deleteInvoice(id) {
        if (!confirm('Are you sure you want to delete this invoice?')) return;

        try {
            await dataLayer.deleteInvoice(id);
            showToast('Invoice deleted', 'success');
            await this.renderInvoiceHistory();
        } catch (error) {
            console.error('Error deleting invoice:', error);
            showToast('Failed to delete invoice', 'error');
        }
    }
}

// Create and export singleton instance
const invoiceManager = new InvoiceManager();
