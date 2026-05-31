/** Momentum Design assets served from node_modules via Express. */
export const MDS = {
  tokensCss: "/assets/momentum/tokens/components/complete.css",
  fontsCss: "/assets/momentum/fonts/css/fonts.css",
  fontWoff2: "/assets/momentum/fonts/inter/Inter.var.woff2",
  componentsJs: "/assets/momentum/components/browser/index.js",
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
 * @param {{ title: string, content: string }} options
 */
function renderPage({ title, content }) {
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
          Powered by
          <mdc-link href="https://momentum.design" target="_blank" rel="noopener noreferrer">Momentum Design</mdc-link>
        </footer>
      </div>
    </mdc-iconprovider>
  </mdc-themeprovider>
  <script src="${MDS.componentsJs}"></script>
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
    .ooo-form { display: flex; flex-direction: column; gap: 1.25rem; margin-top: 1.25rem; }
    .ooo-card-spaced { margin-top: 1rem; display: block; }
    .ooo-actions { display: flex; flex-wrap: wrap; gap: 0.625rem; margin-top: 1.25rem; }
    .ooo-list { margin: 0.75rem 0 0; padding-left: 1.25rem; }
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
          <form method="post" action="/auth/webex" class="ooo-form">
            <mdc-button type="submit" variant="primary" color="accent" size="32">Sign in with Webex</mdc-button>
          </form>
        </div>
      </mdc-card>`,
  });
}

/**
 * @param {import("./db.js").UserProfile} profile
 * @param {string} webhookHint
 */
export function dashboardPage(profile, webhookHint) {
  const webhookList =
    profile.webhookIds.length > 0
      ? `<ul class="ooo-list">${profile.webhookIds.map((id) => `<li><code>${escapeHtml(id)}</code></li>`).join("")}</ul>`
      : `<ul class="ooo-list"><li><em>None — out of office is disabled or webhooks were cleared.</em></li></ul>`;

  const toggleChecked = profile.enableOoo ? " checked" : "";

  return renderPage({
    title: "Settings — Webex Out of Office",
    content: `
      <mdc-card variant="border">
        <mdc-text slot="title" type="heading-midsize-bold">Out of office settings</mdc-text>
        <div slot="body">
          ${bannerWithText("informational", [
            {
              type: "body-midsize-bold",
              html: `Signed in as ${escapeHtml(profile.email || profile.personId)}`,
            },
            {
              type: "body-midsize-regular",
              html: `Webex person ID: ${escapeHtml(profile.personId)}`,
            },
          ])}
          <form method="post" action="/settings" class="ooo-form">
            <mdc-toggle name="enableOoo" label="Out of office" value="1"${toggleChecked}></mdc-toggle>
            <mdc-textarea
              name="oooMessage"
              label="Out of office message"
              value="${escapeHtml(profile.oooMessage)}"
              rows="5"
            ></mdc-textarea>
            <mdc-button type="submit" variant="primary" color="accent" size="32">Save settings</mdc-button>
          </form>
        </div>
      </mdc-card>
      <mdc-card variant="border" class="ooo-card-spaced">
        <mdc-text slot="title" type="heading-small-bold">Registered webhooks</mdc-text>
        <div slot="body">
          <mdc-text type="body-small-regular">Target URL: <code>${webhookHint}</code></mdc-text>
          ${webhookList}
          <div class="ooo-actions">
            <form method="post" action="/auth/webex">
              <mdc-button type="submit" variant="secondary" size="32">Re-authenticate with Webex</mdc-button>
            </form>
            <form method="post" action="/logout">
              <mdc-button type="submit" variant="secondary" size="32">Sign out</mdc-button>
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
