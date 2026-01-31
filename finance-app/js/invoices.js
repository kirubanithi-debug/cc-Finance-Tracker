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

        // Check permissions
        const isAdmin = await dataLayer.isAdmin();

        // Make agency details read-only for employees instead of hiding them
        const agencySection = document.getElementById('invoiceAgencySection') ||
            document.querySelector('.invoice-form-section .form-section:first-of-type');

        if (agencySection) {
            // Always ensure it is visible (reversing any previous 'none' settings)
            agencySection.style.display = 'block';

            if (!isAdmin) {
                agencySection.querySelectorAll('input, textarea').forEach(input => {
                    input.readOnly = true;
                    input.style.backgroundColor = 'var(--color-bg-secondary)';
                    input.style.cursor = 'not-allowed';
                });

                const logoPreview = agencySection.querySelector('.logo-preview');
                if (logoPreview) {
                    logoPreview.style.cursor = 'default';
                    const uploadText = logoPreview.querySelector('span');
                    if (uploadText) uploadText.textContent = 'Agency Logo';
                }
            } else {
                // For admin, ensure it's editable (if reset didn't do it)
                agencySection.querySelectorAll('input, textarea').forEach(input => {
                    input.readOnly = false;
                    input.style.backgroundColor = '';
                    input.style.cursor = '';
                });
            }
        }

        // Automatically fill the "Created By" name from the user's profile
        const nameInput = document.getElementById('invoiceLoginName');
        if (nameInput) {
            // Priority 1: Current profile name if loaded
            if (window.profileManager && window.profileManager.currentUser && window.profileManager.currentUser.name && window.profileManager.currentUser.name !== 'User') {
                nameInput.value = window.profileManager.currentUser.name;
            }
            // Priority 2: Stored user profile from localStorage
            else {
                const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
                if (storedUser.name && storedUser.name !== 'User') {
                    nameInput.value = storedUser.name;
                }
                // Priority 3: Fallback to last manually entered name
                else {
                    const savedName = localStorage.getItem('lastLoginName') || '';
                    nameInput.value = savedName;
                }
            }
        }
    }

    /**
     * Load agency details from settings
     */
    /**
     * Load agency details from settings
     */
    async loadAgencyDetails() {
        let settings = {};
        try {
            // Use getAllSettings - it now intelligently fetches Admin settings for employees
            settings = await dataLayer.getAllSettings();
        } catch (e) {
            console.warn('Failed to load agency settings', e);
        }

        settings = settings || {};

        // Store for later use (e.g. when saving invoice if fields are hidden/empty)
        this.agencySettings = settings;

        // Populate fields (even if hidden, so value is there)
        const nameField = document.getElementById('invoiceAgencyName');
        const contactField = document.getElementById('invoiceAgencyContact');
        const addressField = document.getElementById('invoiceAgencyAddress');

        if (nameField) nameField.value = settings.agencyName || '';
        if (contactField) contactField.value = settings.agencyContact || '';
        if (addressField) addressField.value = settings.agencyAddress || '';

        // If employee, these fields might be hidden, so we ensure the instance 
        // has these values stored to inject into the invoice payload if needed.
        if (settings.agencyLogo) {
            this.agencyLogo = settings.agencyLogo;
            const logoPreview = document.getElementById('logoPreview');
            if (logoPreview) logoPreview.innerHTML = `<img src="${this.agencyLogo}" alt="Agency Logo">`;
        }

        // Set default tax (0 by default, user can set their own)
        const defaultTax = settings.defaultTax !== undefined ? settings.defaultTax : 0;
        const taxField = document.getElementById('invoiceTaxPercent');
        if (taxField) taxField.value = defaultTax;
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
        dueDate.setDate(dueDate.getDate() + 3); // Due Date is Today + 3 Days

        document.getElementById('invoiceDate').value = today.toISOString().split('T')[0];
        document.getElementById('invoiceDueDate').value = dueDate.toISOString().split('T')[0];
    }

    // ... (rest of bindEvents etc) ...

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

        let loginName = '';
        // Prioritize name from Profile Manager if available
        if (window.profileManager && window.profileManager.currentUser && window.profileManager.currentUser.name && window.profileManager.currentUser.name !== 'User') {
            loginName = window.profileManager.currentUser.name;
        } else {
            // Fallback to manual input
            loginName = document.getElementById('invoiceLoginName').value.trim();
        }

        if (!loginName) {
            showToast('Please enter your name', 'error');
            return;
        }

        // Save name for next time
        localStorage.setItem('lastLoginName', loginName);

        // Determine Role Label
        const role = await dataLayer.getCurrentUserRole();
        const roleLabel = role === 'admin' ? 'Admin' : 'Employee';
        const formattedCreatedBy = `${roleLabel} - ${loginName}`;

        // Add created_by_name to invoice data object for saving
        data.created_by_name = formattedCreatedBy;

        try {
            console.log('Sending invoice to dataLayer:', data);
            const savedInvoice = await dataLayer.addInvoice(data);
            console.log('Invoice saved:', savedInvoice);

            // Create finance entry if needed
            if (data.grandTotal > 0) {
                console.log('Creating finance entry for invoice...');
                await dataLayer.addEntry({
                    date: data.invoiceDate,
                    clientName: data.clientName,
                    description: `Invoice ${data.invoiceNumber}`,
                    amount: data.grandTotal,
                    type: 'income',
                    status: data.paymentStatus === 'paid' ? 'received' : 'pending',
                    paymentMode: 'bank_transfer',
                    created_by_name: formattedCreatedBy
                });
                console.log('Finance entry created.');
            }

            showToast('Invoice saved successfully', 'success');
            await this.renderInvoiceHistory();
            this.resetForm();

            // Restore name after reset
            document.getElementById('invoiceLoginName').value = loginName;

            if (typeof chartsManager !== 'undefined') {
                chartsManager.updateAllCharts();
            }
        } catch (error) {
            console.error('CRITICAL: Error saving invoice sequence:', error);
            showToast(`Failed to save: ${error.message || 'Unknown error'}`, 'error');
        }
    }

    /**
     * Bind event listeners
     */
    bindEvents() {
        // Logo upload
        const logoPreview = document.getElementById('logoPreview');
        const logoInput = document.getElementById('agencyLogo');

        logoPreview.addEventListener('click', async () => {
            const isAdmin = await dataLayer.isAdmin();
            if (isAdmin) {
                logoInput.click();
            } else {
                showToast('Only admins can change agency logo', 'info');
            }
        });
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

        // Import invoices
        const importBtn = document.getElementById('importInvoicesBtn');
        const importInput = document.getElementById('importInvoicesInput');

        if (importBtn && importInput) {
            importBtn.addEventListener('click', () => importInput.click());
            importInput.addEventListener('change', (e) => this.handleImportInvoices(e));
        }

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

        // Use form values, fallback to loaded settings (for employees where fields are hidden)
        const settings = this.agencySettings || {};

        return {
            // Agency details
            agencyLogo: this.agencyLogo || settings.agencyLogo,
            agencyName: document.getElementById('invoiceAgencyName').value || settings.agencyName,
            agencyContact: document.getElementById('invoiceAgencyContact').value || settings.agencyContact,
            agencyAddress: document.getElementById('invoiceAgencyAddress').value || settings.agencyAddress,

            // Client details
            clientName: document.getElementById('invoiceClientName').value,
            clientEmail: document.getElementById('invoiceClientEmail').value,
            clientAddress: document.getElementById('invoiceClientAddress').value,

            // Invoice details
            invoiceNumber: document.getElementById('invoiceNumber').value,
            invoiceDate: document.getElementById('invoiceDate').value,
            dueDate: document.getElementById('invoiceDueDate').value,
            paymentStatus: document.getElementById('invoicePaymentStatus')?.value || 'pending',
            clientId: document.getElementById('invoiceClientSelect')?.value || null,

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
            paymentStatus: document.getElementById('invoicePaymentStatus').value,
            created_by_name: document.getElementById('invoiceLoginName')?.value || 'Admin'
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
                    <h4>Invoice Info</h4>
                    <p><strong>Issued By:</strong> ${data.created_by_name || 'Admin'}</p>
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
        const appCurrency = window.appCurrency || '₹';
        // Fix for standard fonts not supporting ₹ symbol in PDF
        const currency = appCurrency === '₹' ? 'Rs. ' : appCurrency;

        // Use jsPDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // Colors
        const primaryColor = [99, 102, 241]; // Indigo (Process Blue)
        const darkColor = [15, 23, 42];      // Slate 900
        const grayColor = [100, 116, 139];   // Slate 500
        const lightGray = [241, 245, 249];   // Slate 100
        const dividerColor = [226, 232, 240]; // Slate 200

        // Helper to format date
        const formatDate = (dateStr) => {
            if (!dateStr) return '';
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        };

        // ================= HEADER SECTION =================
        let yPos = 20;

        // 1. Top Left: Agency Name & Details
        doc.setTextColor(...darkColor);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text(data.agencyName || 'Your Agency', 20, yPos);

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

        // 2. Top Right: INVOICE Label & Details
        let rightY = 20;
        doc.setTextColor(...primaryColor);
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('INVOICE', pageWidth - 20, rightY, { align: 'right' });

        rightY += 8;
        doc.setTextColor(...darkColor);
        doc.setFontSize(11);
        doc.text(data.invoiceNumber, pageWidth - 20, rightY, { align: 'right' });

        rightY += 6;
        doc.setFontSize(9);
        doc.setTextColor(...grayColor);
        doc.setFont('helvetica', 'normal');
        doc.text(`Date: ${formatDate(data.invoiceDate)}`, pageWidth - 20, rightY, { align: 'right' });

        rightY += 5;
        doc.text(`Due: ${formatDate(data.dueDate)}`, pageWidth - 20, rightY, { align: 'right' });

        // ================= DIVIDER =================
        yPos = Math.max(yPos, rightY) + 15;
        doc.setDrawColor(...dividerColor);
        doc.setLineWidth(0.5);
        doc.line(20, yPos, pageWidth - 20, yPos);
        yPos += 15;

        // ================= CLIENT & STATUS SECTION =================

        // Left: Bill To
        doc.setFontSize(8);
        doc.setTextColor(...grayColor);
        doc.setFont('helvetica', 'bold');
        doc.text('BILL TO', 20, yPos);

        let billToY = yPos + 6;
        doc.setFontSize(11);
        doc.setTextColor(...darkColor);
        doc.text(data.clientName || '-', 20, billToY);

        billToY += 6;
        doc.setFontSize(10);
        doc.setTextColor(...grayColor);
        doc.setFont('helvetica', 'normal');

        if (data.clientAddress) {
            const clientLines = data.clientAddress.split('\n');
            clientLines.forEach(line => {
                doc.text(line.trim(), 20, billToY);
                billToY += 5;
            });
        }


        // ================= TABLE SECTION =================
        yPos = Math.max(billToY, yPos + 15) + 10;

        const tableData = data.services.map((s) => [
            s.name,
            s.quantity.toString(),
            `${currency}${s.rate.toFixed(2)}`,
            `${currency}${s.amount.toFixed(2)}`
        ]);

        doc.autoTable({
            startY: yPos,
            head: [['Service Description', 'Qty', 'Rate', 'Amount']],
            body: tableData,
            theme: 'plain',
            headStyles: {
                fillColor: [...lightGray],
                textColor: [...grayColor],
                fontStyle: 'bold',
                fontSize: 9,
                cellPadding: 8
            },
            bodyStyles: {
                fontSize: 10,
                cellPadding: 8,
                textColor: [...darkColor],
                lineColor: [...dividerColor],
                lineWidth: { bottom: 0.1 }
            },
            columnStyles: {
                0: { cellWidth: 'auto' }, // Description gets remaining space
                1: { cellWidth: 20, halign: 'center' },
                2: { cellWidth: 35, halign: 'right' },
                3: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
            },
            margin: { left: 20, right: 20 }
        });

        // ================= TOTALS SECTION =================
        let totalsY = doc.lastAutoTable.finalY + 10;
        const totalsRight = pageWidth - 20;

        const printTotalRow = (label, value, isBold = false, isPrimary = false) => {
            doc.setFontSize(isBold ? 11 : 10);
            doc.setFont('helvetica', isBold ? 'bold' : 'normal');
            doc.setTextColor(...(isPrimary ? primaryColor : (isBold ? darkColor : grayColor)));

            doc.text(label, totalsRight - 50, totalsY, { align: 'right' });
            doc.text(value, totalsRight, totalsY, { align: 'right' });
            totalsY += 8;
        };

        printTotalRow('Subtotal', `${currency}${data.subtotal.toFixed(2)}`);

        if (data.taxPercent > 0) {
            printTotalRow(`Tax (${data.taxPercent}%)`, `${currency}${data.taxAmount.toFixed(2)}`);
        }
        if (data.discountPercent > 0) {
            printTotalRow(`Discount (${data.discountPercent}%)`, `-${currency}${data.discountAmount.toFixed(2)}`);
        }

        // Grand Total
        totalsY += 5;
        doc.setDrawColor(...dividerColor);
        doc.setLineWidth(0.5);
        doc.line(totalsRight - 90, totalsY - 8, totalsRight, totalsY - 8);

        printTotalRow('Grand Total', `${currency}${data.grandTotal.toFixed(2)}`, true, true);

        // ================= FOOTER =================
        const footerY = pageHeight - 30;
        doc.setFontSize(9);
        doc.setTextColor(...darkColor);
        doc.setFont('helvetica', 'bold');
        doc.text('Thank you for your business!', 20, footerY);

        doc.setFontSize(8);
        doc.setTextColor(...grayColor);
        doc.setFont('helvetica', 'normal');
        doc.text('Payment is due within 30 days. Please include the invoice number with your payment.', 20, footerY + 5);

        // Save PDF
        doc.save(`${data.invoiceNumber}.pdf`);
        showToast('Invoice PDF downloaded successfully', 'success');
    }

    /**
     * Send invoice via email (Supabase Edge Function)
     */
    async sendEmail() {
        const data = this.getInvoiceData();

        if (!data.clientEmail) {
            showToast('Please enter a client email address', 'error');
            document.getElementById('invoiceClientEmail').focus();
            return;
        }

        const btn = document.getElementById('emailInvoiceBtn');
        const originalText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner-small"></span> Sending...`;
        }

        try {
            // TEMPORARILY DISABLED AS REQUESTED
            // const { data: result, error } = await supabaseClient.functions.invoke('send-invoice', {
            //     body: {
            //         invoiceData: data,
            //         clientEmail: data.clientEmail
            //     }
            // });

            // Simulate success for now
            const result = { success: true };
            const error = null;

            await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate delay


            if (error) throw error;

            showToast(`Invoice sent to ${data.clientEmail}`, 'success');
        } catch (error) {
            console.error('Error sending email:', error);
            showToast('Failed to send email. Check API key or console.', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
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
        const isAdmin = await dataLayer.isAdmin();
        const container = document.getElementById('invoiceHistoryList');
        const emptyState = document.getElementById('invoicesEmptyState');
        const historySection = container ? container.closest('.invoice-history-section') : null;

        if (historySection) historySection.style.display = 'block';

        const invoices = await dataLayer.getAllInvoices();
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
                    <div style="font-weight: 500;">${inv.clientName}</div>
                    <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-bottom: 4px;">Created by: ${inv.createdByName || 'Unknown'}</div>
                    <div>${formatDate(inv.invoiceDate)} • ${currency}${inv.grandTotal.toFixed(2)}</div>
                </div>
                <div class="invoice-history-actions">
                    <button class="btn btn-sm btn-secondary view-invoice" data-id="${inv.id}">View</button>
                    ${isAdmin ? `<button class="btn btn-sm btn-danger delete-invoice" data-id="${inv.id}">Delete</button>` : ''}
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
                        <h4>Invoice Info</h4>
                        <p><strong>Issued By:</strong> ${invoice.createdByName || 'Admin'}</p>
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
        if (!(await app.showConfirmationModal('Delete Invoice', 'Are you sure you want to delete this invoice?'))) return;

        try {
            await dataLayer.deleteInvoice(id);
            showToast('Invoice deleted', 'success');
            await this.renderInvoiceHistory();
        } catch (error) {
            console.error('Error deleting invoice:', error);
            showToast('Failed to delete invoice', 'error');
        }
    }

    /**
     * Handle importing invoices from JSON
     */
    async handleImportInvoices(e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            let data;

            try {
                data = JSON.parse(text);
            } catch (err) {
                throw new Error('Invalid JSON file format');
            }

            // Allow importing a single object or an array
            const invoices = Array.isArray(data) ? data : [data];

            showToast('Importing invoices...', 'info');
            const result = await dataLayer.importInvoices(invoices);

            if (result.success) {
                showToast(result.message, 'success');
                await this.renderInvoiceHistory(); // Refresh list
                await this.generateNewInvoiceNumber(); // Update next ID
            } else {
                throw new Error(result.error?.message || 'Import failed');
            }
        } catch (error) {
            console.error('Import error:', error);
            showToast(`Import Failed: ${error.message}`, 'error');
        } finally {
            e.target.value = ''; // Reset input
        }
    }
}

// Create and export singleton instance
const invoiceManager = new InvoiceManager();
