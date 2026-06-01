import { isValidTimeZone } from "./timezones.js";
import { normalizeTime24 } from "./time-format.js";
import { isOooEndExpired, oooEndTimestampMs } from "./ooo-schedule.js";

export const OOO_END_MUST_BE_FUTURE_ERROR = "The end date and time must be in the future.";

/**
 * Clears `hasOooEndDate` when the stored end date/time is already in the past.
 * Preserves the date, time, and time zone values for reuse.
 *
 * @param {import("./db.js").UserRecord} user
 * @param {number} [nowMs]
 */
export function ensureOooEndNotExpired(user, nowMs = Date.now()) {
  if (!user.enableOoo || !isOooEndExpired(user, nowMs)) return user;
  return { ...user, hasOooEndDate: false };
}

/**
 * @param {import("./db.js").UserRecord} existing
 * @param {Record<string, unknown> | undefined} body
 * @param {number} [nowMs]
 */
export function parseOooEndSettings(existing, body, nowMs = Date.now()) {
  const enableOoo =
    body?.enableOoo === "1" || body?.enableOoo === "on" || body?.enableOoo === "isActive";

  if (!enableOoo) {
    return {
      hasOooEndDate: existing.hasOooEndDate,
      oooEndDate: existing.oooEndDate,
      oooEndTime: existing.oooEndTime,
      oooEndTimezone: existing.oooEndTimezone,
      error: null,
    };
  }

  const hasOooEndDate = body?.hasOooEndDate === "1" || body?.hasOooEndDate === "on" || body?.hasOooEndDate === "isActive";

  if (!hasOooEndDate) {
    return {
      hasOooEndDate: false,
      oooEndDate: existing.oooEndDate,
      oooEndTime: existing.oooEndTime,
      oooEndTimezone: existing.oooEndTimezone,
      error: null,
    };
  }

  const oooEndDate = typeof body?.oooEndDate === "string" ? body.oooEndDate.trim() : "";
  const rawEndTime = typeof body?.oooEndTime === "string" ? body.oooEndTime.trim() : "";
  const oooEndTime = normalizeTime24(rawEndTime);
  const oooEndTimezone = typeof body?.oooEndTimezone === "string" ? body.oooEndTimezone.trim() : "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(oooEndDate)) {
    return { error: "Please enter a valid end date." };
  }
  if (!oooEndTime) {
    return { error: "Please enter a valid end time in 24-hour format (HH:MM)." };
  }
  if (!isValidTimeZone(oooEndTimezone)) {
    return { error: "Please select a valid time zone." };
  }

  const endMs = oooEndTimestampMs({
    hasOooEndDate: true,
    oooEndDate,
    oooEndTime,
    oooEndTimezone,
  });
  if (endMs === null) {
    return { error: "Please enter a valid end date and time." };
  }
  if (endMs <= nowMs) {
    return { error: OOO_END_MUST_BE_FUTURE_ERROR };
  }

  return {
    hasOooEndDate: true,
    oooEndDate,
    oooEndTime,
    oooEndTimezone,
    error: null,
  };
}
