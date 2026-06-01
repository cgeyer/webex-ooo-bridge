(function () {
  function padTime24(value24) {
    const match = /^(\d{1,2}):(\d{1,2})$/.exec(String(value24).trim());
    if (!match) return value24;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return value24;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function toggleOn(toggle) {
    if (!toggle) return false;
    if (typeof toggle.checked === "boolean") return toggle.checked;
    const input = toggle.shadowRoot?.querySelector('input[type="checkbox"]');
    return Boolean(input?.checked);
  }

  function updateColleagueFields() {
    const form = document.querySelector(".ooo-settings-form");
    if (!form) return;
    const sendColleagues = form.querySelector('mdc-toggle[name="sendOooToColleagues"]');
    const sameMessage = form.querySelector('mdc-toggle[name="useSameColleagueMessage"]');
    const colleagueOptions = form.querySelector(".ooo-colleague-options");
    const internalMessage = form.querySelector(".ooo-internal-message");
    if (!colleagueOptions || !internalMessage) return;

    const sendOn = toggleOn(sendColleagues);
    colleagueOptions.hidden = !sendOn;
    internalMessage.hidden = !sendOn || toggleOn(sameMessage);
  }

  function updateEndDateFields() {
    const form = document.querySelector(".ooo-settings-form");
    if (!form) return;
    const hasEndDate = form.querySelector('mdc-toggle[name="hasOooEndDate"]');
    const endOptions = form.querySelector(".ooo-end-options");
    if (!endOptions) return;
    endOptions.hidden = !toggleOn(hasEndDate);
  }

  function browserLocale() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().locale || navigator.language || "en-US";
    } catch {
      return navigator.language || "en-US";
    }
  }

  function bindEndDatePicker() {
    const form = document.querySelector(".ooo-settings-form");
    if (!form) return;
    const datepicker = form.querySelector('mdc-datepicker[name="oooEndDate"]');
    if (!datepicker) return;
    datepicker.locale = browserLocale();
  }

  function bindEndTimePicker() {
    const form = document.querySelector(".ooo-settings-form");
    if (!form) return;
    const timepicker = form.querySelector('mdc-timepicker[name="oooEndTime"]');
    if (!timepicker) return;

    timepicker.optionLabelFormatter = (_label, value24) => padTime24(value24);

    const normalizePickerValue = () => {
      if (!timepicker.value) return;
      const normalized = padTime24(timepicker.value);
      if (normalized !== timepicker.value) {
        timepicker.value = normalized;
      }
    };

    timepicker.addEventListener("change", normalizePickerValue);
    timepicker.addEventListener("blur", normalizePickerValue, true);
    form.addEventListener("submit", normalizePickerValue);

    if (timepicker.value) {
      timepicker.value = padTime24(timepicker.value);
    }
  }

  function bindSettingsToggles() {
    const form = document.querySelector(".ooo-settings-form");
    if (!form) return;

    const colleagueToggles = form.querySelectorAll(
      'mdc-toggle[name="sendOooToColleagues"], mdc-toggle[name="useSameColleagueMessage"]'
    );
    colleagueToggles.forEach((toggle) => {
      toggle.addEventListener("change", updateColleagueFields);
    });

    const endDateToggle = form.querySelector('mdc-toggle[name="hasOooEndDate"]');
    endDateToggle?.addEventListener("change", updateEndDateFields);

    updateColleagueFields();
    updateEndDateFields();
    bindEndDatePicker();
    bindEndTimePicker();
  }

  function start() {
    Promise.all([
      customElements.whenDefined("mdc-toggle"),
      customElements.whenDefined("mdc-textarea"),
      customElements.whenDefined("mdc-datepicker"),
      customElements.whenDefined("mdc-timepicker"),
    ]).then(() => {
      requestAnimationFrame(bindSettingsToggles);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
