/**
 * ErrorDisplay Component
 * Beautiful error handling with animations and illustrations
 */

const lottie = require('lottie-web');

class ErrorDisplay {
  constructor() {
    this.animationContainer = null;
    this.animation = null;
  }

  /**
   * Show error with animation
   * @param {Object} options - Error display options
   * @param {string} options.type - Error type: 'ocr', 'permission', 'network', 'api', 'general'
   * @param {string} options.title - Error title
   * @param {string} options.message - Error message
   * @param {Array} options.actions - Array of action buttons [{text, onClick, variant}]
   * @param {HTMLElement} options.container - Container to show error in
   */
  show(options) {
    const {
      type = 'general',
      title = 'Something went wrong',
      message = 'Please try again later',
      actions = [],
      container = document.body
    } = options;

    // Create error container with glassy styling
    const errorContainer = document.createElement('div');
    errorContainer.className = 'error-display glass-container frosted-overlay';
    errorContainer.innerHTML = `
      <div class="error-display-content animate-slide-in">
        <div class="error-animation" id="error-animation-${Date.now()}"></div>
        <div class="error-text">
          <h3 class="error-title text-glass">
            <span class="material-icons error-icon">${this.getIconForType(type)}</span>
            ${title}
          </h3>
          <p class="error-message text-glass-secondary">${message}</p>
        </div>
        <div class="error-actions">
          ${actions.map((action, index) => `
            <button class="btn ${action.variant || 'btn-secondary'} glass-btn" data-action="${index}">
              ${action.icon ? `<span class="material-icons">${action.icon}</span>` : ''}
              ${action.text}
            </button>
          `).join('')}
        </div>
      </div>
    `;

    // Add styles
    this.injectStyles();

    // Show animation based on error type
    const animationId = `error-animation-${Date.now()}`;
    const animationContainer = errorContainer.querySelector(`#${animationId}`);
    
    if (animationContainer) {
      this.showAnimation(type, animationContainer);
    }

    // Add event listeners for actions
    actions.forEach((action, index) => {
      const button = errorContainer.querySelector(`[data-action="${index}"]`);
      if (button && action.onClick) {
        button.addEventListener('click', () => {
          action.onClick();
          this.hide(errorContainer);
        });
      }
    });

    // Add to container
    container.appendChild(errorContainer);

    // Animate in
    setTimeout(() => {
      errorContainer.classList.add('show');
    }, 10);

    return errorContainer;
  }

  /**
   * Get Material icon for error type
   */
  getIconForType(type) {
    const icons = {
      ocr: 'text_fields',
      permission: 'lock',
      network: 'wifi_off',
      api: 'cloud_off',
      general: 'error_outline'
    };
    return icons[type] || icons.general;
  }

  /**
   * Show Lottie animation for error type
   */
  showAnimation(type, container) {
    // For now, show a simple animated icon
    // You can replace with actual Lottie JSON files
    const animations = {
      ocr: this.createOCRErrorAnimation(container),
      permission: this.createPermissionErrorAnimation(container),
      network: this.createNetworkErrorAnimation(container),
      api: this.createAPIErrorAnimation(container),
      general: this.createGeneralErrorAnimation(container)
    };

    if (animations[type]) {
      animations[type]();
    }
  }

  /**
   * Create OCR error animation
   */
  createOCRErrorAnimation(container) {
    container.innerHTML = `
      <div class="error-icon-animated ocr-error">
        <svg width="120" height="120" viewBox="0 0 120 120" class="animated-svg">
          <circle cx="60" cy="60" r="55" fill="none" stroke="rgba(239, 68, 68, 0.3)" stroke-width="2" 
                  class="pulse-ring"/>
          <path d="M40 50 L80 50 M40 60 L70 60 M40 70 L75 70" stroke="rgba(239, 68, 68, 0.8)" 
                stroke-width="3" stroke-linecap="round" class="text-lines"/>
          <line x1="80" y1="40" x2="100" y2="60" stroke="#ef4444" stroke-width="4" 
                stroke-linecap="round" class="error-cross"/>
          <line x1="100" y1="40" x2="80" y2="60" stroke="#ef4444" stroke-width="4" 
                stroke-linecap="round" class="error-cross"/>
        </svg>
      </div>
    `;
  }

