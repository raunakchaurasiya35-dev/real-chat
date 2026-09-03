/**
 * Sanitizes input string to prevent XSS attacks by escaping HTML characters.
 * @param {string} str - Raw string to sanitize
 * @returns {string} Sanitized string
 */
export const sanitizeInput = (str) => {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/**
 * Unescapes sanitized HTML string for clean plain text display when rendered securely in React text nodes.
 * @param {string} str - Sanitized string
 * @returns {string} Clean plain text
 */
export const decodeInput = (str) => {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&');
};
