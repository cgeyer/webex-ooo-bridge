import { upsertUser } from "./db.js";
import { syncOooWebhooks } from "./ooo-sync.js";
import { oooEndTimestampMs } from "./ooo-schedule.js";

/**
 * @param {{ created?: string } | null | undefined} source
 * @returns {number | null}
 */
export function messageCreatedTimestampMs(source) {
  const created = source?.created;
  if (typeof created !== "string" || !created.trim()) return null;
  const ms = Date.parse(created);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * @param {import("./db.js").UserRecord} user
 * @param {number} messageCreatedMs
 */
export function isMessageAfterOooEnd(user, messageCreatedMs) {
  const endMs = oooEndTimestampMs(user);
  if (endMs === null || messageCreatedMs === null) return false;
  return messageCreatedMs >= endMs;
}

/**
 * @param {import("./db.js").UserRecord} user
 * @param {string} accessToken
 * @param {import("pino").Logger} log
 */
export async function deactivateOoo(user, accessToken, log) {
  await syncOooWebhooks(accessToken, false);
  upsertUser({
    ...user,
    enableOoo: false,
    webhookIds: [],
  });
  log.info(
    {
      personId: user.personId,
      oooEndDate: user.oooEndDate,
      oooEndTime: user.oooEndTime,
      oooEndTimezone: user.oooEndTimezone,
    },
    "deactivated OOO after end date/time"
  );
}

/**
 * @param {import("./db.js").UserRecord} user
 * @param {string} accessToken
 * @param {string} messageId
 * @param {Record<string, unknown> | undefined} webhookData
 * @param {import("pino").Logger} log
 * @param {(token: string, id: string) => Promise<Record<string, unknown>>} fetchMessage
 * @returns {Promise<boolean>} True when OOO was deactivated and processing should stop.
 */
export async function deactivateOooIfExpired(user, accessToken, messageId, webhookData, log, fetchMessage) {
  if (oooEndTimestampMs(user) === null) return false;

  let messageCreatedMs = messageCreatedTimestampMs(webhookData);
  if (messageCreatedMs === null) {
    try {
      const message = await fetchMessage(accessToken, messageId);
      messageCreatedMs = messageCreatedTimestampMs(message);
    } catch (err) {
      log.warn({ err, personId: user.personId, messageId }, "could not load message created time for OOO expiry");
    }
  }

  if (messageCreatedMs !== null && isMessageAfterOooEnd(user, messageCreatedMs)) {
    await deactivateOoo(user, accessToken, log);
    return true;
  }

  return false;
}
