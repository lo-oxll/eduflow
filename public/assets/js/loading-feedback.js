/**
 * Enhanced loading states and user feedback system for EduFlow
 * Provides comprehensive loading indicators, notifications, and progress tracking
 */

class LoadingManager {
    constructor() {
        this.loadingElements = new Map();
        this.activeLoaders = new Set();
        this.setupGlobalStyles();
    }

    setupGlobalStyles() {
        // Add CSS for loading states
        const styles = `
            .loading-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(255, 255, 255, 0.8);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 9999;
                backdrop-filter: blur(4px);
            }
            
            .loading-spinner {
                width: 50px;
                height: 50px;
                border: 4px solid #f3f3f3;
                border-top: 4px solid var(--primary-color, #2563eb);
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            
            .loading-text {
                margin-top: 15px;
                font-size: 16px;
                color: #666;
                text-align: center;
            }
            
            .loading-progress {
                width: 200px;
                height: 8px;
                background: #f0f0f0;
                border-radius: 4px;
                margin: 15px 0;
                overflow: hidden;
            }
            
            .loading-progress-bar {
                height: 100%;
                background: var(--primary-color, #2563eb);
                width: 0%;
                transition: width 0.3s ease;
                border-radius: 4px;
            }
            
            .loading-element {
                position: relative;
                pointer-events: none;
            }
            
            .loading-element::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(255, 255, 255, 0.7);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 100;
            }
            
            .loading-element::before {
                content: '';
                position: absolute;
                top: 50%;
                left: 50%;
                width: 20px;
                height: 20px;
                margin: -10px 0 0 -10px;
                border: 2px solid #f3f3f3;
                border-top: 2px solid var(--primary-color, #2563eb);
                border-radius: 50%;
                animation: spin 1s linear infinite;
                z-index: 101;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .loading-button {
                position: relative;
                pointer-events: none;
            }
            
            .loading-button .button-text {
                opacity: 0.7;
            }
            
            .loading-button .spinner {
                position: absolute;
                left: 10px;
                top: 50%;
                transform: translateY(-50%);
                width: 16px;
                height: 16px;
                border: 2px solid transparent;
                border-top: 2px solid currentColor;
                border-radius: 50%;
                animation: spin 0.8s linear infinite;
            }
        `;
        
        const styleSheet = document.createElement('style');
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

    showPageLoading(message = 'Loading...', showProgress = false) {
        // Remove existing overlay
        this.hidePageLoading();
        
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.id = 'page-loading-overlay';
        
        let content = `
            <div style="text-align: center;">
                <div class="loading-spinner"></div>
        `;
        
        if (message) {
            content += `<div class="loading-text">${message}</div>`;
        }
        
        if (showProgress) {
            content += `
                <div class="loading-progress">
                    <div class="loading-progress-bar" id="loading-progress-bar"></div>
                </div>
                <div id="loading-progress-text">0%</div>
            `;
        }
        
        content += '</div>';
        overlay.innerHTML = content;
        
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
        
        return {
            updateProgress: showProgress ? (percent) => this.updateProgress(percent) : null,
            hide: () => this.hidePageLoading()
        };
    }

    hidePageLoading() {
        const overlay = document.getElementById('page-loading-overlay');
        if (overlay) {
            overlay.remove();
            document.body.style.overflow = '';
        }
    }

    updateProgress(percent) {
        const progressBar = document.getElementById('loading-progress-bar');
        const progressText = document.getElementById('loading-progress-text');
        
        if (progressBar) {
            progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
        }
        
        if (progressText) {
            progressText.textContent = `${Math.round(percent)}%`;
        }
    }

    showElementLoading(element, message = null) {
        if (!element) return;
        
        // Store original state
        const loadingId = 'loading-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        this.loadingElements.set(loadingId, {
            element: element,
            originalContent: element.innerHTML,
            originalClasses: element.className
        });
        
        // Add loading classes
        element.classList.add('loading-element');
        element.setAttribute('data-loading-id', loadingId);
        
        // Add message if provided
        if (message) {
            const messageElement = document.createElement('div');
            messageElement.className = 'loading-message';
            messageElement.textContent = message;
            messageElement.style.cssText = `
                position: absolute;
                top: calc(50% + 25px);
                left: 50%;
                transform: translate(-50%, -50%);
                font-size: 14px;
                color: #666;
                z-index: 102;
                background: rgba(255, 255, 255, 0.9);
                padding: 4px 8px;
                border-radius: 4px;
            `;
            element.appendChild(messageElement);
        }
        
