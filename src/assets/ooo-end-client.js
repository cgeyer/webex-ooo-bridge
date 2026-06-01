(function () {
  function normalizeTime24(time) {
    const match = /^(\d{1,2}):(\d{1,2})$/.exec(String(time).trim());
    if (!match) return null;

    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) {
      return null;
    }

    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function oooEndTimestampMs(settings) {
    if (!settings.hasOooEndDate || !settings.oooEndDate || !settings.oooEndTime || !settings.oooEndTimezone) {
      return null;
    }

    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(settings.oooEndDate);
    const normalizedTime = normalizeTime24(settings.oooEndTime);
    if (!dateMatch || !normalizedTime) return null;

    const timeMatch = /^(\d{2}):(\d{2})$/.exec(normalizedTime);
    if (!timeMatch) return null;

    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);

    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
      return null;
    }

    try {
      let guess = Date.UTC(year, month - 1, day, hour, minute);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: settings.oooEndTimezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).formatToParts(new Date(guess));

        const read = (type) => Number(parts.find((part) => part.type === type)?.value);
        const localYear = read("year");
        const localMonth = read("month");
        const localDay = read("day");
        const localHour = read("hour");
        const localMinute = read("minute");

        const diffMinutes =
          (year - localYear) * 525_600 +
          (month - localMonth) * 43_800 +
          (day - localDay) * 1_440 +
          (hour - localHour) * 60 +
          (minute - localMinute);

        if (diffMinutes === 0) return guess;
        guess += diffMinutes * 60_000;
      }
      return guess;
    } catch {
      return null;
    }
  }

  function isEndInFuture(settings, nowMs = Date.now()) {
    const endMs = oooEndTimestampMs(settings);
    return endMs !== null && endMs > nowMs;
  }

  window.OooEndClient = {
    normalizeTime24,
    oooEndTimestampMs,
    isEndInFuture,
  };
})();
