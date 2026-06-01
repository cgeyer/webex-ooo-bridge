/**
 * @param {string} email
 * @returns {string | null}
 */
export function emailDomain(email) {
  const at = email.lastIndexOf("@");
  if (at === -1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return domain || null;
}

/**
 * @param {import("./db.js").UserRecord} user
 * @param {string} senderEmail
 * @returns {string} Empty string when no reply should be sent.
 */
export function resolveOooReplyText(user, senderEmail) {
  const externalMessage = user.oooMessage.trim();
  const internalMessage = user.internalOooMessage.trim();
  const userDomain = emailDomain(user.email);
  const senderDomain = emailDomain(senderEmail);
  const isSameDomain =
    Boolean(userDomain && senderDomain && userDomain === senderDomain);

  if (!user.sendOooToColleagues) {
    if (isSameDomain) return "";
    return externalMessage;
  }

  if (!isSameDomain) {
    return externalMessage;
  }

  if (user.useSameColleagueMessage) {
    return externalMessage;
  }

  return internalMessage || externalMessage;
}
