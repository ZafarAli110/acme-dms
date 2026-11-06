import { describe, expect, it } from "vitest";
import { formatDaysAgo, formatInstant, formatPlainDate } from "../formatDate";

describe("formatDate", () => {
  it("shows a moment in the user's language and the time zone it is given", () => {
    const options = { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" } as const;

    expect(formatInstant("2026-10-28T14:08:00Z", "en-GB", options)).toBe("28 Oct 2026, 14:08");
    expect(formatInstant("2026-10-28T23:30:00Z", "en-GB", { ...options, timeZone: "Asia/Karachi" })).toBe(
      "29 Oct 2026, 04:30",
    );
  });

  it("shows a calendar day as the same day in every time zone", () => {
    expect(formatPlainDate("2026-10-24", "en-GB")).toBe("24 Oct 2026");
    expect(formatPlainDate("2026-10-24", "en-GB", { dateStyle: "medium", timeZone: "Pacific/Honolulu" })).toBe(
      "24 Oct 2026",
    );
  });

  it("says how long ago a day was in days, then months, then years", () => {
    const today = Temporal.Now.plainDateISO();
    const ago = (days: number) => today.subtract({ days }).toString();

    expect(formatDaysAgo(ago(0), "en-GB")).toBe("today");
    expect(formatDaysAgo(ago(3), "en-GB")).toBe("3 days ago");
    expect(formatDaysAgo(ago(29), "en-GB")).toBe("29 days ago");
    expect(formatDaysAgo(ago(60), "en-GB")).toBe("2 months ago");
    expect(formatDaysAgo(ago(730), "en-GB")).toBe("2 years ago");
    expect(formatDaysAgo(ago(3), "fr")).toBe("il y a 3 jours");
  });
});
