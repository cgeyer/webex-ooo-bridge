(function () {
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

  function bindColleagueToggles() {
    const form = document.querySelector(".ooo-settings-form");
    if (!form) return;
    const toggles = form.querySelectorAll(
      'mdc-toggle[name="sendOooToColleagues"], mdc-toggle[name="useSameColleagueMessage"]'
    );
    toggles.forEach((toggle) => {
      toggle.addEventListener("change", updateColleagueFields);
    });
    updateColleagueFields();
  }

  function start() {
    Promise.all([
      customElements.whenDefined("mdc-toggle"),
      customElements.whenDefined("mdc-textarea"),
    ]).then(() => {
      requestAnimationFrame(bindColleagueToggles);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
