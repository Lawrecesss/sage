// Reporting windows for the slash-command reports, computed in the business's own timezone
// (the agent has no clock, and "morning" means the owner's morning, not the server's).
//
// A window is the most recent one that has started. If it is still running, the report covers
// it so far and is compared like-for-like: the same elapsed slice, one week earlier. Same
// weekday last week is the standard retail baseline because trade is strongly weekly-seasonal.

export const BUSINESS_TZ = process.env.SAGE_TIMEZONE ?? "Asia/Singapore";

export type WindowSpec =
  | { kind: "day"; startHour: number; endHour: number } // wall-clock hours; endHour 24 = midnight
  | { kind: "week" }; // Monday 00:00 -> next Monday 00:00

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
  } else {
    startDay = localToUtc(today, spec.startHour, tz) > asOf ? addDays(today, -1) : today;
    startHour = spec.startHour;
    endDay = startDay;
    endHour = spec.endHour;
  }

  const start = localToUtc(startDay, startHour, tz);
  const end = localToUtc(endDay, endHour, tz);
  const through = new Date(Math.min(end.getTime(), asOf.getTime()));
  const baselineStart = localToUtc(addDays(startDay, -7), startHour, tz);

  return {
    start,
    end,
    through,
    partial: asOf < end,
    baselineStart,
    baselineThrough: new Date(baselineStart.getTime() + (through.getTime() - start.getTime())),
  };
}

/** The local calendar date as YYYY-MM-DD. */
export function localDate(date: Date, tz = BUSINESS_TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
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
