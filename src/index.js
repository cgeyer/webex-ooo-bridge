import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import pino from "pino";
import pinoHttp from "pino-http";
import { config, WEBEX_SCOPES } from "./config.js";
import { createSession, deleteSession, getUserByPersonId, upsertUser } from "./db.js";
import { isExchangeSyncEligible } from "./exchange-eligibility.js";
import { pullOooSettingsFromExchange } from "./exchange-sync.js";
import { exchangeMicrosoftAuthorizationCode } from "./graph.js";
import { hasGraphConnection } from "./graph-tokens.js";
import { savePkceState, takePkceState } from "./oauth-state.js";
import { parseOooEndSettings } from "./ooo-end-settings.js";
import { syncOooWebhooks } from "./ooo-sync.js";
import { codeChallengeS256, generateCodeVerifier } from "./pkce.js";
import {
  clearSessionCookie,
  loadSession,
  newSessionId,
  SESSION_MAX_AGE_SEC,
  sessionCookieParser,
  setSessionCookie,
} from "./session.js";
import { dashboardPage, errorPage, escapeHtml, landingPage } from "./ui.js";
import { ensureAccessToken } from "./user-tokens.js";
import { exchangeAuthorizationCode, getMe, getPersonDetails } from "./webex.js";
import { mountWebhookRoutes } from "./webhook-handler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appAssetsDir = path.join(__dirname, "assets");
const momentumTokensDir = path.join(__dirname, "../node_modules/@momentum-design/tokens/dist/css");
const momentumFontsDir = path.join(__dirname, "../node_modules/@momentum-design/fonts/dist");
const momentumComponentsDir = path.join(__dirname, "../node_modules/@momentum-design/components/dist");
const momentumIconsSvgDir = path.join(__dirname, "../node_modules/@momentum-design/icons/dist/svg");

const log = pino({ level: config.logLevel });
const app = express();
const DEFAULT_OOO_MESSAGE = "I'm currently out of office and will reply when I am back.";

/** @param {Record<string, unknown> | undefined} body @param {string} name */
function parseToggle(body, name) {
  const value = body?.[name];
  return value === "1" || value === "on" || value === "isActive";
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        // upgrade-insecure-requests breaks form POST on plain HTTP (form-action 'self' mismatch).
        ...(config.secureCookies ? {} : { "upgrade-insecure-requests": null }),
      },
    },
  })
);
app.use("/assets/app", express.static(appAssetsDir));
app.use("/assets/momentum/tokens", express.static(momentumTokensDir));
app.use("/assets/momentum/fonts", express.static(momentumFontsDir));
app.use("/assets/momentum/components", express.static(momentumComponentsDir));
app.use("/assets/momentum/icons/svg", express.static(momentumIconsSvgDir));
app.use(pinoHttp({ logger: log }));
app.use(sessionCookieParser);
app.use(loadSession);
app.use(express.urlencoded({ extended: false }));
mountWebhookRoutes(app, log);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/", (req, res) => {
  if (req.session) {
    const webhookHint = config.webex.webhookTargetUrl
      ? escapeHtml(config.webex.webhookTargetUrl)
      : "(set WEBEX_WEBHOOK_TARGET_URL)";
    return res.type("html").send(dashboardPage(req.session.profile, webhookHint));
  }
  res.type("html").send(landingPage());
});

