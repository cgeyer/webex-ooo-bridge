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

  function setFieldEnabled(field, enabled) {
    if (!field) return;
    if (enabled) {
      field.removeAttribute("disabled");
    } else {
      field.setAttribute("disabled", "");
    }
  }

  function updateOooEnabledState() {
    const form = document.querySelector(".ooo-settings-form");
    if (!form) return;
    const enableOoo = form.querySelector('mdc-toggle[name="enableOoo"]');
    const advanced = form.querySelector(".ooo-advanced-settings");
    const message = form.querySelector('mdc-textarea[name="oooMessage"]');
    const oooOn = toggleOn(enableOoo);
    if (advanced) advanced.hidden = !oooOn;
    setFieldEnabled(message, oooOn);
    if (!oooOn) {
      clearEndDateError(form);
    }
  }

  function updateEndDateFields() {
    const form = document.querySelector(".ooo-settings-form");
    if (!form) return;
    const hasEndDate = form.querySelector('mdc-toggle[name="hasOooEndDate"]');
    const endOptions = form.querySelector(".ooo-end-options");
    if (!endOptions) return;
    endOptions.hidden = !toggleOn(hasEndDate);
    if (!toggleOn(hasEndDate)) {
      clearEndDateError(form);
    }
  }

  function readEndSettings(form) {
    const datepicker = form.querySelector('mdc-datepicker[name="oooEndDate"]');
    const timepicker = form.querySelector('mdc-timepicker[name="oooEndTime"]');
    const timezoneSelect = form.querySelector('select[name="oooEndTimezone"]');
    return {
      oooEndDate: typeof datepicker?.value === "string" ? datepicker.value.trim() : "",
      oooEndTime: padTime24(typeof timepicker?.value === "string" ? timepicker.value.trim() : ""),
      oooEndTimezone: typeof timezoneSelect?.value === "string" ? timezoneSelect.value.trim() : "",
    };
  }

  function clearEndDateError(form) {
    const error = form.querySelector(".ooo-end-date-error");
    if (!error) return;
    error.textContent = "";
    error.hidden = true;
  }

  function showEndDateError(form, message) {
    const error = form.querySelector(".ooo-end-date-error");
    if (!error) return;
    error.textContent = message;
    error.hidden = false;
  }

  function validateEndDateFuture(form) {
    const enableOoo = toggleOn(form.querySelector('mdc-toggle[name="enableOoo"]'));
    if (!enableOoo) {
      clearEndDateError(form);
      return true;
    }

    const hasEndDate = toggleOn(form.querySelector('mdc-toggle[name="hasOooEndDate"]'));
    if (!hasEndDate) {
      clearEndDateError(form);
      return true;
    }

    const client = window.OooEndClient;
    const futureError = form.dataset.oooEndFutureError?.trim();
    if (!client?.isEndInFuture) {
      return true;
    }

    const settings = {
      hasOooEndDate: true,
      ...readEndSettings(form),
    };

    if (client.isEndInFuture(settings)) {
      clearEndDateError(form);
      return true;
    }

    showEndDateError(form, futureError || "The end date and time must be in the future.");
    return false;
  }

  function bindEndDateValidation(form) {
    const endFields = form.querySelector(".ooo-end-options");
    if (!endFields) return;

    const clearOnChange = () => clearEndDateError(form);
    endFields.querySelector('mdc-datepicker[name="oooEndDate"]')?.addEventListener("change", clearOnChange);
    endFields.querySelector('mdc-timepicker[name="oooEndTime"]')?.addEventListener("change", clearOnChange);
    endFields.querySelector('select[name="oooEndTimezone"]')?.addEventListener("change", clearOnChange);
    form.querySelector('mdc-toggle[name="hasOooEndDate"]')?.addEventListener("change", clearOnChange);

    form.addEventListener("submit", (event) => {
      const timepicker = form.querySelector('mdc-timepicker[name="oooEndTime"]');
      if (timepicker?.value) {
        timepicker.value = padTime24(timepicker.value);
      }
      if (!validateEndDateFuture(form)) {
        event.preventDefault();
        form.querySelector(".ooo-end-date-error")?.scrollIntoView({ block: "nearest" });
      }
    });
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

    const enableOooToggle = form.querySelector('mdc-toggle[name="enableOoo"]');
    enableOooToggle?.addEventListener("change", updateOooEnabledState);

    const endDateToggle = form.querySelector('mdc-toggle[name="hasOooEndDate"]');
    endDateToggle?.addEventListener("change", updateEndDateFields);

    updateOooEnabledState();
    updateColleagueFields();
    updateEndDateFields();
    bindEndDatePicker();
    bindEndTimePicker();
    bindEndDateValidation(form);
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
