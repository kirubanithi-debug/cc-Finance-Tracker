/**
 * Notifications Manager
 */
class NotificationsManager {
    constructor() {
        this.notifications = [];
    }

    async init() {
        this.bindEvents();
        await this.loadNotifications();

        // Refresh every minute
        setInterval(() => this.loadNotifications(), 60000);
    }

    bindEvents() {
        const markAllBtn = document.getElementById('markAllReadBtn');
        if (markAllBtn) {
            markAllBtn.addEventListener('click', () => this.markAllAsRead());
        }
    }

    async loadNotifications() {
        try {
            const isAdmin = await dataLayer.isAdmin();
            if (!isAdmin) return;

            this.notifications = await dataLayer.getNotifications();
            this.renderNotifications();
            this.updateBadge();
        } catch (error) {
            console.error('Failed to load notifications:', error);
        }
    }

    updateBadge() {
        const badge = document.getElementById('notifCountBadge');
        if (!badge) return;

        const unreadCount = this.notifications.filter(n => !n.is_read).length;
        if (unreadCount > 0) {
            badge.textContent = unreadCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    renderNotifications() {
        const list = document.getElementById('notificationsList');
        const emptyState = document.getElementById('notificationsEmptyState');

        if (!list) return;

        if (this.notifications.length === 0) {
            list.innerHTML = '';
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (emptyState) emptyState.classList.add('hidden');

        list.innerHTML = this.notifications.map(n => {
            const isPasswordRequest = n.type === 'password_reset_request';
            const metadata = n.metadata || {};

            return `
            <div class="notification-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}">
                <div class="notification-icon ${n.type}">
                    ${this.getIcon(n.type)}
                </div>
                <div class="notification-content">
                    <div class="notification-header">
                        <h4>${n.title}</h4>
                        <span class="notification-time">${this.formatTime(n.created_at)}</span>
                    </div>
                    <p>${n.message}</p>
                    <div class="notification-actions">
                        ${isPasswordRequest && !n.is_read ?
                    `<button class="btn btn-sm btn-primary" onclick="notificationsManager.approvePasswordReset(${n.id}, '${metadata.email || ''}')">Approve Reset</button>`
                    : ''}
                        ${!n.is_read ? `<button class="btn-text" onclick="notificationsManager.markAsRead(${n.id})">Mark as read</button>` : ''}
                        <button class="btn-text danger" onclick="notificationsManager.delete(${n.id})">Delete</button>
                    </div>
                </div>
            </div>
        `}).join('');
    }

    getIcon(type) {
        switch (type) {
            case 'password_reset_request':
            case 'password_reset':
                return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>';
            case 'error':
                return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>';
            default:
                return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>';
        }
    }

    formatTime(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        return date.toLocaleDateString();
    }

    async approvePasswordReset(id, email) {
        if (!email) {
            showToast('Error: No email attached to this request', 'error');
            return;
        }

        if (!(await app.showConfirmationModal('Approve Reset', `Are you sure you want to approve password reset for ${email}? This will send them a password reset email.`))) return;

        try {
            // Trigger the reset email as Admin
            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/reset-password.html',
            });

            if (error) throw error;

            showToast(`Password reset approved. Email sent to ${email}`, 'success');

            // Mark notification as read
            await this.markAsRead(id);
        } catch (error) {
            console.error('Approval failed:', error);
            showToast(`Failed to send reset email: ${error.message}`, 'error');
        }
    }

    async markAsRead(id) {
        try {
            await dataLayer.markNotificationAsRead(id);
            await this.loadNotifications();
        } catch (error) {
            console.error('Failed to mark as read:', error);
        }
    }

    async markAllAsRead() {
        try {
            for (const n of this.notifications) {
                if (!n.is_read) {
                    await dataLayer.markNotificationAsRead(n.id);
                }
            }
            await this.loadNotifications();
        } catch (error) {
            console.error('Failed to mark all as read:', error);
        }
    }

    async delete(id) {
        if (!(await app.showConfirmationModal('Delete Notification', 'Are you sure you want to delete this notification?'))) return;

        try {
            await dataLayer.deleteNotification(id);
            await this.loadNotifications();
            showToast('Notification deleted', 'success');
        } catch (error) {
            console.error('Failed to delete notification:', error);
            showToast('Failed to delete notification', 'error');
        }
    }
}

window.notificationsManager = new NotificationsManager();
