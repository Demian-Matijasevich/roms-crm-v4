import type { Lead } from "@/lib/types";
import { getFiscalStart, getFiscalEnd } from "@/lib/date-utils";

// ========================================
// TYPES
// ========================================

export interface CloserStreak {
  closerId: string;
  nombre: string;
  currentStreak: number;
  longestStreak: number;
}

export interface Badge {
  id: string;
  label: string;
  icon: string;
  earned: boolean;
}

export interface CloserRanking {
  closerId: string;
  nombre: string;
  position: number;
  cash: number;
  cerradas: number;
  streak: number;
  badges: Badge[];
}

// ========================================
// STREAKS
// ========================================

/**
 * Calculate consecutive days with at least 1 cerrado for each closer.
 * A streak counts backward from today (or yesterday if today has no cierre yet).
 * Uses fecha_llamada as the date of the cierre.
 */
export function getCloserStreaks(leads: Lead[]): Map<string, CloserStreak> {
  const streaks = new Map<string, CloserStreak>();

  // Group cierre dates by closer_id
  const closerDates = new Map<string, { nombre: string; dates: Set<string> }>();

  for (const l of leads) {
    if ((l.estado !== "cerrado" && l.estado !== "adentro_seguimiento") || !l.closer_id || !l.fecha_llamada) continue;
    const dateStr = l.fecha_llamada.split("T")[0];

    if (!closerDates.has(l.closer_id)) {
      closerDates.set(l.closer_id, {
        nombre: l.closer?.nombre ?? l.closer_id,
        dates: new Set(),
      });
    }
    closerDates.get(l.closer_id)!.dates.add(dateStr);
  }

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const yesterday = new Date(today.getTime() - 86400000);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  for (const [closerId, { nombre, dates }] of closerDates) {
    // Start counting from today or yesterday
    if (!dates.has(todayStr) && !dates.has(yesterdayStr)) {
      streaks.set(closerId, {
        closerId,
        nombre,
        currentStreak: 0,
        longestStreak: 0,
      });
      continue;
    }

    const checkDate = dates.has(todayStr)
      ? new Date(today)
      : new Date(yesterday);
    let currentStreak = 0;

    while (dates.has(checkDate.toISOString().split("T")[0])) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    // Calculate longest streak from all dates
    const sortedDates = Array.from(dates).sort();
    let longestStreak = 0;
    let tempStreak = 1;

    for (let i = 1; i < sortedDates.length; i++) {
      const prev = new Date(sortedDates[i - 1]);
      const curr = new Date(sortedDates[i]);
      const diffDays = Math.round(
        (curr.getTime() - prev.getTime()) / 86400000
      );

      if (diffDays === 1) {
        tempStreak++;
      } else {
        longestStreak = Math.max(longestStreak, tempStreak);
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak, currentStreak);

    streaks.set(closerId, {
      closerId,
      nombre,
      currentStreak,
      longestStreak,
    });
  }

  return streaks;
}

// ========================================
// BADGES
// ========================================

/**
 * Calculate badges for a closer in a given fiscal month.
 *
 * Badge list:
 * - "Closer del mes": top cash collected
 * - "Racha 7+": currentStreak >= 7
 * - "Ticket mas alto": highest single ticket_total in fiscal month
 * - "Cierre mismo dia": has a cerrado where fecha_llamada date = fecha_agendado date
 * - "Primera venta del mes": first cerrado of the fiscal month
 */
export function getCloserBadges(
  leads: Lead[],
  closerId: string,
  fiscalDate?: Date
): Badge[] {
  const refDate = fiscalDate ?? new Date();
  const start = getFiscalStart(refDate);
  const end = getFiscalEnd(refDate);

  // Filter leads in fiscal month
  const fiscalLeads = leads.filter((l) => {
    if (!l.fecha_llamada) return false;
    const d = new Date(l.fecha_llamada);
    return d >= start && d <= end;
  });

  const cerradosFiscal = fiscalLeads.filter((l) => l.estado === "cerrado" || l.estado === "adentro_seguimiento");

  // ---- Closer del mes ----
  const cashByCloser = new Map<string, number>();
  for (const l of cerradosFiscal) {
    if (!l.closer_id) continue;
    cashByCloser.set(
      l.closer_id,
      (cashByCloser.get(l.closer_id) ?? 0) + l.ticket_total
    );
  }
  let topCloserId: string | null = null;
  let topCash = 0;
  for (const [id, cash] of cashByCloser) {
    if (cash > topCash) {
      topCash = cash;
      topCloserId = id;
    }
  }
  const isTopCash = topCloserId === closerId && topCash > 0;

  // ---- Racha 7+ ----
  const streaks = getCloserStreaks(leads);
  const myStreak = streaks.get(closerId)?.currentStreak ?? 0;
  const hasLongStreak = myStreak >= 7;

  // ---- Ticket mas alto ----
  const myCerrados = cerradosFiscal.filter((l) => l.closer_id === closerId);
  const myMaxTicket = myCerrados.reduce(
    (max, l) => Math.max(max, l.ticket_total),
    0
  );
  const globalMaxTicket = cerradosFiscal.reduce(
    (max, l) => Math.max(max, l.ticket_total),
    0
  );
  const hasHighestTicket = myMaxTicket > 0 && myMaxTicket === globalMaxTicket;

  // ---- Cierre mismo dia ----
  const hasSameDayClose = myCerrados.some((l) => {
    if (!l.fecha_llamada) return false;
    const llamadaDate = l.fecha_llamada.split("T")[0];
    if (l.fecha_agendado) {
      const agendaDate = l.fecha_agendado.split("T")[0];
      return llamadaDate === agendaDate;
    }
    return false;
  });

  // ---- Primera venta del mes ----
  const firstCerrado = [...cerradosFiscal].sort((a, b) =>
    (a.fecha_llamada ?? "").localeCompare(b.fecha_llamada ?? "")
  )[0];
  const isFirstSale =
    firstCerrado?.closer_id === closerId && cerradosFiscal.length > 0;

  return [
    {
      id: "top-cash",
      label: "Closer del mes",
      icon: "\u{1F3AF}",
      earned: isTopCash,
    },
    {
      id: "streak-7",
      label: "Racha 7+ dias",
      icon: "\u{1F525}",
      earned: hasLongStreak,
    },
    {
      id: "highest-ticket",
      label: "Ticket mas alto",
      icon: "\u{1F48E}",
      earned: hasHighestTicket,
    },
    {
      id: "same-day",
      label: "Cierre mismo dia",
      icon: "\u{26A1}",
      earned: hasSameDayClose,
    },
    {
      id: "first-sale",
      label: "1ra venta del mes",
      icon: "\u{1F680}",
      earned: isFirstSale,
    },
  ];
}

// ========================================
// RANKINGS
// ========================================

/**
 * Build leaderboard rankings for all closers in a fiscal month.
 * Sorted by cash collected (cerradas * ticket_total).
 */
export function getCloserRankings(
  leads: Lead[],
  fiscalDate?: Date
): CloserRanking[] {
  const refDate = fiscalDate ?? new Date();
  const start = getFiscalStart(refDate);
  const end = getFiscalEnd(refDate);

  const fiscalLeads = leads.filter((l) => {
    if (!l.fecha_llamada) return false;
    const d = new Date(l.fecha_llamada);
    return d >= start && d <= end;
  });

  const cerrados = fiscalLeads.filter((l) => l.estado === "cerrado" || l.estado === "adentro_seguimiento");

  // Aggregate by closer
  const closerMap = new Map<
    string,
    { nombre: string; cash: number; cerradas: number }
  >();

  for (const l of cerrados) {
    if (!l.closer_id) continue;
    const existing = closerMap.get(l.closer_id) ?? {
      nombre: l.closer?.nombre ?? l.closer_id,
      cash: 0,
      cerradas: 0,
    };
    existing.cash += l.ticket_total;
    existing.cerradas += 1;
    closerMap.set(l.closer_id, existing);
  }

  const streaks = getCloserStreaks(leads);

  const sorted = Array.from(closerMap.entries())
    .sort(([, a], [, b]) => b.cash - a.cash)
    .map(([closerId, data], index) => {
      const badges = getCloserBadges(leads, closerId, refDate);
      const streak = streaks.get(closerId)?.currentStreak ?? 0;

      return {
        closerId,
        nombre: data.nombre,
        position: index + 1,
        cash: data.cash,
        cerradas: data.cerradas,
        streak,
        badges,
      };
    });

  return sorted;
}
