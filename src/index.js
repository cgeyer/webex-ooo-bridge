import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import pino from "pino";
import pinoHttp from "pino-http";
import { config, WEBEX_SCOPES } from "./config.js";
import { createSession, deleteSession, getUserByPersonId, upsertUser } from "./db.js";
import { savePkceState, takePkceState } from "./oauth-state.js";
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
  if (!authState) {
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

    const enableOoo = previous?.enableOoo ?? false;
    const normalizedMessage = previous?.oooMessage?.trim() || DEFAULT_OOO_MESSAGE;

    const { webhookIds } = await syncOooWebhooks(accessToken, enableOoo);
    const accessTokenExpiresAt = Math.floor(Date.now() / 1000) + Number(tokens.expires_in ?? 3600);

    upsertUser({
      personId,
      email,
      displayName,
      accessToken,
      refreshToken: String(tokens.refresh_token ?? previous?.refreshToken ?? ""),
      accessTokenExpiresAt,
      enableOoo,
      oooMessage: normalizedMessage,
      sendOooToColleagues: previous?.sendOooToColleagues ?? false,
      useSameColleagueMessage: previous?.useSameColleagueMessage ?? true,
      internalOooMessage: previous?.internalOooMessage ?? normalizedMessage,
      webhookIds,
    });

    const sessionId = newSessionId();
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC;
    createSession(sessionId, personId, expiresAt);
    setSessionCookie(res, sessionId);

    log.info({ personId, enableOoo, webhookIds }, "user signed in");
    res.redirect(302, "/");
  } catch (e) {
    log.error(e, "callback failed");
    return res.status(500).type("html").send(errorPage(e instanceof Error ? e.message : "Unknown error"));
  }
});

app.post("/settings", async (req, res) => {
  if (!req.session) {
    return res.status(401).type("html").send(errorPage("You must sign in to update settings."));
  }

  const enableOoo = parseToggle(req.body, "enableOoo");
  const oooMessage =
    typeof req.body?.oooMessage === "string" && req.body.oooMessage.trim()
      ? req.body.oooMessage.trim()
      : DEFAULT_OOO_MESSAGE;
  const sendOooToColleagues = parseToggle(req.body, "sendOooToColleagues");

  try {
    const user = getUserByPersonId(req.session.personId);
    if (!user) {
      clearSessionCookie(res);
      return res.status(401).type("html").send(errorPage("Session expired — please sign in again."));
    }

    let useSameColleagueMessage = user.useSameColleagueMessage;
    let internalOooMessage = user.internalOooMessage;
    if (sendOooToColleagues) {
      useSameColleagueMessage = parseToggle(req.body, "useSameColleagueMessage");
      if (!useSameColleagueMessage) {
        internalOooMessage =
          typeof req.body?.internalOooMessage === "string" && req.body.internalOooMessage.trim()
            ? req.body.internalOooMessage.trim()
            : user.internalOooMessage.trim() || oooMessage;
      }
    }

    const accessToken = await ensureAccessToken(user);
    const { webhookIds } = await syncOooWebhooks(accessToken, enableOoo);

    upsertUser({
      ...user,
      enableOoo,
      oooMessage,
      sendOooToColleagues,
      useSameColleagueMessage,
      internalOooMessage,
      webhookIds,
    });

    log.info(
      { personId: user.personId, enableOoo, sendOooToColleagues, useSameColleagueMessage, webhookIds },
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
