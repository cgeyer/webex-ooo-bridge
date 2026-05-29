import "dotenv/config";
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
import { ensureAccessToken } from "./user-tokens.js";
import { exchangeAuthorizationCode, getMe } from "./webex.js";
import { mountWebhookRoutes, WEBHOOK_MESSAGES_PATH } from "./webhook-handler.js";

const log = pino({ level: config.logLevel });
const app = express();
const DEFAULT_OOO_MESSAGE = "I'm currently out of office and will reply when I am back.";

app.use(helmet());
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
    return res.type("html").send(dashboardPage(req.session.profile));
  }
  res.type("html").send(landingPage());
});

app.post("/auth/webex", (_req, res) => {
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
});

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
    const email = String(me.emails?.[0] ?? me.email ?? "");
    const previous = getUserByPersonId(personId);

    const enableOoo = previous?.enableOoo ?? false;
    const normalizedMessage = previous?.oooMessage?.trim() || DEFAULT_OOO_MESSAGE;

    const { webhookIds } = await syncOooWebhooks(accessToken, enableOoo);
    const accessTokenExpiresAt = Math.floor(Date.now() / 1000) + Number(tokens.expires_in ?? 3600);

    upsertUser({
      personId,
      email,
      accessToken,
      refreshToken: String(tokens.refresh_token ?? previous?.refreshToken ?? ""),
      accessTokenExpiresAt,
      enableOoo,
      oooMessage: normalizedMessage,
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

  const enableOoo = req.body?.enableOoo === "on" || req.body?.enableOoo === "1";
  const oooMessage =
    typeof req.body?.oooMessage === "string" && req.body.oooMessage.trim()
      ? req.body.oooMessage.trim()
      : DEFAULT_OOO_MESSAGE;

  try {
    const user = getUserByPersonId(req.session.personId);
    if (!user) {
      clearSessionCookie(res);
      return res.status(401).type("html").send(errorPage("Session expired — please sign in again."));
    }

    const accessToken = await ensureAccessToken(user);
    const { webhookIds } = await syncOooWebhooks(accessToken, enableOoo);

    upsertUser({
      ...user,
      enableOoo,
      oooMessage,
      webhookIds,
    });

    log.info({ personId: user.personId, enableOoo, webhookIds }, "updated user settings");
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

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function landingPage() {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Webex Out of Office</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1.5rem; line-height: 1.5; color: #1a1a1a; }
  h1 { font-size: 1.75rem; margin-bottom: 1rem; }
  p { color: #444; margin-bottom: 2rem; }
  button { font: inherit; padding: 0.65rem 1.25rem; background: #0073e6; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
  button:hover { background: #005bb5; }
</style>
</head><body>
<h1>Webex Out of Office</h1>
<p>Automatically reply in Webex when you are away — in direct messages and when you are @mentioned in spaces. Sign in to configure your message and turn replies on or off.</p>
<form method="post" action="/auth/webex">
  <button type="submit">Sign in with Webex</button>
</form>
</body></html>`;
}

/**
 * @param {import("./db.js").UserProfile} profile
 */
function dashboardPage(profile) {
  const webhookHint = config.webex.webhookTargetUrl
    ? escapeHtml(config.webex.webhookTargetUrl)
    : `(set WEBEX_WEBHOOK_TARGET_URL)`;
  const webhookList =
    profile.webhookIds.length > 0
      ? `<ul>${profile.webhookIds.map((id) => `<li><code>${escapeHtml(id)}</code></li>`).join("")}</ul>`
      : "<p><em>None — out of office is disabled or webhooks were cleared.</em></p>";

  return `<!doctype html><html><head><meta charset="utf-8"><title>Webex OOO — Settings</title></head><body>
<h1>Out of office settings</h1>
<p>Signed in as <strong>${escapeHtml(profile.email || profile.personId)}</strong></p>
<p><small>Webex person ID: <code>${escapeHtml(profile.personId)}</code></small></p>
<form method="post" action="/settings">
  <p>
    <label>
      <input type="checkbox" name="enableOoo" value="1"${profile.enableOoo ? " checked" : ""}>
      Enable out of office
    </label>
  </p>
  <p>
    <label for="oooMessage">Out of office message</label><br>
    <textarea id="oooMessage" name="oooMessage" rows="5" cols="60">${escapeHtml(profile.oooMessage)}</textarea>
  </p>
  <p><button type="submit">Save settings</button></p>
</form>
<h2>Registered webhooks</h2>
<p><small>Target URL: <code>${webhookHint}</code></small></p>
${webhookList}
<p>
  <form method="post" action="/auth/webex" style="display:inline">
    <button type="submit">Re-authenticate with Webex</button>
  </form>
  <form method="post" action="/logout" style="display:inline;margin-left:0.5em">
    <button type="submit">Sign out</button>
  </form>
</p>
</body></html>`;
}

function errorPage(message) {
  return `<!doctype html><html><body>
<h1>Error</h1>
<p>${escapeHtml(message)}</p>
<p><a href="/">Try again</a></p>
</body></html>`;
}
