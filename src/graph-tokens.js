import { upsertUser } from "./db.js";
import { refreshMicrosoftAccessToken } from "./graph.js";

/**
 * @param {import("./db.js").UserRecord} user
 */
export function hasGraphConnection(user) {
  return Boolean(user.graphRefreshToken?.trim());
}

/**
 * @param {import("./db.js").UserRecord} user
 */
export async function ensureGraphAccessToken(user) {
  const now = Math.floor(Date.now() / 1000);
  if (user.graphAccessToken && user.graphAccessTokenExpiresAt > now + 60) {
    return user.graphAccessToken;
  }
  if (!user.graphRefreshToken) {
    throw new Error("Microsoft 365 is not connected for this account.");
  }
  const refreshed = await refreshMicrosoftAccessToken(user.graphRefreshToken);
  const next = {
    ...user,
    graphAccessToken: String(refreshed.access_token),
    graphRefreshToken: String(refreshed.refresh_token ?? user.graphRefreshToken),
    graphAccessTokenExpiresAt: now + Number(refreshed.expires_in ?? 3600),
  };
  upsertUser(next);
  return next.graphAccessToken;
}