        return loadingId;
    }

    hideElementLoading(loadingId) {
        if (!loadingId) return;
        
        const loadingInfo = this.loadingElements.get(loadingId);
        if (loadingInfo) {
            const element = loadingInfo.element;
            element.innerHTML = loadingInfo.originalContent;
            element.className = loadingInfo.originalClasses;
            element.removeAttribute('data-loading-id');
            this.loadingElements.delete(loadingId);
        }
    }

    showButtonLoading(button, loadingText = 'Processing...') {
        if (!button || button.tagName !== 'BUTTON') return;
        
        // Store original state
        const originalContent = button.innerHTML;
        const originalDisabled = button.disabled;
        
        // Add loading state
        button.classList.add('loading-button');
        button.disabled = true;
        
        // Update content
        button.innerHTML = `
            <span class="spinner"></span>
            <span class="button-text">${loadingText}</span>
        `;
        
        return {
            hide: () => {
                button.innerHTML = originalContent;
                button.disabled = originalDisabled;
                button.classList.remove('loading-button');
            }
        };
    }

    showSectionLoading(sectionId, message = 'Loading section...') {
        const section = document.getElementById(sectionId);
        if (!section) return null;
        
        return this.showElementLoading(section, message);
    }

    hideSectionLoading(loadingId) {
        this.hideElementLoading(loadingId);
    }
}

class NotificationManager {
    constructor() {
        this.container = this.createNotificationContainer();
        this.notificationId = 0;
    }

    createNotificationContainer() {
        let container = document.getElementById('notifications-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notifications-container';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                width: 350px;
                max-width: calc(100vw - 40px);
            `;
            document.body.appendChild(container);
        }
        return container;
    }

    showNotification(message, type = 'info', duration = 5000, options = {}) {
        const id = ++this.notificationId;
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.id = `notification-${id}`;
        
        // Notification styles
        const typeStyles = {
            success: { bgColor: '#10b981', borderColor: '#059669', icon: 'check-circle' },
            error: { bgColor: '#ef4444', borderColor: '#dc2626', icon: 'exclamation-circle' },
            warning: { bgColor: '#f59e0b', borderColor: '#d97706', icon: 'exclamation-triangle' },
            info: { bgColor: '#3b82f6', borderColor: '#2563eb', icon: 'info-circle' }
        };
        
        const style = typeStyles[type] || typeStyles.info;
        
        notification.style.cssText = `
            background: ${style.bgColor};
            border-left: 4px solid ${style.borderColor};
            color: white;
            padding: 16px;
            margin-bottom: 12px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            transform: translateX(100%);
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
            overflow: hidden;
        `;
        
        notification.innerHTML = `
            <div style="display: flex; align-items: flex-start; gap: 12px;">
                <i class="fas fa-${style.icon}" style="font-size: 20px; flex-shrink: 0; margin-top: 2px;"></i>
                <div style="flex: 1;">
                    <div style="font-weight: 600; margin-bottom: 4px;">${options.title || this.getDefaultTitle(type)}</div>
                    <div>${message}</div>
                </div>
                <button class="notification-close" style="
                    background: none;
                    border: none;
                    color: rgba(255, 255, 255, 0.8);
                    font-size: 18px;
                    cursor: pointer;
                    padding: 0;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 4px;
                    transition: background 0.2s;
                " onmouseover="this.style.background='rgba(255,255,255,0.2)'" 
                   onmouseout="this.style.background='none'">
                    &times;
                </button>
            </div>
            ${options.showProgress ? `
                <div class="notification-progress" style="
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    height: 3px;
                    background: rgba(255, 255, 255, 0.3);
                    width: 100%;
                ">
                    <div class="progress-bar" style="
                        height: 100%;
                        background: white;
                        width: 100%;
                        transition: width ${duration}ms linear;
                    "></div>
                </div>
            ` : ''}
        `;
        
        this.container.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
            notification.style.opacity = '1';
        }, 10);
        
        // Progress bar animation
        if (options.showProgress) {
            setTimeout(() => {
                const progressBar = notification.querySelector('.progress-bar');
                if (progressBar) {
                    progressBar.style.width = '0%';
                }
            }, 50);
        }
        
        // Close button handler
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.onclick = () => this.hideNotification(id);
        
        // Auto-hide
        if (duration > 0) {
            setTimeout(() => this.hideNotification(id), duration);
        }
        
        return id;
    }

    hideNotification(id) {
        const notification = document.getElementById(`notification-${id}`);
        if (notification) {
            notification.style.transform = 'translateX(100%)';
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
            }, 300);
        }
    }

    getDefaultTitle(type) {
        const titles = {
            success: 'Success',
            error: 'Error',
            warning: 'Warning',
            info: 'Information'
        };
        return titles[type] || 'Notification';
    }

    showSuccess(message, duration = 5000) {
        return this.showNotification(message, 'success', duration);
    }

    showError(message, duration = 7000) {
        return this.showNotification(message, 'error', duration);
    }

    showWarning(message, duration = 6000) {
        return this.showNotification(message, 'warning', duration);
    }

    showInfo(message, duration = 5000) {
        return this.showNotification(message, 'info', duration);
    }

    showProgressNotification(message, duration = 10000) {
        return this.showNotification(message, 'info', duration, { showProgress: true });
    }

    clearAll() {
        const notifications = this.container.querySelectorAll('.notification');
        notifications.forEach(notification => {
            notification.style.transform = 'translateX(100%)';
            notification.style.opacity = '0';
        });
        
        setTimeout(() => {
            this.container.innerHTML = '';
        }, 300);
    }
}

class ToastManager {
    constructor() {
        this.container = this.createToastContainer();
        this.toastId = 0;
    }

    createToastContainer() {
        let container = document.getElementById('toasts-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toasts-container';
            container.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 20px;
                z-index: 10001;
                display: flex;
                flex-direction: column;
                gap: 12px;
                max-width: 400px;
            `;
            document.body.appendChild(container);
        }
        return container;
    }

