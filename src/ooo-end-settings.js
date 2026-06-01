import { isValidTimeZone } from "./timezones.js";
import { normalizeTime24 } from "./time-format.js";

/**
 * @param {import("./db.js").UserRecord} existing
 * @param {Record<string, unknown> | undefined} body
 */
export function parseOooEndSettings(existing, body) {
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

  return {
    hasOooEndDate: true,
    oooEndDate,
    oooEndTime,
    oooEndTimezone,
    error: null,
  };
}
