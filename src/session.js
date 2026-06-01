import crypto from "node:crypto";
import cookieParser from "cookie-parser";
import { config } from "./config.js";
import { deleteSession, getSession, getUserByPersonId, toUserProfile, upsertUser } from "./db.js";
import { ensureOooEndNotExpired } from "./ooo-end-settings.js";

export const SESSION_COOKIE = "sid";
const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;

export const sessionCookieParser = cookieParser(config.sessionSecret);

/**
 * @typedef {{ id: string, personId: string, profile: import("./db.js").UserProfile }} AppSession
 */

/**
 * Attach `req.session` when a valid cookie is present.
 * @param {import("express").Request} req
 * @param {import("express").Response} _res
 * @param {import("express").NextFunction} next
 */
export function loadSession(req, _res, next) {
  const sid = req.cookies?.[SESSION_COOKIE];
  if (typeof sid !== "string" || !sid) {
    req.session = null;
    return next();
  }

  const record = getSession(sid);
  if (!record || record.expiresAt <= Math.floor(Date.now() / 1000)) {
    if (record) deleteSession(sid);
    req.session = null;
    return next();
  }

  const storedUser = getUserByPersonId(record.personId);
  if (!storedUser) {
    deleteSession(sid);
    req.session = null;
    return next();
  }

  const user = ensureOooEndNotExpired(storedUser);
  if (user.hasOooEndDate !== storedUser.hasOooEndDate) {
    upsertUser(user);
  }

  /** @type {AppSession} */
  req.session = {
    id: sid,
    personId: record.personId,
    profile: toUserProfile(user),
  };
  next();
}

/**
 * @param {import("express").Response} res
 * @param {string} sessionId
 */
export function setSessionCookie(res, sessionId) {
  res.cookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.secureCookies,
    maxAge: SESSION_MAX_AGE_SEC * 1000,
    path: "/",
  });
}

/**
 * @param {import("express").Response} res
 */
export function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.secureCookies,
    path: "/",
  });
}

/**
 * @returns {string}
 */
export function newSessionId() {
  return crypto.randomBytes(32).toString("base64url");
}

export { SESSION_MAX_AGE_SEC };