  /**
   * Create permission error animation
   */
  createPermissionErrorAnimation(container) {
    container.innerHTML = `
      <div class="error-icon-animated permission-error">
        <svg width="120" height="120" viewBox="0 0 120 120" class="animated-svg">
          <circle cx="60" cy="60" r="55" fill="none" stroke="rgba(245, 158, 11, 0.3)" stroke-width="2" 
                  class="pulse-ring"/>
          <rect x="45" y="50" width="30" height="35" rx="3" fill="none" stroke="rgba(245, 158, 11, 0.8)" 
                stroke-width="3" class="lock-body"/>
          <path d="M50 50 V40 Q50 30 60 30 Q70 30 70 40 V50" fill="none" stroke="rgba(245, 158, 11, 0.8)" 
                stroke-width="3" class="lock-shackle"/>
          <circle cx="60" cy="70" r="5" fill="#f59e0b" class="lock-dot pulse-dot"/>
        </svg>
      </div>
    `;
  }

  /**
   * Create network error animation
   */
  createNetworkErrorAnimation(container) {
    container.innerHTML = `
      <div class="error-icon-animated network-error">
        <svg width="120" height="120" viewBox="0 0 120 120" class="animated-svg">
          <circle cx="60" cy="60" r="55" fill="none" stroke="rgba(239, 68, 68, 0.3)" stroke-width="2" 
                  class="pulse-ring"/>
          <path d="M30 70 Q45 50 60 70 Q75 90 90 70" fill="none" stroke="rgba(239, 68, 68, 0.6)" 
                stroke-width="3" stroke-linecap="round" class="wave-line wave-1"/>
          <path d="M35 75 Q47.5 60 60 75 Q72.5 90 85 75" fill="none" stroke="rgba(239, 68, 68, 0.4)" 
                stroke-width="2" stroke-linecap="round" class="wave-line wave-2"/>
          <line x1="55" y1="55" x2="65" y2="65" stroke="#ef4444" stroke-width="4" 
                stroke-linecap="round" class="error-cross"/>
          <line x1="65" y1="55" x2="55" y2="65" stroke="#ef4444" stroke-width="4" 
                stroke-linecap="round" class="error-cross"/>
        </svg>
      </div>
    `;
  }

  /**
   * Create API error animation
   */
  createAPIErrorAnimation(container) {
    container.innerHTML = `
      <div class="error-icon-animated api-error">
        <svg width="120" height="120" viewBox="0 0 120 120" class="animated-svg">
          <circle cx="60" cy="60" r="55" fill="none" stroke="rgba(239, 68, 68, 0.3)" stroke-width="2" 
                  class="pulse-ring"/>
          <ellipse cx="60" cy="45" rx="20" ry="8" fill="none" stroke="rgba(239, 68, 68, 0.8)" 
                   stroke-width="2" class="cloud-top"/>
          <path d="M40 45 L40 65 Q40 75 50 75 L70 75 Q80 75 80 65 L80 45" fill="none" 
                stroke="rgba(239, 68, 68, 0.8)" stroke-width="2" class="cloud-body"/>
          <line x1="70" y1="60" x2="50" y2="80" stroke="#ef4444" stroke-width="4" 
                stroke-linecap="round" class="error-bolt"/>
          <line x1="50" y1="60" x2="70" y2="80" stroke="#ef4444" stroke-width="4" 
                stroke-linecap="round" class="error-bolt"/>
        </svg>
      </div>
    `;
  }

  /**
   * Create general error animation
   */
  createGeneralErrorAnimation(container) {
    container.innerHTML = `
      <div class="error-icon-animated general-error">
        <svg width="120" height="120" viewBox="0 0 120 120" class="animated-svg">
          <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(239, 68, 68, 0.8)" stroke-width="3" 
                  class="error-circle"/>
          <circle cx="60" cy="60" r="55" fill="none" stroke="rgba(239, 68, 68, 0.3)" stroke-width="2" 
                  class="pulse-ring"/>
          <line x1="45" y1="45" x2="75" y2="75" stroke="#ef4444" stroke-width="5" 
                stroke-linecap="round" class="error-cross"/>
          <line x1="75" y1="45" x2="45" y2="75" stroke="#ef4444" stroke-width="5" 
                stroke-linecap="round" class="error-cross"/>
        </svg>
      </div>
    `;
  }

