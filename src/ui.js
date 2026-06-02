/** Momentum Design assets served from node_modules via Express. */
import { OOO_END_MUST_BE_FUTURE_ERROR } from "./ooo-end-settings.js";
import { listTimeZones } from "./timezones.js";
import { normalizeTime24 } from "./time-format.js";

export const MDS = {
  tokensCss: "/assets/momentum/tokens/components/complete.css",
  fontsCss: "/assets/momentum/fonts/css/fonts.css",
  fontWoff2: "/assets/momentum/fonts/inter/Inter.var.woff2",
  componentsJs: "/assets/momentum/components/browser/index.js",
  iconsSvgBase: "/assets/momentum/icons/svg",
  oooEndClientJs: "/assets/app/ooo-end-client.js",
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
    <mdc-iconprovider
      icon-set="custom-icons"
      url="${MDS.iconsSvgBase}"
      file-extension="svg"
      cache-strategy="in-memory-cache"
      cache-name="ooo-momentum-icons"
    >
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
    .ooo-advanced-settings {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .ooo-advanced-settings[hidden] { display: none; }
    .ooo-settings-card {
      --mdc-card-width: 100%;
      width: 100%;
      max-width: 100%;
    }
    .ooo-card-body {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
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
    .ooo-internal-message[hidden],
    .ooo-end-options[hidden],
    .ooo-end-date-error[hidden] { display: none; }
    .ooo-end-fields {
      display: grid;
      grid-template-columns: repeat(2, minmax(12rem, 1fr));
      gap: 1.25rem;
    }
    .ooo-end-date-error {
      margin: 0;
      font-size: 0.875rem;
      line-height: 1.25rem;
      color: var(--mds-color-theme-text-error-normal, #a12823);
    }
    .ooo-end-fields mdc-datepicker,
    .ooo-end-fields mdc-timepicker,
    .ooo-timezone-field {
      width: 100%;
      max-width: 100%;
      --mdc-datepicker-width: 100%;
      --mdc-timepicker-width: 100%;
    }
    .ooo-timezone-field {
      grid-column: 1 / -1;
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
    }
    .ooo-field-label {
      font-size: 0.875rem;
      font-weight: 500;
      line-height: 1.25rem;
      color: var(--mds-color-theme-text-primary-normal);
    }
    .ooo-timezone-select {
      width: 100%;
      min-height: 2.5rem;
      padding: 0.5rem 2rem 0.5rem 0.75rem;
      border-radius: 0.5rem;
      border: 1px solid var(--mds-color-theme-outline-primary-normal);
      background: var(--mds-color-theme-background-solid-primary-normal);
      color: var(--mds-color-theme-text-primary-normal);
      font: inherit;
      font-size: 0.875rem;
      line-height: 1.25rem;
      box-sizing: border-box;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M4 6l4 4 4-4' stroke='%23595959' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 0.75rem center;
    }
    .ooo-timezone-select:focus {
      outline: 2px solid var(--mds-color-theme-outline-accent-normal);
      outline-offset: 1px;
    }
    .ooo-end-fields mdc-timepicker::part(spinbutton-group) {
      flex: 1 1 auto;
      min-width: 7.5rem;
    }
    .ooo-end-fields mdc-timepicker::part(spinbutton) {
      min-width: 2.75rem;
      text-align: center;
    }
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
  return `<script src="${MDS.oooEndClientJs}"></script><script src="${MDS.settingsFormJs}"></script>`;
}

/** @param {string} title @param {string} bodyHtml */
function settingsCard(title, bodyHtml) {
  return `
            <mdc-card variant="border" class="ooo-settings-card">
              <mdc-text slot="title" type="heading-small-bold">${escapeHtml(title)}</mdc-text>
              <div slot="body" class="ooo-card-body">${bodyHtml}</div>
            </mdc-card>`;
}

/** @param {string} selectedTimeZone */
function timezoneSelectOptions(selectedTimeZone) {
  const selected = selectedTimeZone || "UTC";
  return listTimeZones()
    .map((zone) => {
      const isSelected = zone === selected ? " selected" : "";
      return `<option value="${escapeHtml(zone)}"${isSelected}>${escapeHtml(zone)}</option>`;
    })
    .join("\n");
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
  const notifyIncomingChecked = profile.notifyIncomingMessages ? " checked" : "";
  const hasOooEndDateChecked = profile.hasOooEndDate ? " checked" : "";
  const oooAdvancedHidden = profile.enableOoo ? "" : " hidden";
  const oooMessageDisabled = profile.enableOoo ? "" : " disabled";
  const endOptionsHidden = profile.hasOooEndDate ? "" : " hidden";
  const endDateValue = profile.oooEndDate || "";
  const endTimeValue = normalizeTime24(profile.oooEndTime || "") || "";
  const endTimezoneValue = profile.oooEndTimezone || "UTC";
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
          <form method="post" action="/settings" class="ooo-form ooo-settings-form" data-ooo-end-future-error="${escapeHtml(OOO_END_MUST_BE_FUTURE_ERROR)}">
            ${settingsCard(
              "Out of office",
              `
              <mdc-toggle name="enableOoo" label="Enable out of office replies" value="1"${enableOooChecked}></mdc-toggle>
              <mdc-textarea
                name="oooMessage"
                label="Out of office message"
                value="${escapeHtml(profile.oooMessage)}"
                rows="5"${oooMessageDisabled}
              ></mdc-textarea>`
            )}
            <div class="ooo-advanced-settings"${oooAdvancedHidden}>
              ${settingsCard(
                "Schedule",
                `
              <mdc-toggle
                name="hasOooEndDate"
                label="Out of office has an end date"
                value="1"${hasOooEndDateChecked}
              ></mdc-toggle>
              <div class="ooo-end-options"${endOptionsHidden}>
                <p class="ooo-end-date-error" role="alert" hidden></p>
                <div class="ooo-end-fields">
                  <mdc-datepicker
                    name="oooEndDate"
                    label="End date"
                    variant="input"
                    value="${escapeHtml(endDateValue)}"
                    locale-month-label="Month"
                    locale-day-label="Day"
                    locale-year-label="Year"
                    locale-calendar-label="Open calendar"
                    locale-spinbutton-description="Use arrow keys to adjust"
                    locale-today-label="Today"
                    locale-prev-month-label="Previous month"
                    locale-next-month-label="Next month"
                  ></mdc-datepicker>
                  <mdc-timepicker
                    name="oooEndTime"
                    label="End time"
                    time-format="24h"
                    value="${escapeHtml(endTimeValue)}"
                    locale-hours-label="Hours"
                    locale-minutes-label="Minutes"
                    locale-hours-placeholder="HH"
                    locale-minutes-placeholder="MM"
                    locale-show-time-picker-label="Show time picker"
                    locale-time-options-label="Time options"
                    locale-spinbutton-description="Use arrow keys to adjust"
                  ></mdc-timepicker>
                  <div class="ooo-timezone-field">
                    <label class="ooo-field-label" for="oooEndTimezone">Time zone</label>
                    <select id="oooEndTimezone" class="ooo-timezone-select" name="oooEndTimezone">
                      ${timezoneSelectOptions(endTimezoneValue)}
                    </select>
                  </div>
                </div>
              </div>`
              )}
              ${settingsCard(
                "Colleague replies",
                `
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
              </div>`
              )}
              ${settingsCard(
                "During absence",
                `
              <mdc-toggle
                name="notifyIncomingMessages"
                label="Notify me about incoming messages during my absence"
                value="1"${notifyIncomingChecked}
              ></mdc-toggle>`
              )}
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
