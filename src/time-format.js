/**
 * @param {string} time
 * @returns {string | null}
 */
export function normalizeTime24(time) {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(String(time).trim());
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
