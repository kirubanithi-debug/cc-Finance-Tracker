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

        list.innerHTML = this.notifications.map(n => `
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
                        ${!n.is_read ? `<button class="btn-text" onclick="notificationsManager.markAsRead(${n.id})">Mark as read</button>` : ''}
                        <button class="btn-text danger" onclick="notificationsManager.delete(${n.id})">Delete</button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    getIcon(type) {
        switch (type) {
            case 'password_reset':
                return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>';
            case 'error':
                return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>';
            default:
                return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>';
        }
    }

    formatTime(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return date.toLocaleDateString();
    }

    async markAsRead(id) {
        try {
            await dataLayer.markNotificationAsRead(id);
            await this.loadNotifications();
        } catch (e) {
            console.error(e);
        }
    }

    async markAllAsRead() {
        try {
            const unread = this.notifications.filter(n => !n.is_read);
            for (const n of unread) {
                await dataLayer.markNotificationAsRead(n.id);
            }
            await this.loadNotifications();
            showToast('All notifications marked as read', 'success');
        } catch (e) {
            console.error(e);
        }
    }

    async delete(id) {
        if (!confirm('Delete this notification?')) return;
        try {
            await dataLayer.deleteNotification(id);
            await this.loadNotifications();
        } catch (e) {
            console.error(e);
        }
    }
}

window.notificationsManager = new NotificationsManager();
