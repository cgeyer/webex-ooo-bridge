import { config } from "./config.js";
import { htmlToPlainText } from "./html-plain-text.js";
import { normalizeTime24 } from "./time-format.js";
import { isValidTimeZone } from "./timezones.js";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/**
 * @param {string} accessToken
 */
export async function getAutomaticRepliesSetting(accessToken) {
  const res = await fetch(`${GRAPH_BASE}/me/mailboxSettings/automaticRepliesSetting`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Graph automaticRepliesSetting failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * @param {string} body
 * @param {string} codeVerifier
 */
export async function exchangeMicrosoftAuthorizationCode(code, codeVerifier) {
  const tokenUrl = `https://login.microsoftonline.com/${config.exchangeSync.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: config.exchangeSync.clientId,
    client_secret: config.exchangeSync.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.exchangeSync.redirectUri,
    code_verifier: codeVerifier,
    scope: config.exchangeSync.scopes,
  });
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Microsoft token exchange failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * @param {string} refreshToken
 */
export async function refreshMicrosoftAccessToken(refreshToken) {
  const tokenUrl = `https://login.microsoftonline.com/${config.exchangeSync.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: config.exchangeSync.clientId,
    client_secret: config.exchangeSync.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: config.exchangeSync.scopes,
  });
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Microsoft refresh token failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * @param {{ dateTime?: string, timeZone?: string } | null | undefined} dateTimeZone
 * @returns {{ date: string, time: string, timeZone: string } | null}
 */
function parseGraphWallClock(dateTimeZone) {
  if (!dateTimeZone?.dateTime || !dateTimeZone?.timeZone) return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(String(dateTimeZone.dateTime));
  if (!match) return null;
  const time = normalizeTime24(`${match[2]}:${match[3]}`);
  if (!time) return null;
  return { date: match[1], time, timeZone: String(dateTimeZone.timeZone) };
}

/**
 * @param {{ dateTime?: string, timeZone?: string } | null | undefined} dateTimeZone
 * @returns {number | null}
 */
function wallClockToUtcMs(dateTimeZone) {
  const parsed = parseGraphWallClock(dateTimeZone);
  if (!parsed) return null;

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(parsed.date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(parsed.time);
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  try {
    let guess = Date.UTC(year, month - 1, day, hour, minute);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: parsed.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(new Date(guess));

      const read = (type) => Number(parts.find((part) => part.type === type)?.value);
      const diffMinutes =
        (year - read("year")) * 525_600 +
        (month - read("month")) * 43_800 +
        (day - read("day")) * 1_440 +
        (hour - read("hour")) * 60 +
        (minute - read("minute"));

      if (diffMinutes === 0) return guess;
      guess += diffMinutes * 60_000;
    }
    return guess;
  } catch {
    return null;
  }
}

/** @param {string} timeZone */
function isUtcTimeZone(timeZone) {
  const normalized = timeZone.trim().toUpperCase();
  return normalized === "UTC" || normalized === "ETC/UTC" || normalized === "GMT" || normalized === "ETC/GMT";
}

/**
 * @param {number} utcMs
 * @param {string} timeZone
 * @returns {{ date: string, time: string } | null}
 */
function wallClockFromUtcMs(utcMs, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(utcMs));

    const read = (type) => parts.find((part) => part.type === type)?.value ?? "";
    const year = read("year");
    const month = read("month");
    const day = read("day");
    const hour = read("hour");
    const minute = read("minute");
    if (!year || !month || !day || hour === "" || minute === "") return null;

    const time = normalizeTime24(`${hour}:${minute}`);
    if (!time) return null;
    return { date: `${year}-${month}-${day}`, time };
  } catch {
    return null;
  }
}

/**
 * Graph often reports UTC; map to a friendlier IANA label while preserving the instant.
 *
 * @param {{ date: string, time: string, timeZone: string }} wallClock
 */
