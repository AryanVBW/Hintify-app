/**
 * Reusable MUI-based Icon Component
 * Provides a consistent interface for using Material Icons throughout the app
 */

const React = require('react');

/**
 * Icon Component
 * @param {Object} props
 * @param {string} props.name - Material icon name (e.g., 'home', 'settings')
 * @param {string} [props.color] - Icon color: 'primary', 'secondary', 'error', 'warning', 'info', 'success', 'action', 'disabled', 'inherit'
 * @param {string} [props.size] - Icon size: 'small', 'medium', 'large', 'inherit'
 * @param {string} [props.className] - Additional CSS classes
 * @param {Object} [props.style] - Inline styles
 * @param {string} [props.ariaLabel] - Accessibility label
 * @param {Function} [props.onClick] - Click handler
 * @param {string} [props.title] - Tooltip text
 */
function Icon({ 
  name, 
  color = 'inherit', 
  size = 'medium', 
  className = '', 
  style = {}, 
  ariaLabel,
  onClick,
  title
}) {
  const sizeMap = {
    small: '20px',
    medium: '24px',
    large: '32px',
    inherit: 'inherit'
  };

  const colorMap = {
    primary: 'var(--accent, #667eea)',
    secondary: 'var(--secondary, #764ba2)',
    error: 'var(--error, #f44336)',
    warning: 'var(--warning, #ff9800)',
    info: 'var(--info, #2196f3)',
    success: 'var(--success, #4caf50)',
    action: 'var(--text-primary, currentColor)',
    disabled: 'var(--disabled, rgba(255, 255, 255, 0.3))',
    inherit: 'currentColor'
  };

  const iconStyle = {
    fontSize: sizeMap[size] || size,
    color: colorMap[color] || color,
    userSelect: 'none',
    verticalAlign: 'middle',
    cursor: onClick ? 'pointer' : 'inherit',
    ...style
  };

  const iconProps = {
    className: `material-icons ${className}`.trim(),
    style: iconStyle,
    'aria-label': ariaLabel || name,
    title: title || (ariaLabel ? ariaLabel : undefined),
    role: onClick ? 'button' : 'img',
    tabIndex: onClick ? 0 : undefined,
    onClick: onClick,
    onKeyDown: onClick ? (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick(e);
      }
    } : undefined
  };

  return React.createElement('span', iconProps, name);
}

// Export for use in renderer
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Icon;
}


