import { config } from "./config.js";
import { emailDomain } from "./ooo-message.js";

/**
 * @param {string} email
 */
export function isExchangeSyncEligible(email) {
  const domain = config.exchangeSync.emailDomain;
  if (!domain) return false;
  const userDomain = emailDomain(email);
  return Boolean(userDomain && userDomain === domain.toLowerCase());
}
