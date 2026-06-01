import { normalizeTime24 } from "./time-format.js";

/**
 * @param {import("./db.js").UserRecord | import("./db.js").UserProfile} user
 * @returns {number | null} UTC epoch milliseconds for the configured end, or null if open-ended.
 */
export function oooEndTimestampMs(user) {
  if (!user.hasOooEndDate || !user.oooEndDate || !user.oooEndTime || !user.oooEndTimezone) {
    return null;
  }

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(user.oooEndDate);
  const normalizedTime = normalizeTime24(user.oooEndTime);
  if (!dateMatch || !normalizedTime) return null;

  const timeMatch = /^(\d{2}):(\d{2})$/.exec(normalizedTime);
  if (!timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null;
  }

  try {
    let guess = Date.UTC(year, month - 1, day, hour, minute);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: user.oooEndTimezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(new Date(guess));

      const read = (type) => Number(parts.find((part) => part.type === type)?.value);
      const localYear = read("year");
      const localMonth = read("month");
      const localDay = read("day");
      const localHour = read("hour");
      const localMinute = read("minute");

      const diffMinutes =
        (year - localYear) * 525_600 +
        (month - localMonth) * 43_800 +
        (day - localDay) * 1_440 +
        (hour - localHour) * 60 +
        (minute - localMinute);

      if (diffMinutes === 0) return guess;
      guess += diffMinutes * 60_000;
    }
    return guess;
  } catch {
    return null;
  }
}

/**
 * @param {import("./db.js").UserRecord | import("./db.js").UserProfile} user
 * @param {number} [nowMs]
 */
export function isOooActive(user, nowMs = Date.now()) {
  if (!user.enableOoo) return false;
  const endMs = oooEndTimestampMs(user);
  if (endMs === null) return true;
  return nowMs < endMs;
}

/**
 * @param {import("./db.js").UserRecord | import("./db.js").UserProfile} user
 * @param {number} [nowMs]
 */
export function isOooEndExpired(user, nowMs = Date.now()) {
  if (!user.hasOooEndDate) return false;
  const endMs = oooEndTimestampMs(user);
  return endMs !== null && endMs <= nowMs;
}