function startWebexAuth(_req, res) {
  const verifier = generateCodeVerifier(64);
  const challenge = codeChallengeS256(verifier);
  const state = savePkceState(verifier);
  const url = new URL(config.webex.authorizeUrl);
  url.searchParams.set("client_id", config.webex.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.webex.redirectUri);
  url.searchParams.set("scope", WEBEX_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  res.redirect(302, url.toString());
}

app.get("/auth/webex", startWebexAuth);
app.post("/auth/webex", startWebexAuth);

app.get("/webex/callback", async (req, res) => {
  const err = req.query.error;
  if (err) {
    return res.status(400).type("html").send(errorPage(String(req.query.error_description || err)));
  }
  const code = req.query.code;
  const state = req.query.state;
  if (typeof code !== "string" || typeof state !== "string") {
    return res.status(400).send("Missing code or state");
  }
  const authState = takePkceState(state);
  if (!authState || authState.flow === "microsoft") {
    return res.status(400).send('Invalid or expired state — try <a href="/">again</a>.');
  }

  const { codeVerifier } = authState;

  try {
    const tokens = await exchangeAuthorizationCode(code, codeVerifier);
    const accessToken = tokens.access_token;
    const me = await getMe(accessToken);
    const personId = String(me.id);
    const person = await getPersonDetails(accessToken, personId);
    const email = String(person.emails?.[0] ?? person.email ?? me.emails?.[0] ?? me.email ?? "");
    const displayName =
      typeof person.displayName === "string" && person.displayName.trim()
        ? person.displayName.trim()
        : email.split("@")[0] || personId;
    const previous = getUserByPersonId(personId);

    const normalizedMessage = previous?.oooMessage?.trim() || DEFAULT_OOO_MESSAGE;
    const accessTokenExpiresAt = Math.floor(Date.now() / 1000) + Number(tokens.expires_in ?? 3600);

    let userRecord = {
      personId,
      email,
      displayName,
      accessToken,
      refreshToken: String(tokens.refresh_token ?? previous?.refreshToken ?? ""),
      accessTokenExpiresAt,
      enableOoo: previous?.enableOoo ?? false,
      oooMessage: normalizedMessage,
      sendOooToColleagues: previous?.sendOooToColleagues ?? false,
      useSameColleagueMessage: previous?.useSameColleagueMessage ?? true,
      internalOooMessage: previous?.internalOooMessage ?? normalizedMessage,
      notifyIncomingMessages: previous?.notifyIncomingMessages ?? false,
      hasOooEndDate: previous?.hasOooEndDate ?? false,
      oooEndDate: previous?.oooEndDate ?? "",
      oooEndTime: previous?.oooEndTime ?? "",
      oooEndTimezone: previous?.oooEndTimezone ?? "",
      useExchangeOoo: previous?.useExchangeOoo ?? false,
      graphAccessToken: previous?.graphAccessToken ?? "",
      graphRefreshToken: previous?.graphRefreshToken ?? "",
      graphAccessTokenExpiresAt: previous?.graphAccessTokenExpiresAt ?? 0,
      webhookIds: previous?.webhookIds ?? [],
    };

    upsertUser(userRecord);

    if (userRecord.useExchangeOoo && hasGraphConnection(userRecord)) {
      try {
        userRecord = await pullOooSettingsFromExchange(userRecord, DEFAULT_OOO_MESSAGE);
      } catch (syncErr) {
        log.warn({ err: syncErr, personId }, "exchange sync on login failed");
      }
    }

    const accessTokenForWebhooks = await ensureAccessToken(userRecord);
    const { webhookIds } = await syncOooWebhooks(accessTokenForWebhooks, userRecord.enableOoo);
    userRecord.webhookIds = webhookIds;
    upsertUser(userRecord);

    const sessionId = newSessionId();
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC;
    createSession(sessionId, personId, expiresAt);
    setSessionCookie(res, sessionId);

    log.info({ personId, enableOoo: userRecord.enableOoo, webhookIds }, "user signed in");
    res.redirect(302, "/");
  } catch (e) {
    log.error(e, "callback failed");
    return res.status(500).type("html").send(errorPage(e instanceof Error ? e.message : "Unknown error"));
  }
});

app.get("/auth/microsoft", (req, res) => {
  if (!req.session) {
    return res.status(401).type("html").send(errorPage("You must sign in to connect Microsoft 365."));
  }
  if (!config.exchangeSync.enabled) {
    return res.status(503).type("html").send(errorPage("Exchange sync is not configured on this server."));
  }
  if (!isExchangeSyncEligible(req.session.profile.email)) {
    return res.status(403).type("html").send(errorPage("Microsoft 365 sync is not available for your account."));
  }

  const verifier = generateCodeVerifier(64);
  const challenge = codeChallengeS256(verifier);
  const state = savePkceState(verifier, { personId: req.session.personId, flow: "microsoft" });
  const url = new URL(config.exchangeSync.authorizeUrl);
  url.searchParams.set("client_id", config.exchangeSync.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.exchangeSync.redirectUri);
  url.searchParams.set("scope", config.exchangeSync.scopes);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("response_mode", "query");
  res.redirect(302, url.toString());
});

app.get("/microsoft/callback", async (req, res) => {
  if (!req.session) {
    return res.status(401).type("html").send(errorPage("Session expired — sign in with Webex first."));
  }
  const err = req.query.error;
  if (err) {
    return res.status(400).type("html").send(errorPage(String(req.query.error_description || err)));
  }
  const code = req.query.code;
  const state = req.query.state;
  if (typeof code !== "string" || typeof state !== "string") {
    return res.status(400).type("html").send(errorPage("Missing Microsoft authorization code or state."));
  }

  const authState = takePkceState(state);
  if (!authState || authState.flow !== "microsoft" || authState.personId !== req.session.personId) {
    return res.status(400).type("html").send(errorPage("Invalid or expired Microsoft sign-in state."));
  }

  try {
    const user = getUserByPersonId(req.session.personId);
    if (!user) {
      return res.status(401).type("html").send(errorPage("User not found — sign in again."));
    }

    const tokens = await exchangeMicrosoftAuthorizationCode(code, authState.codeVerifier);
    const now = Math.floor(Date.now() / 1000);
    let nextUser = {
      ...user,
      useExchangeOoo: true,
      graphAccessToken: String(tokens.access_token),
      graphRefreshToken: String(tokens.refresh_token ?? ""),
      graphAccessTokenExpiresAt: now + Number(tokens.expires_in ?? 3600),
    };

    nextUser = await pullOooSettingsFromExchange(nextUser, DEFAULT_OOO_MESSAGE);
    const accessToken = await ensureAccessToken(nextUser);
    const { webhookIds } = await syncOooWebhooks(accessToken, nextUser.enableOoo);
    nextUser.webhookIds = webhookIds;
    upsertUser(nextUser);

    log.info({ personId: user.personId }, "connected Microsoft 365 and synced Exchange OOO");
    res.redirect(302, "/");
  } catch (e) {
    log.error(e, "microsoft callback failed");
    return res.status(500).type("html").send(errorPage(e instanceof Error ? e.message : "Unknown error"));
  }
});

app.post("/settings", async (req, res) => {
  if (!req.session) {
    return res.status(401).type("html").send(errorPage("You must sign in to update settings."));
  }

  try {
    const user = getUserByPersonId(req.session.personId);
    if (!user) {
      clearSessionCookie(res);
      return res.status(401).type("html").send(errorPage("Session expired — please sign in again."));
    }

    const exchangeEligible = isExchangeSyncEligible(user.email);
    const useExchangeOoo = exchangeEligible ? parseToggle(req.body, "useExchangeOoo") : false;

    if (useExchangeOoo && !hasGraphConnection(user)) {
      return res.redirect(302, "/auth/microsoft");
    }

    let workingUser = { ...user, useExchangeOoo };

    if (useExchangeOoo) {
      workingUser = await pullOooSettingsFromExchange(workingUser, DEFAULT_OOO_MESSAGE);
      const notifyIncomingMessages = parseToggle(req.body, "notifyIncomingMessages");
      const accessToken = await ensureAccessToken(workingUser);
      const { webhookIds } = await syncOooWebhooks(accessToken, workingUser.enableOoo);

      upsertUser({
        ...workingUser,
        notifyIncomingMessages,
        webhookIds,
      });

      log.info(
        {
          personId: user.personId,
          useExchangeOoo: true,
          enableOoo: workingUser.enableOoo,
          notifyIncomingMessages,
          webhookIds,
        },
        "updated user settings from Exchange"
      );
      return res.redirect(302, "/");
    }

    const enableOoo = parseToggle(req.body, "enableOoo");
    const oooMessage = enableOoo
      ? typeof req.body?.oooMessage === "string" && req.body.oooMessage.trim()
        ? req.body.oooMessage.trim()
        : user.oooMessage.trim() || DEFAULT_OOO_MESSAGE
      : user.oooMessage.trim() || DEFAULT_OOO_MESSAGE;
    const sendOooToColleagues = enableOoo
      ? parseToggle(req.body, "sendOooToColleagues")
      : user.sendOooToColleagues;
    const notifyIncomingMessages = enableOoo
      ? parseToggle(req.body, "notifyIncomingMessages")
      : user.notifyIncomingMessages;

    let useSameColleagueMessage = user.useSameColleagueMessage;
    let internalOooMessage = user.internalOooMessage;
    if (enableOoo && sendOooToColleagues) {
      useSameColleagueMessage = parseToggle(req.body, "useSameColleagueMessage");
      if (!useSameColleagueMessage) {
        internalOooMessage =
          typeof req.body?.internalOooMessage === "string" && req.body.internalOooMessage.trim()
            ? req.body.internalOooMessage.trim()
            : user.internalOooMessage.trim() || oooMessage;
      }
    }

    const endSettings = parseOooEndSettings(user, req.body);
    if (endSettings.error) {
      return res.status(400).type("html").send(errorPage(endSettings.error));
    }

    const accessToken = await ensureAccessToken(user);
    const { webhookIds } = await syncOooWebhooks(accessToken, enableOoo);

    upsertUser({
      ...user,
      useExchangeOoo: false,
      enableOoo,
      oooMessage,
      sendOooToColleagues,
      useSameColleagueMessage,
      internalOooMessage,
      notifyIncomingMessages,
      hasOooEndDate: endSettings.hasOooEndDate,
      oooEndDate: endSettings.oooEndDate,
      oooEndTime: endSettings.oooEndTime,
      oooEndTimezone: endSettings.oooEndTimezone,
      webhookIds,
    });

    log.info(
      {
        personId: user.personId,
        enableOoo,
        sendOooToColleagues,
        useSameColleagueMessage,
        notifyIncomingMessages,
        hasOooEndDate: endSettings.hasOooEndDate,
        webhookIds,
      },
      "updated user settings"
    );
    res.redirect(302, "/");
  } catch (e) {
    log.error(e, "settings update failed");
    return res.status(500).type("html").send(errorPage(e instanceof Error ? e.message : "Unknown error"));
  }
});

app.post("/logout", (req, res) => {
  if (req.session?.id) deleteSession(req.session.id);
  clearSessionCookie(res);
  res.redirect(302, "/");
});

app.use((err, _req, res, _next) => {
  log.error(err, "unhandled");
  res.status(500).json({ error: "Server error" });
});

app.listen(config.port, config.listenHost, () => {
  log.info(
    {
      host: config.listenHost,
      port: config.port,
      webhookTargetUrl: config.webex.webhookTargetUrl ?? null,
      dbPath: config.dbPath,
    },
    "listening"
  );
});
