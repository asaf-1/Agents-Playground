import { expect, type APIRequestContext } from "@playwright/test";

// Helpers for the scheduled-payments specs (phase A2): calendar arithmetic
// on "YYYY-MM-DD" UTC days, the same as bank/schedule.js, and the clock calls.

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dayOfWeek(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 Sunday … 6 Saturday
}

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000,
  );
}

// A payment due on a weekend runs on the Monday after.
export function businessDay(day: string): string {
  const dow = dayOfWeek(day);
  if (dow === 6) return addDays(day, 2);
  if (dow === 0) return addDays(day, 1);
  return day;
}

export function nextWeekday(day: string): string {
  let current = day;
  while (businessDay(current) !== current) current = addDays(current, 1);
  return current;
}

export function nextSaturday(day: string): string {
  let current = day;
  while (dayOfWeek(current) !== 6) current = addDays(current, 1);
  return current;
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

// The first 31st on or after `day` whose following month is shorter, with the
// date a correct monthly repeat lands on next (the last day of that month).
export function next31stBeforeShortMonth(day: string): {
  date: string;
  clamped: string;
} {
  let [year, month] = day.split("-").map(Number); // month 1..12
  for (let step = 0; step < 24; step += 1) {
    if (lastDayOfMonth(year, month - 1) === 31) {
      const candidate = `${year}-${String(month).padStart(2, "0")}-31`;
      const nextYear = month === 12 ? year + 1 : year;
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextLength = lastDayOfMonth(nextYear, nextMonth - 1);
      if (candidate >= day && nextLength < 31) {
        return {
          date: candidate,
          clamped: `${nextYear}-${String(nextMonth).padStart(2, "0")}-${nextLength}`,
        };
      }
    }
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  throw new Error("No 31st followed by a shorter month in two years?");
}

export interface Clock {
  realToday: string;
  offsetDays: number;
  today: string;
}

export interface Scheduled {
  id: string;
  accountId: string;
  payeeId: string;
  payeeName: string;
  amountCents: number;
  memo: string;
  repeat: "once" | "weekly" | "monthly";
  anchorDay: number;
  nextDue: string;
  runsOn: string;
  status: "active" | "done" | "failed" | "cancelled";
  runs: number;
  lastRunOn: string | null;
  lastResult: "paid" | "failed" | null;
}

export async function readClock(request: APIRequestContext): Promise<Clock> {
  const response = await request.get("/api/bank/clock");
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

// Moves the customer's clock to `day`, in steps the API allows. `query` lets a
// spec carry its run key so an armed planted bug applies to the sweep.
export async function advanceClockTo(
  request: APIRequestContext,
  day: string,
  query = "",
): Promise<string> {
  let { today } = await readClock(request);
  while (today < day) {
    const days = Math.min(366, daysBetween(today, day));
    const response = await request.post(`/api/bank/clock/advance${query}`, {
      data: { days },
    });
    expect(response.status(), await response.text()).toBe(200);
    today = (await response.json()).today;
  }
  return today;
}

export async function scheduleBill(
  request: APIRequestContext,
  input: {
    fromAccountId: string;
    payeeId: string;
    amountCents: number;
    memo?: string;
    repeat?: "once" | "weekly" | "monthly";
    firstDue: string;
  },
): Promise<Scheduled> {
  const response = await request.post("/api/bank/scheduled-payments", {
    data: { memo: "", repeat: "once", ...input },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).payment;
}

export async function listScheduled(
  request: APIRequestContext,
): Promise<{ payments: Scheduled[]; today: string }> {
  const response = await request.get("/api/bank/scheduled-payments");
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

export async function scheduledById(
  request: APIRequestContext,
  id: string,
): Promise<Scheduled> {
  const found = (await listScheduled(request)).payments.find(
    (payment) => payment.id === id,
  );
  expect(found, `schedule ${id} is listed`).toBeDefined();
  return found!;
}
