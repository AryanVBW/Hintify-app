/**
 * Professional Toast Notification System
 * Provides visual feedback for user actions with Material Icons
 */

class ToastNotification {
  constructor() {
    this.container = null;
    this.toasts = [];
    this.maxToasts = 5;
    this.init();
  }

  init() {
    // Create toast container if it doesn't exist
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  }

  /**
   * Show a toast notification
   * @param {string} message - The message to display
   * @param {string} type - Type of toast: 'success', 'error', 'warning', 'info'
   * @param {number} duration - Duration in milliseconds (default: 4000)
   * @param {string} icon - Material icon name (optional, auto-selected based on type)
   */
  show(message, type = 'info', duration = 4000, icon = null) {
    console.log(`[Toast] 📢 Showing ${type} toast:`, message);

    // Auto-select icon based on type if not provided
    if (!icon) {
      icon = this.getIconForType(type);
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type} toast-enter`;
    
    // Create toast content
    toast.innerHTML = `
      <span class="material-icons toast-icon">${icon}</span>
      <span class="toast-message">${message}</span>
      <button class="toast-close" aria-label="Close">
        <span class="material-icons">close</span>
      </button>
    `;

    // Add to container
    this.container.appendChild(toast);
    this.toasts.push(toast);

    // Remove oldest toast if exceeding max
    if (this.toasts.length > this.maxToasts) {
      this.remove(this.toasts[0]);
    }

    // Trigger enter animation
    setTimeout(() => {
      toast.classList.remove('toast-enter');
      toast.classList.add('toast-visible');
    }, 10);

    // Set up close button
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
      this.remove(toast);
    });

    // Auto-dismiss after duration
    if (duration > 0) {
      setTimeout(() => {
        this.remove(toast);
      }, duration);
    }

    return toast;
  }

  /**
   * Remove a toast notification
   * @param {HTMLElement} toast - The toast element to remove
   */
  remove(toast) {
    if (!toast || !toast.parentElement) return;

    console.log('[Toast] 🗑️ Removing toast');

    // Add exit animation
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-exit');

    // Remove from DOM after animation
    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
      // Remove from array
      const index = this.toasts.indexOf(toast);
      if (index > -1) {
        this.toasts.splice(index, 1);
      }
    }, 300);
  }

  /**
   * Get appropriate icon for toast type
   * @param {string} type - Toast type
   * @returns {string} Material icon name
   */
  getIconForType(type) {
    const icons = {
      success: 'check_circle',
      error: 'error',
      warning: 'warning',
      info: 'info'
    };
    return icons[type] || 'info';
  }

  /**
   * Convenience methods for different toast types
   */
  success(message, duration = 4000, icon = 'check_circle') {
    return this.show(message, 'success', duration, icon);
  }

  error(message, duration = 5000, icon = 'error') {
    return this.show(message, 'error', duration, icon);
  }

  warning(message, duration = 4500, icon = 'warning') {
    return this.show(message, 'warning', duration, icon);
  }

  info(message, duration = 3500, icon = 'info') {
    return this.show(message, 'info', duration, icon);
  }

  /**
   * Specialized toast methods for common actions
   */
  
  // Settings related
  settingsSaved() {
    return this.success('Settings saved successfully', 3000, 'save');
  }

  settingsCancelled() {
    return this.info('Changes discarded', 2500, 'close');
  }

  // Connection related
  connectionSuccess(provider) {
    return this.success(`${provider} connection successful`, 3000, 'check_circle');
  }

  connectionFailed(provider, reason) {
    return this.error(`${provider} connection failed: ${reason}`, 5000, 'error');
  }

  connectionTesting(provider) {
    return this.info(`Testing ${provider} connection...`, 2000, 'wifi_tethering');
  }

  // Update related
  checkingUpdates() {
    return this.info('Checking for updates...', 2500, 'system_update');
  }

  updateAvailable(version) {
    return this.info(`Update available: v${version}`, 5000, 'cloud_download');
  }

  updateNotAvailable() {
    return this.success('You are on the latest version', 3000, 'check_circle');
  }

  updateDownloading(progress) {
    return this.info(`Downloading update... ${progress}%`, 0, 'cloud_download');
  }

  updateDownloaded() {
    return this.success('Update downloaded successfully', 4000, 'check_circle');
  }

  updateError(message) {
    return this.error(`Update error: ${message}`, 6000, 'error');
  }

  // Model related
  refreshingModels() {
    return this.info('Refreshing Ollama models...', 2000, 'refresh');
  }

  modelsRefreshed(count) {
    return this.success(`Found ${count} Ollama model(s)`, 3000, 'check_circle');
  }

  modelsError(message) {
    return this.error(`Failed to load models: ${message}`, 4000, 'error');
  }

  // Clipboard related
  apiKeyPasted() {
    return this.success('API key pasted from clipboard', 2500, 'content_paste');
  }

  clipboardEmpty() {
    return this.warning('No text found in clipboard', 3000, 'warning');
  }

  clipboardError() {
    return this.error('Failed to paste from clipboard', 3000, 'error');
  }

  // Auth related
  signingIn() {
    return this.info('Opening sign-in in browser...', 2500, 'login');
  }

  signedOut() {
    return this.success('Signed out successfully', 2500, 'logout');
  }

  authError(message) {
    return this.error(`Authentication error: ${message}`, 4000, 'error');
  }

  // Advanced mode
  advancedModeEnabled() {
    return this.success('Advanced Hint Mode enabled', 3000, 'auto_awesome');
  }

  advancedModeDisabled() {
    return this.info('Advanced Hint Mode disabled', 2500, 'info');
  }

  // Generic actions
  loading(message) {
    return this.info(message, 0, 'hourglass_empty');
  }

  clearAll() {
    console.log('[Toast] 🧹 Clearing all toasts');
    this.toasts.forEach(toast => this.remove(toast));
  }
}

// Create global instance
const toast = new ToastNotification();

// Make it globally accessible
globalThis.showToast = toast;
window.showToast = toast;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = toast;
}

console.log('[Toast] Toast notification system initialized');

