import { upsertUser } from "./db.js";
import { refreshAccessToken } from "./webex.js";

/**
 * @param {import("./db.js").UserRecord} user
 */
export async function ensureAccessToken(user) {
  const now = Math.floor(Date.now() / 1000);
  if (user.accessToken && user.accessTokenExpiresAt > now + 60) return user.accessToken;
  const refreshed = await refreshAccessToken(user.refreshToken);
  const next = {
    ...user,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? user.refreshToken,
    accessTokenExpiresAt: now + Number(refreshed.expires_in ?? 3600),
  };
  upsertUser(next);
  return next.accessToken;
}
