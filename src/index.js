import "dotenv/config";
import express from "express";
import helmet from "helmet";
import pino from "pino";
import pinoHttp from "pino-http";
import { MESSAGE_TEXT, TARGET_EMAIL } from "./constants.js";
import { config, WEBEX_SCOPES } from "./config.js";
import { savePkceState, takePkceState } from "./oauth-state.js";
import { codeChallengeS256, generateCodeVerifier } from "./pkce.js";
import { exchangeAuthorizationCode, registerOooWebhooks, sendDirectMessage } from "./webex.js";
import { mountWebhookRoutes, WEBHOOK_MESSAGES_PATH } from "./webhook-handler.js";

const log = pino({ level: config.logLevel });
const app = express();

app.use(helmet());
app.use(pinoHttp({ logger: log }));
app.use(express.urlencoded({ extended: false }));
mountWebhookRoutes(app, log);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/", (_req, res) => {
  res.type("html").send(landingPage());
});

app.post("/auth/webex", (req, res) => {
  const enableOoo = req.body?.enableOoo === "on" || req.body?.enableOoo === "1";
  const oooMessage = typeof req.body?.oooMessage === "string" ? req.body.oooMessage : "";

  const verifier = generateCodeVerifier(64);
  const challenge = codeChallengeS256(verifier);
  const state = savePkceState(verifier, { enableOoo, oooMessage });
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
    return res.status(400).send("Invalid or expired state — try <a href=\"/\">again</a>.");
  }

  const { codeVerifier, enableOoo, oooMessage } = authState;
  const messageText =
    enableOoo && oooMessage.trim() ? oooMessage.trim() : MESSAGE_TEXT;

  try {
    const tokens = await exchangeAuthorizationCode(code, codeVerifier);
    const accessToken = tokens.access_token;

    /** @type {{ mentioned: object, direct: object, targetUrl: string } | null} */
    let webhooks = null;
    if (enableOoo) {
      if (!config.webex.webhookTargetUrl) {
        throw new Error(
          "Out of office is enabled but WEBEX_WEBHOOK_TARGET_URL is not set. " +
            `Example: http://localhost:${config.port}${WEBHOOK_MESSAGES_PATH}`
        );
      }
      webhooks = await registerOooWebhooks(accessToken);
      log.info(
        {
          mentionedId: webhooks.mentioned.id,
          directId: webhooks.direct.id,
          targetUrl: webhooks.targetUrl,
        },
        "registered OOO webhooks"
      );
    }

    const msg = await sendDirectMessage(accessToken, TARGET_EMAIL, messageText);
    log.info(
      { to: TARGET_EMAIL, messageId: msg.id, enableOoo, usedOooMessage: enableOoo && Boolean(oooMessage.trim()) },
      "sent direct message"
    );
    return res
      .type("html")
      .send(successPage(TARGET_EMAIL, msg.id, tokens, { enableOoo, oooMessage, messageText }, webhooks));
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
  log.info(
    { port: config.port, target: TARGET_EMAIL, webhookTargetUrl: config.webex.webhookTargetUrl ?? null },
    "listening"
  );
});

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function landingPage() {
  const webhookHint = config.webex.webhookTargetUrl
    ? escapeHtml(config.webex.webhookTargetUrl)
    : `(set WEBEX_WEBHOOK_TARGET_URL, e.g. http://localhost:${config.port}${WEBHOOK_MESSAGES_PATH})`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Webex OOO test</title></head><body>
<h1>Webex message test</h1>
<p>Recipient: <strong>${escapeHtml(TARGET_EMAIL)}</strong></p>
<form method="post" action="/auth/webex">
  <p>
    <label>
      <input type="checkbox" name="enableOoo" value="1">
      Enable out of office
    </label>
  </p>
  <p>
    <label for="oooMessage">Out of office message</label><br>
    <textarea id="oooMessage" name="oooMessage" rows="5" cols="60" placeholder="I am out of the office until ..."></textarea>
  </p>
  <p><button type="submit">Sign in with Webex</button></p>
</form>
<p><small>If out of office is enabled, two webhooks are registered (mentions + direct) to <code>${webhookHint}</code>.</small></p>
<p><small>If out of office is disabled, the default test message from <code>constants.js</code> is sent instead.</small></p>
</body></html>`;
}

/**
 * @param {string} recipientName
 * @param {string} messageId
 * @param {object} tokens
 * @param {{ enableOoo: boolean, oooMessage: string, messageText: string }} ooo
 * @param {{ mentioned: { id?: string, filter?: string }, direct: { id?: string, filter?: string }, targetUrl: string } | null} webhooks
 */
function successPage(recipientName, messageId, tokens, ooo, webhooks) {
  const webhookSection = webhooks
    ? `<h2>Webhooks registered</h2>
<p><strong>Target URL</strong>: <code>${escapeHtml(webhooks.targetUrl)}</code></p>
<ul>
  <li><strong>Mentions</strong> — filter <code>mentionedPeople=me</code>, id <code>${escapeHtml(String(webhooks.mentioned.id ?? ""))}</code></li>
  <li><strong>Direct</strong> — filter <code>roomType=direct</code>, id <code>${escapeHtml(String(webhooks.direct.id ?? ""))}</code></li>
</ul>
<p><small>Webhook secret: ${webhooks.secretFromEnv ? "from WEBEX_WEBHOOK_SECRET" : "auto-generated — set WEBEX_WEBHOOK_SECRET in .env to verify signatures"}</small></p>`
    : `<h2>Webhooks</h2><p>Not registered (out of office was disabled).</p>`;

  return `<!doctype html><html><body>
<h1>Message sent</h1>
<p>Sent to <strong>${escapeHtml(recipientName)}</strong> on your behalf.</p>
<p>Message id: <code>${escapeHtml(String(messageId))}</code></p>
<h2>Out of office</h2>
<p><strong>Enabled</strong>: ${ooo.enableOoo ? "yes" : "no"}</p>
<p><strong>Configured message</strong>:</p>
<pre>${escapeHtml(ooo.oooMessage || "(empty)")}</pre>
<p><strong>Text actually sent</strong>:</p>
<pre>${escapeHtml(ooo.messageText)}</pre>
${webhookSection}
<h2>OAuth tokens</h2>
<p><strong>Access token</strong><br><code>${escapeHtml(String(tokens?.access_token ?? ""))}</code></p>
<p><strong>Refresh token</strong><br><code>${escapeHtml(String(tokens?.refresh_token ?? ""))}</code></p>
<p><strong>Token type</strong>: <code>${escapeHtml(String(tokens?.token_type ?? ""))}</code></p>
<p><strong>Access token expires in</strong>: <code>${escapeHtml(String(tokens?.expires_in ?? ""))}</code> seconds</p>
<p><strong>Refresh token expires in</strong>: <code>${escapeHtml(String(tokens?.refresh_token_expires_in ?? ""))}</code> seconds</p>
<p><a href="/">Home</a></p>
</body></html>`;
}

function errorPage(message) {
  return `<!doctype html><html><body>
<h1>Error</h1>
<p>${escapeHtml(message)}</p>
<p><a href="/">Try again</a></p>
</body></html>`;
}