function normalizeExchangeEndWallClock(wallClock) {
  if (!isUtcTimeZone(wallClock.timeZone)) return wallClock;

  const alias = config.exchangeSync.utcTimeZoneAlias;
  if (!alias || !isValidTimeZone(alias) || isUtcTimeZone(alias)) {
    return wallClock;
  }

  const utcMs = wallClockToUtcMs({
    dateTime: `${wallClock.date}T${wallClock.time}:00`,
    timeZone: wallClock.timeZone,
  });
  if (utcMs === null) {
    return { ...wallClock, timeZone: alias };
  }

  const converted = wallClockFromUtcMs(utcMs, alias);
  if (!converted) {
    return { ...wallClock, timeZone: alias };
  }

  return { date: converted.date, time: converted.time, timeZone: alias };
}

/**
 * @param {Record<string, unknown>} graphSetting
 * @param {number} [nowMs]
 */
function isExchangeOooCurrentlyEnabled(graphSetting, nowMs = Date.now()) {
  const status = String(graphSetting?.status ?? "disabled");
  if (status === "disabled") return false;
  if (status === "alwaysEnabled") return true;
  if (status !== "scheduled") return false;

  const startMs = wallClockToUtcMs(graphSetting?.scheduledStartDateTime);
  if (startMs === null || nowMs < startMs) return false;

  const endMs = wallClockToUtcMs(graphSetting?.scheduledEndDateTime);
  if (endMs !== null && nowMs >= endMs) return false;

  return true;
}

/**
 * Maps Microsoft Graph automaticRepliesSetting to local OOO fields.
 *
 * @param {Record<string, unknown>} graphSetting
 * @param {string} defaultMessage
 * @param {number} [nowMs]
 */
export function mapGraphAutomaticRepliesToOooFields(graphSetting, defaultMessage, nowMs = Date.now()) {
  const status = String(graphSetting?.status ?? "disabled");
  const internalText = htmlToPlainText(graphSetting?.internalReplyMessage);
  const externalText = htmlToPlainText(graphSetting?.externalReplyMessage);
  const externalAudience = String(graphSetting?.externalAudience ?? "all");

  const enableOoo = isExchangeOooCurrentlyEnabled(graphSetting, nowMs);

  const hasInternal = Boolean(internalText);
  const hasExternal = Boolean(externalText) && externalAudience !== "none";
  const messagesMatch = hasInternal && hasExternal && internalText === externalText;

  const oooMessage = (hasExternal ? externalText : internalText) || defaultMessage;
  let sendOooToColleagues = false;
  let useSameColleagueMessage = true;
  let internalOooMessage = internalText || oooMessage;

  if (hasInternal && hasExternal && !messagesMatch) {
    sendOooToColleagues = true;
    useSameColleagueMessage = false;
    internalOooMessage = internalText;
  } else if (hasInternal && !hasExternal) {
    sendOooToColleagues = true;
    useSameColleagueMessage = false;
    internalOooMessage = internalText;
  } else if (hasInternal || hasExternal) {
    sendOooToColleagues = hasInternal;
    useSameColleagueMessage = true;
    internalOooMessage = internalText || externalText || oooMessage;
  }

  let hasOooEndDate = false;
  let oooEndDate = "";
  let oooEndTime = "";
  let oooEndTimezone = "";

  if (status === "scheduled") {
    const end = parseGraphWallClock(graphSetting?.scheduledEndDateTime);
    if (end) {
      const normalizedEnd = normalizeExchangeEndWallClock(end);
      hasOooEndDate = true;
      oooEndDate = normalizedEnd.date;
      oooEndTime = normalizedEnd.time;
      oooEndTimezone = normalizedEnd.timeZone;
    }
  }

  return {
    enableOoo,
    oooMessage,
    sendOooToColleagues,
    useSameColleagueMessage,
    internalOooMessage,
    hasOooEndDate,
    oooEndDate,
    oooEndTime,
    oooEndTimezone,
  };
}