    showToast(message, type = 'info', duration = 3000) {
        const id = ++this.toastId;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.id = `toast-${id}`;
        
        const typeStyles = {
            success: { bgColor: '#10b981', icon: 'check' },
            error: { bgColor: '#ef4444', icon: 'times' },
            warning: { bgColor: '#f59e0b', icon: 'exclamation' },
            info: { bgColor: '#3b82f6', icon: 'info' }
        };
        
        const style = typeStyles[type] || typeStyles.info;
        
        toast.style.cssText = `
            background: ${style.bgColor};
            color: white;
            padding: 12px 16px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            transform: translateX(-100%);
            opacity: 0;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            gap: 10px;
            max-width: 100%;
        `;
        
        toast.innerHTML = `
            <i class="fas fa-${style.icon}" style="font-size: 16px;"></i>
            <span style="flex: 1; font-size: 14px;">${message}</span>
            <button style="
                background: none;
                border: none;
                color: rgba(255, 255, 255, 0.8);
                font-size: 16px;
                cursor: pointer;
                padding: 0;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
            ">&times;</button>
        `;
        
        this.container.appendChild(toast);
        
        // Animate in
        setTimeout(() => {
            toast.style.transform = 'translateX(0)';
            toast.style.opacity = '1';
        }, 10);
        
        // Close button
        const closeBtn = toast.querySelector('button');
        closeBtn.onclick = () => this.hideToast(id);
        
        // Auto-hide
        setTimeout(() => this.hideToast(id), duration);
        
        return id;
    }

    hideToast(id) {
        const toast = document.getElementById(`toast-${id}`);
        if (toast) {
            toast.style.transform = 'translateX(-100%)';
            toast.style.opacity = '0';
            setTimeout(() => {
                if (toast.parentElement) {
                    toast.remove();
                }
            }, 300);
        }
    }

    showSuccess(message, duration = 3000) {
        return this.showToast(message, 'success', duration);
    }

    showError(message, duration = 4000) {
        return this.showToast(message, 'error', duration);
    }

    showWarning(message, duration = 3500) {
        return this.showToast(message, 'warning', duration);
    }

    showInfo(message, duration = 3000) {
        return this.showToast(message, 'info', duration);
    }
}

// Global instances
const loadingManager = new LoadingManager();
const notificationManager = new NotificationManager();
const toastManager = new ToastManager();

// Make available globally
window.LoadingManager = LoadingManager;
window.NotificationManager = NotificationManager;
window.ToastManager = ToastManager;
window.loadingManager = loadingManager;
window.notificationManager = notificationManager;
window.toastManager = toastManager;

// Convenience functions
window.showPageLoading = (message, showProgress) => loadingManager.showPageLoading(message, showProgress);
window.hidePageLoading = () => loadingManager.hidePageLoading();
window.showElementLoading = (element, message) => loadingManager.showElementLoading(element, message);
window.hideElementLoading = (loadingId) => loadingManager.hideElementLoading(loadingId);
window.showButtonLoading = (button, text) => loadingManager.showButtonLoading(button, text);

window.showNotification = (message, type, duration, options) => 
    notificationManager.showNotification(message, type, duration, options);
window.showSuccess = (message, duration) => notificationManager.showSuccess(message, duration);
window.showError = (message, duration) => notificationManager.showError(message, duration);
window.showWarning = (message, duration) => notificationManager.showWarning(message, duration);
window.showInfo = (message, duration) => notificationManager.showInfo(message, duration);

window.showToast = (message, type, duration) => toastManager.showToast(message, type, duration);
window.toastSuccess = (message, duration) => toastManager.showSuccess(message, duration);
window.toastError = (message, duration) => toastManager.showError(message, duration);
window.toastWarning = (message, duration) => toastManager.showWarning(message, duration);
window.toastInfo = (message, duration) => toastManager.showInfo(message, duration);

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        LoadingManager,
        NotificationManager,
        ToastManager,
        loadingManager,
        notificationManager,
        toastManager
    };
}