  /**
   * Hide error display
   */
  hide(container) {
    if (container) {
      container.classList.remove('show');
      setTimeout(() => {
        container.remove();
      }, 300);
    }
  }

  /**
   * Inject required styles
   */
  injectStyles() {
    if (document.getElementById('error-display-styles')) return;

    const style = document.createElement('style');
    style.id = 'error-display-styles';
    style.textContent = `
      .error-display {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .error-display.show {
        opacity: 1;
      }

      .error-display-content {
        max-width: 500px;
        width: 90%;
        padding: 40px;
        text-align: center;
      }

      .error-animation {
        margin-bottom: 24px;
      }

      .error-icon-animated {
        display: inline-block;
      }

      .error-text {
        margin-bottom: 32px;
      }

      .error-title {
        font-size: 24px;
        font-weight: 600;
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
      }

      .error-icon {
        font-size: 32px;
      }

      .error-message {
        font-size: 16px;
        line-height: 1.6;
      }

      .error-actions {
        display: flex;
        gap: 12px;
        justify-content: center;
        flex-wrap: wrap;
      }

      /* SVG Animations */
      .pulse-ring {
        animation: pulseRing 2s ease-out infinite;
        transform-origin: center;
      }

      @keyframes pulseRing {
        0%, 100% {
          transform: scale(1);
          opacity: 1;
        }
        50% {
          transform: scale(1.1);
          opacity: 0.5;
        }
      }

      .pulse-dot {
        animation: pulseDot 1s ease-in-out infinite;
      }

      @keyframes pulseDot {
        0%, 100% {
          opacity: 1;
        }
        50% {
          opacity: 0.3;
        }
      }

      .text-lines {
        animation: textLinesFade 2s ease-in-out infinite;
      }

      @keyframes textLinesFade {
        0%, 100% {
          opacity: 0.8;
        }
        50% {
          opacity: 0.3;
        }
      }

      .error-cross {
        animation: crossShake 0.5s ease-in-out;
      }

      @keyframes crossShake {
        0%, 100% {
          transform: translateX(0);
        }
        25% {
          transform: translateX(-3px);
        }
        75% {
          transform: translateX(3px);
        }
      }

      .wave-line {
        animation: wave 2s ease-in-out infinite;
      }

      .wave-2 {
        animation-delay: 0.2s;
      }

      @keyframes wave {
        0%, 100% {
          stroke-dasharray: 100;
          stroke-dashoffset: 0;
        }
        50% {
          stroke-dasharray: 50;
          stroke-dashoffset: 50;
        }
      }

      .lock-shackle {
        animation: lockShake 0.6s ease-in-out;
      }

      @keyframes lockShake {
        0%, 100% {
          transform: rotate(0deg);
        }
        25% {
          transform: rotate(-5deg);
        }
        75% {
          transform: rotate(5deg);
        }
      }

      .cloud-top, .cloud-body {
        animation: cloudFloat 3s ease-in-out infinite;
      }

      @keyframes cloudFloat {
        0%, 100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-5px);
        }
      }

      .error-bolt {
        animation: boltFlash 1s ease-in-out infinite;
      }

      @keyframes boltFlash {
        0%, 100% {
          opacity: 1;
        }
        50% {
          opacity: 0.3;
        }
      }

      .error-circle {
        animation: circleDraw 1s ease-out;
        stroke-dasharray: 314;
        stroke-dashoffset: 314;
        animation-fill-mode: forwards;
      }

      @keyframes circleDraw {
        to {
          stroke-dashoffset: 0;
        }
      }

      .animate-slide-in {
        animation: slideIn 0.5s cubic-bezier(0.4, 0, 0.2, 1);
      }

      @keyframes slideIn {
        from {
          transform: translateY(20px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

module.exports = ErrorDisplay;

