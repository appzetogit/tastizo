/**
 * Currency Conversion Utility
 * Converts USD to INR (Indian Rupees)
 */

const USD_TO_INR_RATE = 83
const INR_SYMBOL = "\u20B9"

/**
 * Convert USD amount to INR
 * @param {number} usdAmount - Amount in USD
 * @returns {number} - Amount in INR
 */
export const usdToInr = (usdAmount) => {
  return parseFloat((usdAmount * USD_TO_INR_RATE).toFixed(2))
}

/**
 * Format amount with currency symbol
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency symbol (default: INR)
 * @returns {string} - Formatted amount string
 */
export const formatCurrency = (amount, currency = INR_SYMBOL) => {
  return `${currency} ${parseFloat(amount).toFixed(2)}`
}

/**
 * Convert and format USD to INR
 * @param {number} usdAmount - Amount in USD
 * @returns {string} - Formatted amount in INR
 */
export const formatUsdToInr = (usdAmount) => {
  return formatCurrency(usdToInr(usdAmount))
}
