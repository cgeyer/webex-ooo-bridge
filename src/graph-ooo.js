/**
 * Microsoft Graph automatic replies (Exchange OOO) — delegated user.
 * @see https://learn.microsoft.com/en-us/graph/api/mailboxsettings-get
 * @param {string} accessToken
 */
export async function getMailboxSettings(accessToken) {
  const res = await fetch("https://graph.microsoft.com/v1.0/me/mailboxSettings", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph mailboxSettings: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * Picks the reply text to show external senders when status indicates OOO.
 * @param {object} settings
 */
export function extractExternalOooText(settings) {
  const ar = settings?.automaticRepliesSetting;
  if (!ar) {
    return { active: false, text: null };
  }
  const status = ar.status; // "disabled" | "alwaysEnabled" | "scheduled"
  const end = ar.scheduledEndDateTime;
  const start = ar.scheduledStartDateTime;
  const now = new Date();

  let active = false;
  if (status === "alwaysEnabled") {
    active = true;
  } else if (status === "scheduled" && start?.dateTime && end?.dateTime) {
    const s = new Date(start.dateTime);
    const e = new Date(end.dateTime);
    active = now >= s && now <= e;
  }

  const text =
    ar.externalReplyMessage?.content?.trim() ||
    ar.internalReplyMessage?.content?.trim() ||
    null;

  return { active, text, status, scheduledStart: start, scheduledEnd: end };
}
