import "dotenv/config";
import express from "express";
import helmet from "helmet";
import pino from "pino";
import pinoHttp from "pino-http";
import { MESSAGE_TEXT, TARGET_EMAIL } from "./constants.js";
import { config, WEBEX_SCOPES } from "./config.js";
import { savePkceState, takePkceState } from "./oauth-state.js";
import { codeChallengeS256, generateCodeVerifier } from "./pkce.js";
import { exchangeAuthorizationCode, sendDirectMessage } from "./webex.js";

const log = pino({ level: config.logLevel });
const app = express();

app.use(helmet());
app.use(pinoHttp({ logger: log }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html><html><body>
<h1>Webex message test</h1>
<p>Target: <strong>${escapeHtml(TARGET_EMAIL)}</strong></p>
<p><a href="/auth/webex">Sign in with Webex</a> — then a 1:1 message is sent on your behalf.</p>
</body></html>`);
});

app.get("/auth/webex", (_req, res) => {
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
  const verifier = takePkceState(state);
  if (!verifier) {
    return res.status(400).send("Invalid or expired state — try <a href=\"/auth/webex\">again</a>.");
  }

  try {
    const tokens = await exchangeAuthorizationCode(code, verifier);
    const accessToken = tokens.access_token;
    const msg = await sendDirectMessage(accessToken, TARGET_EMAIL, MESSAGE_TEXT);
    log.info({ to: TARGET_EMAIL, messageId: msg.id }, "sent direct message");
    return res.type("html").send(successPage(TARGET_EMAIL, msg.id));
  } catch (e) {
    log.error(e, "callback failed");
    return res.status(500).type("html").send(errorPage(e instanceof Error ? e.message : "Unknown error"));
  }
});

app.use((err, _req, res, _next) => {
  log.error(err, "unhandled");
  res.status(500).json({ error: "Server error" });
});

app.listen(config.port, () => {
  log.info({ port: config.port, target: TARGET_EMAIL }, "listening");
});

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function successPage(recipientName, messageId) {
  return `<!doctype html><html><body>
<h1>Message sent</h1>
<p>Sent to <strong>${escapeHtml(recipientName)}</strong> on your behalf.</p>
<p>Message id: <code>${escapeHtml(String(messageId))}</code></p>
<p><a href="/">Home</a></p>
</body></html>`;
}

function errorPage(message) {
  return `<!doctype html><html><body>
<h1>Error</h1>
<p>${escapeHtml(message)}</p>
<p><a href="/auth/webex">Try again</a></p>
</body></html>`;
}
