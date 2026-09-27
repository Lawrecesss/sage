// Reporting windows for the slash-command reports, computed in the business's own timezone
// (the agent has no clock, and "morning" means the owner's morning, not the server's).
//
// A window is the most recent one that has started. By default its baseline is the same
// elapsed slice one week earlier — same weekday last week is the standard retail baseline
// because trade is strongly weekly-seasonal. A "day" window can instead name an explicit
// `baseline` — a specific different period to compare against (e.g. the afternoon-report
// comparing today's afternoon-so-far against this morning's completed total, or the
// morning-brief comparing today so far against last night's close) — see commands.ts.

export const BUSINESS_TZ = process.env.SAGE_TIMEZONE ?? "Asia/Singapore";

export type WindowSpec =
  | {
      kind: "day";
      startHour: number; // wall-clock hours; endHour 24 = midnight
      endHour: number;
      /** Overrides the default "same slice one week earlier" baseline with a specific other
       * period: `dayOffset` days before this window's own day, from `startHour` to `endHour`
       * local time. Used to chain the day-part reports against each other (see commands.ts)
       * and to compare daily-report against yesterday instead of last week. */
      baseline?: { startHour: number; endHour: number; dayOffset: number };
    }
  | { kind: "week" } // Monday 00:00 -> next Monday 00:00
  // The most recent *completed* slot of `hours` (a divisor of 24), aligned to local midnight —
  // e.g. hours 6 run at 06:05 covers 00:00–06:00. Scheduled reports run just after a slot
  // closes, so unlike the others this never returns the still-running window.
  | { kind: "slot"; hours: number };

export type ReportWindow = {
  start: Date;
  end: Date;
  /** min(end, asOf) — how much of the window has elapsed. */
  through: Date;
  partial: boolean;
  baselineStart: Date;
  baselineThrough: Date;
};

type Ymd = { y: number; m: number; d: number };

function zoneParts(date: Date, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}

function offsetMs(at: Date, tz: string): number {
  const p = zoneParts(at, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.trunc(at.getTime() / 1000) * 1000;
}

/** Wall-clock `hour` on local date `ymd` -> the UTC instant. Hour 24 rolls to next midnight. */
function localToUtc({ y, m, d }: Ymd, hour: number, tz: string): Date {
  const wall = Date.UTC(y, m - 1, d, hour);
  let t = wall - offsetMs(new Date(wall), tz);
  t = wall - offsetMs(new Date(t), tz); // second pass settles DST transitions
  return new Date(t);
}

function addDays({ y, m, d }: Ymd, n: number): Ymd {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export function computeWindow(spec: WindowSpec, asOf: Date, tz = BUSINESS_TZ): ReportWindow {
  const now = zoneParts(asOf, tz);
  const today: Ymd = { y: now.y, m: now.m, d: now.d };

  let startDay: Ymd;
  let startHour: number;
  let endDay: Ymd;
  let endHour: number;
  if (spec.kind === "week") {
    const sinceMonday = (new Date(Date.UTC(now.y, now.m - 1, now.d)).getUTCDay() + 6) % 7;
    startDay = addDays(today, -sinceMonday);
    startHour = 0;
    endDay = addDays(startDay, 7);
    endHour = 0;
  } else if (spec.kind === "slot") {
    // Hours outside 0–24 roll over the day boundary in localToUtc (Date.UTC normalises them).
    endHour = Math.floor(now.h / spec.hours) * spec.hours;
    startHour = endHour - spec.hours;
    startDay = today;
    endDay = today;
  } else {
    startDay = localToUtc(today, spec.startHour, tz) > asOf ? addDays(today, -1) : today;
    startHour = spec.startHour;
    endDay = startDay;
    endHour = spec.endHour;
  }

  const start = localToUtc(startDay, startHour, tz);
  const end = localToUtc(endDay, endHour, tz);
  const through = new Date(Math.min(end.getTime(), asOf.getTime()));

  // Default: the same slice 7 days earlier (same weekday, like-for-like). A "day" window can
  // override this with an explicit `baseline` naming a different period entirely (see the
  // WindowSpec doc comment above).
  const explicitBaseline = spec.kind === "day" ? spec.baseline : undefined;
  const baselineStartDay = addDays(startDay, -(explicitBaseline?.dayOffset ?? 7));
  const baselineStartHour = explicitBaseline?.startHour ?? startHour;
  const baselineEndHour = explicitBaseline?.endHour ?? endHour;
  const baselineStart = localToUtc(baselineStartDay, baselineStartHour, tz);
  const baselineEnd = localToUtc(baselineStartDay, baselineEndHour, tz);

  const windowDurationMs = end.getTime() - start.getTime();
  const baselineDurationMs = baselineEnd.getTime() - baselineStart.getTime();
  const baselineDurationDiffers = windowDurationMs !== baselineDurationMs;
  // Same-duration baseline (the default, or an explicit same-length override): clip it to the
  // same elapsed fraction as `through`, so a still-running window is compared like-for-like.
  // Different-duration baseline (a chained day-part period): that period is always already
  // complete by the time this report runs, so use its full total rather than a fraction of it.
  const baselineThrough = baselineDurationDiffers
    ? baselineEnd
    : new Date(baselineStart.getTime() + (through.getTime() - start.getTime()));

  return {
    start,
    end,
    through,
    partial: asOf < end,
    baselineStart,
    baselineThrough,
  };
}

/** The local calendar date as YYYY-MM-DD. */
export function localDate(date: Date, tz = BUSINESS_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** The local wall-clock time as HH:mm — for spelling out a sub-day window's bounds in prose. */
export function localTime(date: Date, tz = BUSINESS_TZ): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

export function formatLocal(date: Date, tz = BUSINESS_TZ): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(date);
}
