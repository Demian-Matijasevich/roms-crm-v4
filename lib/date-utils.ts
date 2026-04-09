import { format, subMonths, addMonths, startOfMonth, endOfMonth, isBefore, isAfter } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Get the current date in São Paulo timezone (UTC-3).
 * On Vercel (UTC), at 9PM Brazil time the UTC date is already the next day.
 * This ensures fiscal month calculations are correct regardless of server timezone.
 */
export function getToday(): Date {
  const now = new Date();
  const spTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return spTime;
}

/**
 * Parse a YYYY-MM-DD string as a LOCAL date (no timezone shift).
 * new Date("2026-03-07") in -3 timezone → March 6 21:00 (WRONG)
 * parseLocalDate("2026-03-07") → March 7 00:00 local (CORRECT)
 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Format a date as YYYY-MM-DD string (local).
 */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Get the fiscal month label for a date.
 * ROMS uses standard calendar months (1st to last day).
 */
export function getFiscalMonth(date: Date): string {
  const raw = format(date, "MMMM yyyy", { locale: es });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Get the start date of a fiscal month (1st of the month).
 */
export function getFiscalStart(date: Date = getToday()): Date {
  return startOfMonth(date);
}

/**
 * Get the end date of a fiscal month (last day of the month).
 */
export function getFiscalEnd(date: Date = getToday()): Date {
  return endOfMonth(date);
}

/**
 * Check if a date is within the current fiscal month.
 */
export function isCurrentFiscal(date: Date): boolean {
  const start = getFiscalStart();
  const end = getFiscalEnd();
  return !isBefore(date, start) && !isAfter(date, end);
}

/**
 * Get previous fiscal month start/end.
 */
export function getPrevFiscalStart(): Date {
  return subMonths(getFiscalStart(), 1);
}

/**
 * Generate fiscal month options for a selector.
 * Values are YYYY-MM-DD strings that must be parsed with parseLocalDate().
 */
export function getFiscalMonthOptions(count: number = 6): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  let current = getToday();
  for (let i = 0; i < count; i++) {
    const start = getFiscalStart(current);
    const label = getFiscalMonth(current);
    options.push({ value: toDateString(start), label });
    current = subMonths(current, 1);
  }
  return options;
}
