/** Momentum Design assets served from node_modules via Express. */
export const MDS = {
  tokensCss: "/assets/momentum/tokens/components/complete.css",
  fontsCss: "/assets/momentum/fonts/css/fonts.css",
  fontWoff2: "/assets/momentum/fonts/inter/Inter.var.woff2",
  componentsJs: "/assets/momentum/components/browser/index.js",
  settingsFormJs: "/assets/app/settings-form.js",
  // Typography tokens (--mds-font-family-primary, etc.) live on .mds-typography, not the theme class.
  themeClass: "mds-theme-stable-lightWebex mds-typography",
};

export function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Banner text in the light DOM so mdc-text wrapping styles can apply (shadow-internal labels cannot).
 * @param {string} variant
 * @param {Array<{ type: string, html: string }>} lines
 */
function authLink(label, variant = "primary") {
  return `<a href="/auth/webex" class="ooo-button ooo-button-${variant}">${escapeHtml(label)}</a>`;
}

function submitButton(label, variant = "primary") {
  return `<button type="submit" class="ooo-button ooo-button-${variant}">${escapeHtml(label)}</button>`;
}

function bannerWithText(variant, lines) {
  const textLines = lines
    .map(({ type, html }) => `              <mdc-text type="${type}" tagname="p">${html}</mdc-text>`)
    .join("\n");
  return `<mdc-banner variant="${variant}">
            <div slot="leading-text" class="ooo-banner-text">
${textLines}
            </div>
          </mdc-banner>`;
}

/**
 * @param {{ title: string, content: string, scripts?: string }} options
 */
function renderPage({ title, content, scripts = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${MDS.tokensCss}">
  <link rel="stylesheet" href="${MDS.fontsCss}">
  <link rel="preload" href="${MDS.fontWoff2}" as="font" type="font/woff2" crossorigin>
  <style>${layoutStyles()}</style>
</head>
<body>
  <mdc-themeprovider themeclass="${MDS.themeClass}">
    <mdc-iconprovider icon-set="momentum-icons">
      <div class="ooo-app">
        <mdc-appheader>
          <mdc-text slot="leading" type="heading-small-bold">Webex Out of Office</mdc-text>
        </mdc-appheader>
        <main class="ooo-main">${content}</main>
        <footer class="ooo-footer">
          <span class="ooo-footer-credit">
            Powered by
            <mdc-link inline size="small" href="https://momentum.design" target="_blank" rel="noopener noreferrer">Momentum Design</mdc-link>
          </span>
        </footer>
      </div>
    </mdc-iconprovider>
  </mdc-themeprovider>
  <script src="${MDS.componentsJs}"></script>
  ${scripts}
</body>
</html>`;
}

function layoutStyles() {
  return `
    body { margin: 0; }
    .ooo-app {
      min-height: 100vh; display: flex; flex-direction: column;
      background: var(--mds-color-theme-groupedbackground-primary-normal);
      color: var(--mds-color-theme-text-primary-normal);
    }
    .ooo-main {
      flex: 1; width: min(80%, 60rem); margin: 0 auto;
      padding: 2rem 1.5rem 3rem;
      box-sizing: border-box;
    }
    .ooo-main mdc-card {
      --mdc-card-width: 100%;
      width: 100%;
      max-width: 100%;
    }
    .ooo-main mdc-banner {
      min-width: 0;
    }
    .ooo-main mdc-banner::part(leading),
    .ooo-main mdc-banner::part(leading-text) {
      min-width: 0;
      flex: 1 1 auto;
    }
    .ooo-banner-text {
      min-width: 0;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .ooo-banner-text mdc-text {
      display: block;
      width: 100%;
      min-width: 0;
      max-width: 100%;
    }
    .ooo-banner-text mdc-text::part(text) {
      display: block;
      white-space: normal;
      overflow: visible;
      text-overflow: unset;
      overflow-wrap: anywhere;
      word-break: break-all;
    }
    .ooo-footer {
      padding: 1rem 1.5rem; text-align: center;
      font-size: 0.8125rem;
      color: var(--mds-color-theme-text-secondary-normal);
      border-top: 1px solid var(--mds-color-theme-outline-secondary-normal);
      background: var(--mds-color-theme-background-solid-primary-normal);
    }
    .ooo-footer-credit {
      display: inline-flex;
      align-items: baseline;
      gap: 0.25rem;
      flex-wrap: wrap;
      justify-content: center;
    }
    .ooo-footer mdc-link::part(anchor) {
      font-size: inherit;
      line-height: inherit;
    }
    .ooo-form { display: flex; flex-direction: column; gap: 1.25rem; margin-top: 1.25rem; }
    .ooo-button {
      display: inline-flex; align-items: center; justify-content: center;
      min-height: 2rem; padding: 0 1rem; border-radius: 9999px;
      border: 1px solid transparent; font: inherit; font-size: 0.875rem;
      font-weight: 500; line-height: 1.25rem; text-decoration: none;
      cursor: pointer; box-sizing: border-box;
    }
    .ooo-button-primary {
      background: var(--mds-color-theme-button-accent-normal);
      color: var(--mds-color-theme-common-text-primary-normal);
    }
    .ooo-button-primary:hover {
      background: var(--mds-color-theme-button-accent-hover);
    }
    .ooo-button-secondary {
      background: transparent;
      border-color: var(--mds-color-theme-outline-primary-normal);
      color: var(--mds-color-theme-text-primary-normal);
    }
    .ooo-button-secondary:hover {
      background: var(--mds-color-theme-background-secondary-subtle);
    }
    .ooo-colleague-options {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .ooo-colleague-options[hidden],
    .ooo-internal-message[hidden] { display: none; }
    .ooo-actions { display: flex; flex-wrap: wrap; gap: 0.625rem; margin-top: 1.25rem; }
    .ooo-debug { display: none; }
    .ooo-main code {
      font-family: ui-monospace, "SF Mono", Menlo, monospace;
      font-size: 0.8125rem;
      background: var(--mds-color-theme-background-secondary-subtle);
      padding: 0.125rem 0.375rem; border-radius: 0.25rem;
      word-break: break-all;
      overflow-wrap: anywhere;
    }
  `;
}

function settingsFormScriptTag() {
  return `<script src="${MDS.settingsFormJs}"></script>`;
}

export function landingPage() {
  return renderPage({
    title: "Webex Out of Office",
    content: `
      <mdc-card variant="border">
        <mdc-text slot="title" type="heading-midsize-bold">Stay responsive while you are away</mdc-text>
        <div slot="body">
          <mdc-text type="body-large-regular">
            Automatically reply in Webex direct messages and when you are @mentioned in spaces.
            Sign in to configure your message and turn replies on or off.
          </mdc-text>
          <div class="ooo-form">${authLink("Sign in with Webex")}</div>
        </div>
      </mdc-card>`,
  });
}

/**
 * @param {import("./db.js").UserProfile} profile
 * @param {string} webhookHint
 */
export function dashboardPage(profile, webhookHint) {
  const welcomeName = profile.displayName || profile.email || profile.personId;
  const enableOooChecked = profile.enableOoo ? " checked" : "";
  const sendColleaguesChecked = profile.sendOooToColleagues ? " checked" : "";
  const sameMessageChecked = profile.useSameColleagueMessage ? " checked" : "";
  const colleagueOptionsHidden = profile.sendOooToColleagues ? "" : " hidden";
  const internalMessageHidden =
    profile.sendOooToColleagues && !profile.useSameColleagueMessage ? "" : " hidden";
  const internalMessage = profile.internalOooMessage || profile.oooMessage;

  return renderPage({
    title: "Settings — Webex Out of Office",
    scripts: settingsFormScriptTag(),
    content: `
      <mdc-card variant="border">
        <mdc-text slot="title" type="heading-midsize-bold">Out of office settings</mdc-text>
        <div slot="body">
          <div class="ooo-debug" data-debug="user">
            <span data-debug="email">${escapeHtml(profile.email)}</span>
            <span data-debug="person-id">${escapeHtml(profile.personId)}</span>
          </div>
          <div class="ooo-debug" data-debug="webhooks">
            <span data-debug="webhook-target">${webhookHint}</span>
            <span data-debug="webhook-ids">${escapeHtml(profile.webhookIds.join(", "))}</span>
          </div>
          ${bannerWithText("informational", [
            {
              type: "body-midsize-bold",
              html: `Welcome ${escapeHtml(welcomeName)}`,
            },
          ])}
          <form method="post" action="/settings" class="ooo-form ooo-settings-form">
            <mdc-toggle name="enableOoo" label="Out of office" value="1"${enableOooChecked}></mdc-toggle>
            <mdc-textarea
              name="oooMessage"
              label="Out of office message"
              value="${escapeHtml(profile.oooMessage)}"
              rows="5"
            ></mdc-textarea>
            <mdc-toggle
              name="sendOooToColleagues"
              label="Send out of office message to colleagues"
              value="1"${sendColleaguesChecked}
            ></mdc-toggle>
            <div class="ooo-colleague-options"${colleagueOptionsHidden}>
              <mdc-toggle
                name="useSameColleagueMessage"
                label="Use same out of office message for internal and external users"
                value="1"${sameMessageChecked}
              ></mdc-toggle>
              <div class="ooo-internal-message"${internalMessageHidden}>
                <mdc-textarea
                  name="internalOooMessage"
                  label="Out of office message for colleagues"
                  value="${escapeHtml(internalMessage)}"
                  rows="5"
                ></mdc-textarea>
              </div>
            </div>
            ${submitButton("Save settings", "primary")}
          </form>
          <div class="ooo-actions">
            ${authLink("Re-authenticate with Webex", "secondary")}
            <form method="post" action="/logout">
              ${submitButton("Sign out", "secondary")}
            </form>
          </div>
        </div>
      </mdc-card>`,
  });
}

/**
 * @param {string} message
 */
export function errorPage(message) {
  return renderPage({
    title: "Error — Webex Out of Office",
    content: `
      <mdc-card variant="border">
        <mdc-text slot="title" type="heading-midsize-bold">Something went wrong</mdc-text>
        <div slot="body">
          ${bannerWithText("error", [{ type: "body-midsize-medium", html: escapeHtml(message) }])}
          <p class="ooo-form"><mdc-link href="/">Try again</mdc-link></p>
        </div>
      </mdc-card>`,
  });
}
