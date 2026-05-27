"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { AuthSession, AgentTask } from "@/lib/types";
import type { CobranzasQueueItem, AuditCuotaRow, PaidPaymentRecord } from "@/lib/queries/cobranzas";
import MonthSelector77 from "@/app/components/MonthSelector77";
import { useToast } from "@/app/components/Toast";
import { getFiscalMonth, parseLocalDate, getFiscalStart, getFiscalEnd, toDateString, getToday as getDateToday } from "@/lib/date-utils";
import { formatMoney } from "@/lib/format";
// date-fns utilities available if needed

interface Props {
  initialQueue: CobranzasQueueItem[];
  allPendingItems: CobranzasQueueItem[];
  allPaidPayments: PaidPaymentRecord[];
  allTasks: AgentTask[];
  auditCuotas: AuditCuotaRow[];
  auditRenovaciones: AuditCuotaRow[];
  usdRate: number;
  session: AuthSession;
}

type MainTab = "cola" | "auditoria";

type FilterTipo = "todos" | "cuotas" | "renovaciones" | "deudores";
type FilterPeriodo = "hoy" | "semana" | "mes" | "vencidas" | "todas";

interface WeekBucket {
  label: string;
  start: Date;
  end: Date;
  items: CobranzasQueueItem[];
  total: number;
}

function getWeekBuckets(fiscalStart: string, fiscalEnd: string, items: CobranzasQueueItem[]): WeekBucket[] {
  // Buckets semanales DENTRO del mes fiscal (fiscalStart → fiscalEnd).
  const start = new Date(fiscalStart + "T00:00:00");
  const end = new Date(fiscalEnd + "T00:00:00");

  const weeks: WeekBucket[] = [];
  let weekStart = new Date(start);
  let weekNum = 1;

  while (weekStart <= end) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    if (weekEnd > end) weekEnd.setTime(end.getTime());

    const sLabel = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
    const eLabel = `${weekEnd.getDate()}/${weekEnd.getMonth() + 1}`;

    const wStart = new Date(weekStart);
    const wEnd = new Date(weekEnd);

    const weekItems = items.filter((item) => {
      if (!item.fecha_vencimiento) return false;
      const d = new Date(item.fecha_vencimiento + "T00:00:00");
      return d >= wStart && d <= wEnd;
    });

    weeks.push({
      label: `Semana ${weekNum} (${sLabel} - ${eLabel})`,
      start: wStart,
      end: wEnd,
      items: weekItems,
      total: weekItems.reduce((sum, i) => sum + i.monto_usd, 0),
    });

    weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() + 1);
    weekNum++;
  }

  return weeks;
}

/** Agrupa items futuros (post fiscalEnd) por mes calendario. */
function groupItemsByFutureMonth(fiscalEnd: string, items: CobranzasQueueItem[]): Array<{ ym: string; label: string; total: number; count: number; items: CobranzasQueueItem[] }> {
  const fiscalEndDate = new Date(fiscalEnd + "T00:00:00");
  const map = new Map<string, CobranzasQueueItem[]>();
  for (const it of items) {
    if (!it.fecha_vencimiento) continue;
    const d = new Date(it.fecha_vencimiento + "T00:00:00");
    if (d <= fiscalEndDate) continue;
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!map.has(ym)) map.set(ym, []);
    map.get(ym)!.push(it);
  }
  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return Array.from(map.entries())
    .sort()
    .map(([ym, arr]) => {
      const [, m] = ym.split("-").map(Number);
      return {
        ym,
        label: `${monthNames[m - 1]} ${ym.slice(0, 4)}`,
        total: arr.reduce((s, i) => s + i.monto_usd, 0),
        count: arr.length,
        items: arr,
      };
    });
}

function getToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekRange(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: fmt(monday), end: fmt(sunday) };
}

export default function CobranzasClient({
  initialQueue,
  allPendingItems,
  allPaidPayments,
  allTasks,
  auditCuotas,
  auditRenovaciones,
  usdRate,
  session,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const fmt = (usd: number, ars?: number) => formatMoney(usd, ars || 0, usdRate);
  const [mainTab, setMainTab] = useState<MainTab>("cola");
  const [queue, setQueue] = useState(initialQueue);
  const [filterTipo, setFilterTipo] = useState<FilterTipo>("todos");
  const [filterPeriodo, setFilterPeriodo] = useState<FilterPeriodo>("todas");
  const [search, setSearch] = useState("");
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Fiscal month selector — defaults to current fiscal month
  const [selectedMonth, setSelectedMonth] = useState(() =>
    toDateString(getFiscalStart(getDateToday()))
  );

  const canSeeAgent = false; // Agent system not active for ROMS

  const todayStr = getToday();
  const weekRange = getWeekRange();

  // Derive fiscal start/end from selected month (standard calendar months)
  const fiscalStart = selectedMonth; // already YYYY-MM-DD of the 1st
  const fiscalEnd = useMemo(() => {
    const start = parseLocalDate(selectedMonth);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0); // last day of month
    return toDateString(end);
  }, [selectedMonth]);

  // Filter pending items by selected fiscal period (include overdue + in-range + no-date)
  const fiscalItems = useMemo(() => {
    const seenIds = new Set<string>();
    return allPendingItems.filter((item) => {
      if (seenIds.has(item.id)) return false;
      seenIds.add(item.id);
      if (!item.fecha_vencimiento) return true; // items without date always show
      // Include if within fiscal range OR overdue (before today but within/before this period)
      return (
        item.fecha_vencimiento >= fiscalStart && item.fecha_vencimiento <= fiscalEnd
      ) || (
        item.fecha_vencimiento < todayStr && item.fecha_vencimiento >= fiscalStart
      );
    });
  }, [allPendingItems, fiscalStart, fiscalEnd, todayStr]);

  // Cuando estamos en el mes fiscal en curso, incluir TODO:
  // - overdue de meses anteriores (vencidas viejas)
  // - cuotas del mes en curso
  // - cuotas FUTURAS (próximos meses) → para que el grid semanal las muestre.
  // Cuando se navega a un mes pasado/futuro, mostrar solo el rango específico
  // (comportamiento legacy).
  const fiscalItemsWithOverdue = useMemo(() => {
    const currentFiscalStart = toDateString(getFiscalStart(getDateToday()));
    if (selectedMonth === currentFiscalStart) {
      // Mes en curso: TODOS los pendientes — overdue, actuales y futuros.
      // Dedup por id.
      const seen = new Set<string>();
      const all: CobranzasQueueItem[] = [];
      for (const it of allPendingItems) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        all.push(it);
      }
      return all;
    }
    return fiscalItems;
  }, [fiscalItems, allPendingItems, selectedMonth]);

  // Fiscal paid: filter by selected fiscal period
  const fiscalPaid = useMemo(() => {
    const filtered = allPaidPayments.filter(
      (p) => p.fecha_pago && p.fecha_pago >= fiscalStart && p.fecha_pago <= fiscalEnd
    );
    return {
      total: filtered.reduce((sum, p) => sum + p.monto_usd, 0),
      count: filtered.length,
    };
  }, [allPaidPayments, fiscalStart, fiscalEnd]);

  // Total por cobrar for the selected month
  const totalPorCobrar = useMemo(
    () => fiscalItemsWithOverdue.reduce((sum, i) => sum + i.monto_usd, 0),
    [fiscalItemsWithOverdue]
  );

  // Exportar la cola para mandar por WhatsApp (a Juanma típicamente).
  const [copiedAt, setCopiedAt] = useState<number | null>(null);
  function buildWACobranzasText(): string {
    const items = fiscalItemsWithOverdue.slice();
    const order: Record<string, number> = { vencido: 0, urgente: 1, proximo: 2, ok: 3 };
    items.sort((a, b) => {
      if (a.semaforo !== b.semaforo) return order[a.semaforo] - order[b.semaforo];
      return b.monto_usd - a.monto_usd;
    });
    const groups: Record<string, CobranzasQueueItem[]> = { vencido: [], urgente: [], proximo: [], ok: [] };
    for (const it of items) groups[it.semaforo].push(it);
    const fmt = (s: string | null) => {
      if (!s) return "";
      const d = new Date(s + "T00:00:00");
      return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    };
    const lines: string[] = [];
    lines.push(`*COBRANZAS — fiscal ${fiscalStart} al ${fiscalEnd}*`);
    lines.push("");
    const addSection = (titulo: string, arr: CobranzasQueueItem[], showDias = false) => {
      if (!arr.length) return;
      const tot = arr.reduce((s, i) => s + i.monto_usd, 0);
      lines.push(`${titulo} (${arr.length} — $${tot.toLocaleString()})`);
      for (const it of arr) {
        const venc = it.fecha_vencimiento ? fmt(it.fecha_vencimiento) : "s/f";
        const dias = showDias && it.fecha_vencimiento ? ` (${Math.abs(it.dias_vencido)}d atras)` : "";
        const monto = it.monto_usd > 0 ? `$${it.monto_usd.toLocaleString()}` : (it.tipo === "renovacion" ? "renov" : "—");
        lines.push(`• ${it.client_nombre} — ${monto} — venc ${venc}${dias}`);
      }
      lines.push("");
    };
    addSection("🔴 VENCIDAS", groups.vencido, true);
    addSection("🟠 ESTA SEMANA", groups.urgente);
    addSection("🟡 PROXIMAS (8-15 dias)", groups.proximo);
    addSection("🟢 OK (mas de 15 dias)", groups.ok);
    const totalAll = items.reduce((s, i) => s + i.monto_usd, 0);
    lines.push(`*TOTAL POR COBRAR: $${totalAll.toLocaleString()}*`);
    return lines.join("\n");
  }
  async function copyCobranzasWA() {
    const text = buildWACobranzasText();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAt(Date.now());
      setTimeout(() => setCopiedAt(null), 2500);
    } catch {
      window.prompt("Copia este texto:", text);
    }
  }

  // Separate items with and without fecha_vencimiento
  const { queueWithDate, queueParaRevisar } = useMemo(() => {
    const withDate: CobranzasQueueItem[] = [];
    const noDate: CobranzasQueueItem[] = [];
    for (const item of queue) {
      if (item.fecha_vencimiento) {
        withDate.push(item);
      } else {
        // Only cuotas without fecha need review; tasks/renovaciones don't need it
        if (item.tipo === "cuota") {
          noDate.push(item);
        } else {
          withDate.push(item);
        }
      }
    }
    return { queueWithDate: withDate, queueParaRevisar: noDate };
  }, [queue]);

  // Filter by periodo
  const periodoFiltered = useMemo(() => {
    let items = [...queueWithDate];

    if (filterPeriodo === "hoy") {
      items = items.filter((i) => i.fecha_vencimiento === todayStr);
    } else if (filterPeriodo === "semana") {
      items = items.filter(
        (i) =>
          i.fecha_vencimiento &&
          i.fecha_vencimiento >= weekRange.start &&
          i.fecha_vencimiento <= weekRange.end
      );
    } else if (filterPeriodo === "mes") {
      items = items.filter(
        (i) =>
          i.fecha_vencimiento &&
          i.fecha_vencimiento >= fiscalStart &&
          i.fecha_vencimiento <= fiscalEnd
      );
    } else if (filterPeriodo === "vencidas") {
      items = items.filter(
        (i) => i.fecha_vencimiento && i.fecha_vencimiento < todayStr
      );
    }
    // "todas" = no filter

    return items;
  }, [queueWithDate, filterPeriodo, todayStr, weekRange, fiscalStart, fiscalEnd]);

  // Apply tipo + search filters
  const filtered = useMemo(() => {
    let items = [...periodoFiltered];

    if (filterTipo === "cuotas") {
      items = items.filter(
        (i) => i.tipo === "cuota" || i.task_tipo === "cobrar_cuota"
      );
    } else if (filterTipo === "renovaciones") {
      items = items.filter(
        (i) => i.tipo === "renovacion" || i.task_tipo === "renovacion"
      );
    } else if (filterTipo === "deudores") {
      items = items.filter(
        (i) => i.semaforo === "vencido" && i.tipo === "cuota"
      );
    }

    if (search.trim()) {
      const s = search.toLowerCase();
      items = items.filter((i) =>
        i.client_nombre.toLowerCase().includes(s)
      );
    }

    return items;
  }, [periodoFiltered, filterTipo, search]);

  // --- KPI Summary ---
  const cobrarHoyCount = queueWithDate.filter(
    (i) => i.fecha_vencimiento === todayStr
  ).length;
  const cobrarHoyMonto = queueWithDate
    .filter((i) => i.fecha_vencimiento === todayStr)
    .reduce((sum, i) => sum + i.monto_usd, 0);

  const totalVencidas = fiscalItemsWithOverdue.filter((i) => i.semaforo === "vencido").length;
  const montoVencido = fiscalItemsWithOverdue
    .filter((i) => i.semaforo === "vencido")
    .reduce((sum, i) => sum + i.monto_usd, 0);

  const cobradoTotal = fiscalPaid.total;
  const grandTotal = totalPorCobrar + cobradoTotal;
  const tasaCobro = grandTotal > 0 ? (cobradoTotal / grandTotal) * 100 : 0;

  // Weekly breakdown (mes fiscal en curso)
  const weeks = useMemo(
    () => getWeekBuckets(fiscalStart, fiscalEnd, fiscalItemsWithOverdue),
    [fiscalStart, fiscalEnd, fiscalItemsWithOverdue]
  );

  // Items post-mes-fiscal agrupados por mes calendario
  const futureMonths = useMemo(
    () => groupItemsByFutureMonth(fiscalEnd, fiscalItemsWithOverdue),
    [fiscalEnd, fiscalItemsWithOverdue]
  );

  function toggleMonth(ym: string) {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(ym)) next.delete(ym);
      else next.add(ym);
      return next;
    });
  }

  // Potencial del mes: cuotas pendientes + renovaciones esperadas
  const renovacionesEsperadas = useMemo(() => {
    return queue.filter(
      (i) => i.tipo === "renovacion" || i.task_tipo === "renovacion"
    ).length;
  }, [queue]);

  function toggleWeek(idx: number) {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function getSemaforoColor(s: string) {
    if (s === "vencido") return "text-[var(--red)]";
    if (s === "urgente") return "text-[var(--yellow)]";
    if (s === "proximo") return "text-orange-400";
    return "text-[var(--green)]";
  }

  function getSemaforoBg(s: string) {
    if (s === "vencido") return "bg-red-500/10";
    if (s === "urgente") return "bg-yellow-500/10";
    return "";
  }

  function getSemaforoDot(s: string) {
    if (s === "vencido") return "bg-[var(--red)]";
    if (s === "urgente") return "bg-[var(--yellow)]";
    if (s === "proximo") return "bg-orange-400";
    return "bg-[var(--green)]";
  }

  function getTipoLabel(item: CobranzasQueueItem) {
    if (item.tipo === "cuota")
      return `Cuota #${item.numero_cuota ?? "?"}`;
    if (item.tipo === "renovacion") return "Renovacion";
    if (item.task_tipo) {
      const labels: Record<string, string> = {
        cobrar_cuota: "Cobrar cuota",
        renovacion: "Renovacion",
        seguimiento: "Seguimiento",
        oportunidad_upsell: "Oportunidad upsell",
        bienvenida: "Bienvenida",
        seguimiento_urgente: "Seguimiento urgente",
        confirmar_pago: "Confirmar pago",
      };
      return labels[item.task_tipo] ?? item.task_tipo;
    }
    return item.tipo;
  }

  function getDiasLabel(dias: number) {
    if (dias < 0) return `${Math.abs(dias)}d vencida`;
    if (dias === 0) return "Vence hoy";
    return `${dias}d restantes`;
  }

  // --- Actions ---
  async function handleMarkContactado(item: CobranzasQueueItem) {
    setActiveAction(item.id);
    try {
      const res = await fetch(`/api/agent-tasks/${item.task_id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: "in_progress" }),
      });
      if (res.ok) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? { ...q, task_estado: "in_progress", estado_contacto: "contactado" }
              : q
          )
        );
      }
    } finally {
      setActiveAction(null);
    }
  }

  async function handleEscalar(item: CobranzasQueueItem) {
    if (!item.task_id) return;
    setActiveAction(item.id);
    try {
      const res = await fetch(`/api/agent-tasks/${item.task_id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prioridad: 1 }),
      });
      if (res.ok) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, task_prioridad: 1 } : q
          )
        );
      }
    } finally {
      setActiveAction(null);
    }
  }

  // Period tab config
  const periodoTabs: { key: FilterPeriodo; label: string; count?: number }[] = [
    { key: "hoy", label: "Hoy", count: cobrarHoyCount },
    {
      key: "semana",
      label: "Esta semana",
      count: queueWithDate.filter(
        (i) =>
          i.fecha_vencimiento &&
          i.fecha_vencimiento >= weekRange.start &&
          i.fecha_vencimiento <= weekRange.end
      ).length,
    },
    {
      key: "mes",
      label: "Este mes",
      count: queueWithDate.filter(
        (i) =>
          i.fecha_vencimiento &&
          i.fecha_vencimiento >= fiscalStart &&
          i.fecha_vencimiento <= fiscalEnd
      ).length,
    },
    {
      key: "vencidas",
      label: "Vencidas",
      count: queueWithDate.filter(
        (i) => i.fecha_vencimiento && i.fecha_vencimiento < todayStr
      ).length,
    },
    { key: "todas", label: "Todas" },
  ];

  function renderQueueRow(item: CobranzasQueueItem) {
    const isExpanded = expandedRow === item.id;
    return (
      <tbody key={item.id}>
        <tr
          className={`border-b border-[var(--card-border)] hover:bg-white/5 cursor-pointer ${getSemaforoBg(item.semaforo)}`}
          onClick={() => setExpandedRow(isExpanded ? null : item.id)}
        >
          <td className="px-4 py-3">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${getSemaforoDot(item.semaforo)}`}
              title={item.semaforo}
            />
          </td>
          <td className="px-4 py-3">
            <div>
              <p className="font-medium text-white">{item.client_nombre}</p>
              <p className="text-xs text-[var(--muted)]">
                {item.programa ?? ""}
              </p>
            </div>
          </td>
          <td className="px-4 py-3">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/10 text-white">
              {getTipoLabel(item)}
            </span>
          </td>
          <td className="px-4 py-3 font-medium text-white">
            {item.monto_usd > 0 ? fmt(item.monto_usd) : "-"}
          </td>
          <td className="px-4 py-3 text-xs text-[var(--muted)]">
            {item.fecha_vencimiento ?? "-"}
          </td>
          <td className="px-4 py-3">
            <span
              className={`text-xs font-medium ${getSemaforoColor(item.semaforo)}`}
            >
              {getDiasLabel(item.dias_vencido)}
            </span>
          </td>
          <td className="px-4 py-3">
            <span className="text-xs text-[var(--muted)]">
              {item.estado_contacto ?? "por_contactar"}
            </span>
          </td>
          {canSeeAgent && (
            <td className="px-4 py-3">
              {item.task_asignado_a === "agent" ? (
                <div>
                  <span className="text-xs px-1.5 py-0.5 bg-[var(--purple)]/20 text-[var(--purple-light)] rounded">
                    Bot
                  </span>
                  {item.last_log && (
                    <p className="text-xs text-[var(--muted)] mt-1 truncate max-w-[150px]">
                      {item.last_log.accion}
                    </p>
                  )}
                </div>
              ) : item.task_asignado_a === "human" ? (
                <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                  Humano
                </span>
              ) : (
                <span className="text-xs text-[var(--muted)]">-</span>
              )}
            </td>
          )}
          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex gap-1">
              <button
                onClick={() => handleMarkContactado(item)}
                disabled={activeAction === item.id}
                className="text-xs px-2 py-1 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 disabled:opacity-50"
                title="Marcar contactado"
              >
                Contactado
              </button>
              <button
                onClick={() =>
                  setActiveAction(
                    activeAction === `pay-${item.id}`
                      ? null
                      : `pay-${item.id}`
                  )
                }
                className="text-xs px-2 py-1 bg-green-500/20 text-[var(--green)] rounded hover:bg-green-500/30"
                title="Marcar pagado"
              >
                Pagado
              </button>
              <button
                onClick={() =>
                  setActiveAction(
                    activeAction === `note-${item.id}`
                      ? null
                      : `note-${item.id}`
                  )
                }
                className="text-xs px-2 py-1 bg-white/10 text-[var(--muted)] rounded hover:bg-white/20"
                title="Agregar nota"
              >
                Nota
              </button>
              {item.task_id && item.task_prioridad > 1 && (
                <button
                  onClick={() => handleEscalar(item)}
                  disabled={activeAction === item.id}
                  className="text-xs px-2 py-1 bg-red-500/20 text-[var(--red)] rounded hover:bg-red-500/30 disabled:opacity-50"
                  title="Escalar prioridad"
                >
                  Escalar
                </button>
              )}
            </div>
            {/* Inline payment form */}
            {activeAction === `pay-${item.id}` && (
              <PaymentMiniForm
                paymentId={item.payment_id}
                taskId={item.task_id}
                defaultMonto={item.monto_usd}
                sessionTeamMemberId={session.team_member_id}
                onSuccess={() => {
                  setActiveAction(null);
                  setQueue((prev) =>
                    prev.filter((q) => q.id !== item.id)
                  );
                }}
                onCancel={() => setActiveAction(null)}
              />
            )}
            {/* Inline note form */}
            {activeAction === `note-${item.id}` && (
              <NoteMiniForm
                taskId={item.task_id}
                clientId={item.client_id}
                authorId={session.team_member_id}
                onSuccess={() => setActiveAction(null)}
                onCancel={() => setActiveAction(null)}
              />
            )}
          </td>
        </tr>
        {/* Expanded row with client details */}
        {isExpanded && (
          <tr className="border-b border-[var(--card-border)]">
            <td colSpan={canSeeAgent ? 9 : 8} className="px-4 py-4 bg-white/[0.02]">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Client info */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-[var(--muted)] uppercase">Info del cliente</h4>
                  <div className="space-y-1 text-sm">
                    <p className="text-white font-medium">{item.client_nombre}</p>
                    {item.client_telefono && (
                      <p className="text-[var(--muted)]">Tel: {item.client_telefono}</p>
                    )}
                    {item.client_canal && (
                      <p className="text-[var(--muted)]">Canal: {item.client_canal}</p>
                    )}
                    {item.programa && (
                      <p className="text-[var(--muted)]">Programa: {item.programa}</p>
                    )}
                  </div>
                </div>
                {/* Payment info */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-[var(--muted)] uppercase">Info de pago</h4>
                  <div className="space-y-1 text-sm">
                    <p className="text-white">
                      {getTipoLabel(item)} - {fmt(item.monto_usd)}
                    </p>
                    <p className="text-[var(--muted)]">
                      Vence: {item.fecha_vencimiento ?? "Sin fecha"}
                    </p>
                    <p className={`font-medium ${getSemaforoColor(item.semaforo)}`}>
                      {getDiasLabel(item.dias_vencido)}
                    </p>
                    {item.payment_estado && (
                      <p className="text-[var(--muted)]">Estado pago: {item.payment_estado}</p>
                    )}
                  </div>
                </div>
                {/* Task / Agent info */}
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-[var(--muted)] uppercase">Estado de gestion</h4>
                  <div className="space-y-1 text-sm">
                    <p className="text-[var(--muted)]">
                      Contacto: {item.estado_contacto ?? "por_contactar"}
                    </p>
                    {item.task_id && (
                      <>
                        <p className="text-[var(--muted)]">
                          Tarea: {item.task_estado ?? "-"}
                        </p>
                        {canSeeAgent && item.task_asignado_a && (
                          <p className="text-[var(--muted)]">
                            Asignado: {item.task_asignado_a}
                          </p>
                        )}
                      </>
                    )}
                    {item.last_log && (
                      <div className="mt-1 p-2 bg-white/5 rounded text-xs">
                        <p className="text-[var(--muted)]">Ultimo log:</p>
                        <p className="text-white">{item.last_log.accion}</p>
                        <p className="text-[var(--muted)] mt-0.5">
                          {new Date(item.last_log.created_at).toLocaleDateString("es-AR")}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {/* Client notes section */}
              {item.client_id && (
                <ClientNotesInline clientId={item.client_id} />
              )}
            </td>
          </tr>
        )}
      </tbody>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Tab Toggle + Month Selector */}
      <div className="flex flex-wrap items-center gap-4">
      <div className="flex gap-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-1 w-fit">
        <button
          onClick={() => setMainTab("cola")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            mainTab === "cola"
              ? "bg-[var(--purple)] text-white"
              : "text-[var(--muted)] hover:text-white hover:bg-white/5"
          }`}
        >
          Cola de Cobranzas
        </button>
        <button
          onClick={() => setMainTab("auditoria")}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            mainTab === "auditoria"
              ? "bg-[var(--purple)] text-white"
              : "text-[var(--muted)] hover:text-white hover:bg-white/5"
          }`}
        >
          Auditoria Cuotas
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-[var(--muted)]">Mes fiscal:</span>
        <MonthSelector77 value={selectedMonth} onChange={setSelectedMonth} />
      </div>
      </div>

      {mainTab === "auditoria" && (
        <AuditoriaCuotasTab cuotas={auditCuotas} renovaciones={auditRenovaciones} selectedMonth={selectedMonth} onMonthChange={setSelectedMonth} usdRate={usdRate} />
      )}

      {mainTab === "cola" && <>
      {/* Potencial del mes */}
      <div className="bg-gradient-to-r from-[var(--purple)]/10 to-blue-500/10 border border-[var(--purple)]/30 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-sm font-medium text-[var(--purple-light)]">Potencial del mes</p>
              <button
                onClick={copyCobranzasWA}
                className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                  copiedAt
                    ? "bg-[var(--green)]/15 border-[var(--green)]/40 text-[var(--green)]"
                    : "bg-[var(--purple)]/10 border-[var(--purple)]/30 text-[var(--purple-light)] hover:bg-[var(--purple)]/20"
                }`}
                title="Copia la lista de cobranzas formateada para mandar por WhatsApp"
              >
                {copiedAt ? "✓ Copiado" : "📋 Copiar para WA"}
              </button>
            </div>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Periodo fiscal {fiscalStart} al {fiscalEnd}
            </p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-xl font-bold text-white">${totalPorCobrar.toLocaleString()}</p>
              <p className="text-xs text-[var(--muted)]">en cuotas por cobrar</p>
            </div>
            <div className="text-[var(--muted)]">+</div>
            <div className="text-center">
              <p className="text-xl font-bold text-white">{renovacionesEsperadas}</p>
              <p className="text-xs text-[var(--muted)]">clientes por renovar</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-[var(--card-bg)] border border-orange-500/30 rounded-xl p-4">
          <p className="text-xs text-orange-400 uppercase font-medium">Cobrar hoy</p>
          <p className="text-2xl font-bold text-orange-400">{cobrarHoyCount}</p>
          <p className="text-xs text-[var(--muted)] mt-1">${cobrarHoyMonto.toLocaleString()} USD</p>
        </div>
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
          <p className="text-xs text-[var(--muted)] uppercase font-medium">Por cobrar este mes</p>
          <p className="text-2xl font-bold text-white">${totalPorCobrar.toLocaleString()}</p>
          <p className="text-xs text-[var(--muted)] mt-1">{fiscalItemsWithOverdue.length} cuotas pendientes</p>
        </div>
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
          <p className="text-xs text-[var(--muted)] uppercase font-medium">Cobrado este mes</p>
          <p className="text-2xl font-bold text-[var(--green)]">${cobradoTotal.toLocaleString()}</p>
          <p className="text-xs text-[var(--muted)] mt-1">{fiscalPaid.count} pagos recibidos</p>
        </div>
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
          <p className="text-xs text-[var(--muted)] uppercase font-medium">Vencidas</p>
          <p className="text-2xl font-bold text-[var(--red)]">{totalVencidas}</p>
          <p className="text-xs text-[var(--red)]/70 mt-1">${montoVencido.toLocaleString()} USD</p>
        </div>
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
          <p className="text-xs text-[var(--muted)] uppercase font-medium">Tasa de cobro</p>
          <p className="text-2xl font-bold text-[var(--purple-light)]">{tasaCobro.toFixed(1)}%</p>
          <div className="mt-2 bg-[var(--card-border)] rounded-full h-1.5">
            <div
              className="bg-[var(--purple)] h-1.5 rounded-full transition-all"
              style={{ width: `${Math.min(tasaCobro, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* \u2550\u2550\u2550\u2550\u2550\u2550 Weekly Breakdown \u2014 vista principal de la cola \u2550\u2550\u2550\u2550\u2550\u2550 */}
      <div>
        {(() => {
          // Total de las semanas del mes vigente (sin atrasadas, sin futuros).
          const totalMesVigente = weeks.reduce((s, w) => s + w.total, 0);
          const _d = new Date(fiscalStart + "T00:00:00");
          const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
          const mesNombre = `${meses[_d.getMonth()]} ${_d.getFullYear()}`;
          return (
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <span aria-hidden>{"\u{1F4C5}"}</span>
                  <span>Cuotas del mes &mdash; <span className="text-[var(--purple-light)]">{mesNombre}</span></span>
                </h2>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  Cuotas agrupadas por semana. Click una semana para ver el detalle de cada cuota.
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[var(--muted)] uppercase tracking-wider">Total mes vigente</p>
                <p className="text-xl font-bold text-white" style={{ fontVariantNumeric: "tabular-nums" }}>
                  ${totalMesVigente.toLocaleString()}
                </p>
              </div>
            </div>
          );
        })()}
        {(() => {
          // Atrasadas = cuotas con vencimiento ANTES del inicio del mes vigente.
          // No entran en el grid del mes (que muestra semanas dentro del mes).
          const fiscalStartDate = new Date(fiscalStart + "T00:00:00");
          const atrasadas = fiscalItemsWithOverdue.filter((i) => {
            if (!i.fecha_vencimiento) return false;
            return new Date(i.fecha_vencimiento + "T00:00:00") < fiscalStartDate;
          });
          const totalAtrasadas = atrasadas.reduce((s, i) => s + i.monto_usd, 0);
          if (atrasadas.length === 0) return null;
          const isExpanded = expandedMonths.has("atrasadas");
          return (
            <div
              className="mb-3 bg-[var(--card-bg)] border rounded-xl overflow-hidden"
              style={{ borderColor: "#FB7185", borderLeftWidth: 4 }}
            >
              <button
                onClick={() => toggleMonth("atrasadas")}
                className="w-full flex items-center justify-between gap-3 p-4 hover:bg-white/5 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span aria-hidden style={{ fontSize: 22 }}>{"\u26A0\uFE0F"}</span>
                  <div>
                    <p className="text-sm font-semibold text-[var(--red)]">
                      Atrasadas (meses anteriores)
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {atrasadas.length} {atrasadas.length === 1 ? "cuota" : "cuotas"}{" "}sin cobrar de meses pasados. Click para ver el detalle.
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className="text-xl font-bold text-[var(--red)]"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    ${totalAtrasadas.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-[var(--muted)]">total atrasado</p>
                </div>
              </button>
              {isExpanded && (
                <div className="border-t border-[var(--card-border)] p-3 space-y-1">
                  {atrasadas
                    .slice()
                    .sort((a, b) => (a.fecha_vencimiento || "").localeCompare(b.fecha_vencimiento || ""))
                    .map((item) => (
                      <PendingItemRow
                        key={item.id}
                        item={item}
                        fmt={fmt}
                        getSemaforoBg={getSemaforoBg}
                        getSemaforoDot={getSemaforoDot}
                        getTipoLabel={getTipoLabel}
                        sessionTeamMemberId={session.team_member_id}
                        showVencRed
                        onChange={() => {
                          setQueue((prev) => prev.filter((q) => q.id !== item.id));
                        }}
                      />
                    ))}
                </div>
              )}
            </div>
          );
        })()}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {weeks.map((week, idx) => {
            const isExpanded = expandedWeeks.has(idx);
            const weekVencidas = week.items.filter((i) => i.semaforo === "vencido").length;
            const weekUrgentes = week.items.filter((i) => i.semaforo === "urgente").length;
            const hasItems = week.items.length > 0;
            const accentColor = weekVencidas > 0 ? "#FB7185" : weekUrgentes > 0 ? "#FB923C" : hasItems ? "#34D399" : "rgba(255,255,255,0.15)";
            return (
              <button
                key={idx}
                onClick={() => toggleWeek(idx)}
                className="text-left bg-[var(--card-bg)] border rounded-xl p-4 transition-all hover:scale-[1.02]"
                style={{
                  borderColor: isExpanded ? accentColor : "var(--card-border)",
                  borderTopWidth: 3,
                  borderTopColor: accentColor,
                  boxShadow: isExpanded ? `0 0 0 1px ${accentColor}80` : "0 8px 32px rgba(0,0,0,0.18)",
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-wider text-[var(--muted)] font-semibold">
                    Semana {idx + 1}
                  </span>
                  {weekVencidas > 0 && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: "#FB718520", color: "#FB7185" }}
                    >
                      {weekVencidas} venc.
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--muted)] mb-2" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {week.label.replace(/Semana \d+ \(|\)/g, "")}
                </p>
                <p
                  className="text-2xl font-bold mb-1"
                  style={{
                    color: hasItems ? "#fff" : "rgba(255,255,255,0.35)",
                    fontVariantNumeric: "tabular-nums",
                    letterSpacing: "-0.02em",
                  }}
                >
                  ${week.total.toLocaleString()}
                </p>
                <p className="text-[11px] text-[var(--muted)]">
                  {hasItems
                    ? `${week.items.length} cuota${week.items.length !== 1 ? "s" : ""}`
                    : "Sin cuotas"}
                </p>
              </button>
            );
          })}
        </div>

        {/* Detalle expandido \u2014 debajo del grid */}
        {Array.from(expandedWeeks).sort().map((idx) => {
          const week = weeks[idx];
          if (!week) return null;
          return (
            <div
              key={`detail-${idx}`}
              className="mt-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">
                  {week.label} \u00B7 <span className="text-[var(--muted)]">{week.items.length} cuotas \u00B7 ${week.total.toLocaleString()}</span>
                </h3>
                <button
                  onClick={() => toggleWeek(idx)}
                  className="text-xs text-[var(--muted)] hover:text-white"
                >
                  \u2715 Cerrar
                </button>
              </div>
              {week.items.length === 0 ? (
                <p className="text-xs text-[var(--muted)] py-4 text-center">
                  Sin cuotas en esta semana
                </p>
              ) : (
                <div className="space-y-1">
                  {week.items.map((item) => (
                    <PendingItemRow
                      key={item.id}
                      item={item}
                      fmt={fmt}
                      getSemaforoBg={getSemaforoBg}
                      getSemaforoDot={getSemaforoDot}
                      getTipoLabel={getTipoLabel}
                      sessionTeamMemberId={session.team_member_id}
                      showDiasLabel
                      diasLabel={getDiasLabel(item.dias_vencido)}
                      diasColor={getSemaforoColor(item.semaforo)}
                      onChange={() => {
                        setQueue((prev) => prev.filter((q) => q.id !== item.id));
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* ══════ Meses futuros (colapsables) ══════ */}
        {futureMonths.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-[var(--muted)] uppercase tracking-wider font-semibold">
              Pr&oacute;ximos meses
            </p>
            {futureMonths.map((m) => {
              const expanded = expandedMonths.has(m.ym);
              return (
                <div
                  key={m.ym}
                  className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => toggleMonth(m.ym)}
                    className="w-full flex items-center justify-between gap-3 p-4 hover:bg-white/5 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="text-[var(--muted)]"
                        style={{ fontSize: 12, transition: "transform 200ms", display: "inline-block", transform: expanded ? "rotate(90deg)" : "rotate(0)" }}
                      >
                        &#9658;
                      </span>
                      <span className="text-sm font-semibold text-white">{m.label}</span>
                      <span className="text-xs text-[var(--muted)]">
                        {m.count} cuota{m.count !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <span
                      className="text-lg font-bold text-white"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      ${m.total.toLocaleString()}
                    </span>
                  </button>
                  {expanded && (
                    <div className="border-t border-[var(--card-border)] p-3 space-y-1">
                      {m.items
                        .slice()
                        .sort((a, b) => (a.fecha_vencimiento || "").localeCompare(b.fecha_vencimiento || ""))
                        .map((item) => (
                          <PendingItemRow
                            key={item.id}
                            item={item}
                            fmt={fmt}
                            getSemaforoBg={getSemaforoBg}
                            getSemaforoDot={getSemaforoDot}
                            getTipoLabel={getTipoLabel}
                            sessionTeamMemberId={session.team_member_id}
                            showFecha
                            onChange={() => {
                              setQueue((prev) => prev.filter((q) => q.id !== item.id));
                            }}
                          />
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Agent Tasks Dashboard */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Panel de Tareas</h2>
          {session.is_admin && (
            <button
              onClick={async () => {
                try {
                  const res = await fetch("/api/agent-tasks/generate", { method: "POST" });
                  if (res.ok) {
                    const data = await res.json();
                    toast.success(`${data.created} tareas creadas · ${data.skipped} duplicadas`);
                    router.refresh();
                  } else {
                    toast.error("No se pudieron generar las tareas");
                  }
                } catch (err) {
                  toast.error("Error de red: " + (err instanceof Error ? err.message : String(err)));
                }
              }}
              className="text-xs px-3 py-1.5 bg-[var(--purple)] text-white rounded-lg hover:bg-[var(--purple-dark)]"
            >
              Generar tareas
            </button>
          )}
        </div>

        {/* Task stats by status */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(
            [
              {
                label: "Cobrar hoy",
                count: cobrarHoyCount,
                color: "text-orange-400",
                bgColor: "bg-orange-500/10",
              },
              {
                label: "Pendientes",
                count: allTasks.filter((t) => t.estado === "pending").length,
                color: "text-[var(--yellow)]",
                bgColor: "bg-yellow-500/10",
              },
              {
                label: "En progreso",
                count: allTasks.filter((t) => t.estado === "in_progress").length,
                color: "text-blue-400",
                bgColor: "bg-blue-500/10",
              },
              {
                label: "Completadas",
                count: allTasks.filter((t) => t.estado === "done").length,
                color: "text-[var(--green)]",
                bgColor: "bg-green-500/10",
              },
              {
                label: "Fallidas",
                count: allTasks.filter((t) => t.estado === "failed").length,
                color: "text-[var(--red)]",
                bgColor: "bg-red-500/10",
              },
            ] as const
          ).map((stat) => (
            <div
              key={stat.label}
              className={`rounded-lg p-3 ${stat.bgColor}`}
            >
              <p className={`text-xs font-medium ${stat.color}`}>{stat.label}</p>
              <p className={`text-xl font-bold ${stat.color}`}>{stat.count}</p>
            </div>
          ))}
        </div>

        {/* Tasks by type */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {(
            [
              { tipo: "cobrar_cuota", label: "Cobrar cuota" },
              { tipo: "renovacion", label: "Renovacion" },
              { tipo: "seguimiento", label: "Seguimiento" },
              { tipo: "oportunidad_upsell", label: "Upsell" },
              { tipo: "bienvenida", label: "Bienvenida" },
              { tipo: "seguimiento_urgente", label: "Urgente" },
              { tipo: "confirmar_pago", label: "Confirmar pago" },
            ] as const
          ).map((t) => {
            const count = allTasks.filter(
              (task) => task.tipo === t.tipo
            ).length;
            const active = allTasks.filter(
              (task) =>
                task.tipo === t.tipo &&
                (task.estado === "pending" || task.estado === "in_progress")
            ).length;
            return (
              <div
                key={t.tipo}
                className="text-xs border border-[var(--card-border)] rounded-lg px-2 py-1.5 flex justify-between items-center"
              >
                <span className="text-[var(--muted)]">{t.label}</span>
                <span className="font-medium text-white">
                  {active}/{count}
                </span>
              </div>
            );
          })}
        </div>

        {/* Completion rate */}
        {(() => {
          const total = allTasks.length;
          const done = allTasks.filter((t) => t.estado === "done").length;
          const rate = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-[var(--card-border)] rounded-full h-2">
                <div
                  className="bg-[var(--green)] h-2 rounded-full transition-all"
                  style={{ width: `${rate}%` }}
                />
              </div>
              <span className="text-sm font-medium text-[var(--muted)]">
                {rate}% completado ({done}/{total})
              </span>
            </div>
          );
        })()}

        {/* Recent activity (agent log) -- only for can_see_agent */}
        {canSeeAgent && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-[var(--muted)] mb-2">
              Actividad reciente del agente
            </h3>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {queue
                .filter((item) => item.last_log && item.task_asignado_a === "agent")
                .slice(0, 10)
                .map((item) => (
                  <div
                    key={`log-${item.id}`}
                    className="flex items-center gap-2 text-xs text-[var(--muted)] py-1 border-b border-[var(--card-border)]"
                  >
                    <span className="px-1.5 py-0.5 bg-[var(--purple)]/20 text-[var(--purple-light)] rounded">
                      Bot
                    </span>
                    <span className="font-medium text-white">
                      {item.client_nombre}
                    </span>
                    <span>{item.last_log!.accion}</span>
                    <span className="ml-auto text-[var(--muted)]">
                      {new Date(item.last_log!.created_at).toLocaleDateString("es-AR")}
                    </span>
                  </div>
                ))}
              {queue.filter((item) => item.last_log && item.task_asignado_a === "agent")
                .length === 0 && (
                <p className="text-xs text-[var(--muted)]">
                  Sin actividad reciente del agente
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Period Filter Tabs */}
      <div className="flex gap-1 border-b border-[var(--card-border)]">
        {periodoTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterPeriodo(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              filterPeriodo === tab.key
                ? "border-[var(--purple)] text-[var(--purple-light)]"
                : "border-transparent text-[var(--muted)] hover:text-gray-200"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 text-xs bg-white/10 px-1.5 py-0.5 rounded-full">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Buscar cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-[var(--card-border)] bg-[var(--card-bg)] text-white rounded-lg px-3 py-2 text-sm w-64 focus:border-[var(--purple)] outline-none"
        />
        <select
          value={filterTipo}
          onChange={(e) => setFilterTipo(e.target.value as FilterTipo)}
          className="border border-[var(--card-border)] bg-[var(--card-bg)] text-white rounded-lg px-3 py-2 text-sm focus:border-[var(--purple)] outline-none"
        >
          <option value="todos">Todos los tipos</option>
          <option value="cuotas">Cuotas</option>
          <option value="renovaciones">Renovaciones</option>
          <option value="deudores">Deudores</option>
        </select>
      </div>

      {/* Queue Table */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Estado</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Cliente</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Tipo</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Monto</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Vencimiento</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Dias</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Contacto</th>
                {canSeeAgent && (
                  <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">
                    Agente
                  </th>
                )}
                <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">
                  Acciones
                </th>
              </tr>
            </thead>
            {filtered.map((item) => renderQueueRow(item))}
            {filtered.length === 0 && (
              <tbody>
                <tr>
                  <td
                    colSpan={canSeeAgent ? 9 : 8}
                    className="px-4 py-12 text-center text-[var(--muted)]"
                  >
                    No hay items en la cola
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
      </div>

      {/* Para Revisar / Analizar section */}
      {queueParaRevisar.length > 0 && (
        <div className="bg-[var(--card-bg)] border border-yellow-500/30 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-yellow-500/30 bg-yellow-500/5">
            <div className="flex items-center gap-2">
              <span className="text-yellow-400 text-sm font-semibold">Para revisar / Analizar</span>
              <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">
                {queueParaRevisar.length}
              </span>
            </div>
            <p className="text-xs text-[var(--muted)] mt-1">
              Cuotas sin fecha de vencimiento asignada. Requieren revision.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--card-border)]">
                  <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Cliente</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Tipo</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Monto</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Programa</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Contacto</th>
                </tr>
              </thead>
              <tbody>
                {queueParaRevisar.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-[var(--card-border)] hover:bg-white/5 cursor-pointer"
                    onClick={() => setExpandedRow(expandedRow === item.id ? null : item.id)}
                  >
                    <td className="px-4 py-3 font-medium text-white">{item.client_nombre}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400">
                        {getTipoLabel(item)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-white">
                      {item.monto_usd > 0 ? fmt(item.monto_usd) : "-"}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">{item.programa ?? "-"}</td>
                    <td className="px-4 py-3 text-xs text-[var(--muted)]">
                      {item.estado_contacto ?? "por_contactar"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>}
    </div>
  );
}

// ========================================
// AuditoriaCuotasTab -- commission audit for Mel
// ========================================
function AuditoriaCuotasTab({
  cuotas,
  renovaciones,
  selectedMonth,
  onMonthChange,
  usdRate,
}: {
  cuotas: AuditCuotaRow[];
  renovaciones: AuditCuotaRow[];
  selectedMonth: string;
  onMonthChange: (value: string) => void;
  usdRate: number;
}) {
  const fmt = (usd: number, ars?: number) => formatMoney(usd, ars || 0, usdRate);
  const [cobradorFilter, setCobradorFilter] = useState<"todos" | "mel">("todos");

  // Compute fiscal period (standard calendar month for ROMS)
  const periodStart = parseLocalDate(selectedMonth);
  const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0); // last day of month
  const periodStartStr = toDateString(periodStart);
  const periodEndStr = toDateString(periodEnd);

  // Get fiscal month label for display
  const periodLabel = getFiscalMonth(periodStart);

  // Filter cuotas by fiscal period and cobrador
  // Solo cuotas con fecha_pago dentro del rango Y estado=pagado (sin fecha NO cuentan)
  const filteredCuotas = useMemo(() => {
    return cuotas.filter((c) => {
      if (!c.fecha_pago) return false;
      if (c.fecha_pago < periodStartStr || c.fecha_pago > periodEndStr) return false;
      if (cobradorFilter === "mel") {
        return c.cobrador_nombre?.toLowerCase().includes("mel") ?? false;
      }
      return true;
    });
  }, [cuotas, periodStartStr, periodEndStr, cobradorFilter]);

  const filteredRenovaciones = useMemo(() => {
    return renovaciones.filter((r) => {
      if (!r.fecha_pago) return false;
      if (r.fecha_pago < periodStartStr || r.fecha_pago > periodEndStr) return false;
      if (cobradorFilter === "mel") {
        return r.cobrador_nombre?.toLowerCase().includes("mel") ?? false;
      }
      return true;
    });
  }, [renovaciones, periodStartStr, periodEndStr, cobradorFilter]);

  // Summaries
  const totalCuotas = filteredCuotas.reduce((sum, c) => sum + c.monto_usd, 0);
  const totalRenovaciones = filteredRenovaciones.reduce((sum, r) => sum + r.monto_usd, 0);
  const comisionCuotas = totalCuotas * 0.1;
  const comisionRenovaciones = totalRenovaciones * 0.1;
  const comisionTotal = comisionCuotas + comisionRenovaciones;

  // Unique cobradores for reference
  const allCobradores = useMemo(() => {
    const names = new Set<string>();
    [...cuotas, ...renovaciones].forEach((c) => {
      if (c.cobrador_nombre) names.add(c.cobrador_nombre);
    });
    return Array.from(names).sort();
  }, [cuotas, renovaciones]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--muted)]">Cobrador:</span>
          <select
            value={cobradorFilter}
            onChange={(e) => setCobradorFilter(e.target.value as "todos" | "mel")}
            className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
          >
            <option value="todos">Todos</option>
            <option value="mel">Mel</option>
          </select>
        </div>
      </div>

      {/* Grand Total Commission Card */}
      <div className="bg-gradient-to-r from-[var(--purple)]/10 to-green-500/10 border border-[var(--purple)]/30 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-3">
          Comision {cobradorFilter === "mel" ? "Mel" : "Total"} - {periodLabel}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-xs text-[var(--muted)] uppercase">Cuotas cobradas</p>
            <p className="text-xl font-bold text-white">${totalCuotas.toLocaleString()}</p>
            <p className="text-xs text-[var(--muted)]">{filteredCuotas.length} cuotas</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-xs text-[var(--muted)] uppercase">Renovaciones cobradas</p>
            <p className="text-xl font-bold text-white">${totalRenovaciones.toLocaleString()}</p>
            <p className="text-xs text-[var(--muted)]">{filteredRenovaciones.length} renovaciones</p>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <p className="text-xs text-[var(--muted)] uppercase">Base comision (10%)</p>
            <p className="text-xl font-bold text-[var(--purple-light)]">
              ${(totalCuotas + totalRenovaciones).toLocaleString()}
            </p>
          </div>
          <div className="bg-[var(--green)]/10 border border-[var(--green)]/30 rounded-lg p-3">
            <p className="text-xs text-[var(--green)] uppercase font-medium">Total comision</p>
            <p className="text-2xl font-bold text-[var(--green)]">${comisionTotal.toLocaleString()}</p>
            <p className="text-xs text-[var(--muted)]">
              Cuotas ${comisionCuotas.toLocaleString()} + Renov ${comisionRenovaciones.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Detalle Cuotas Cobradas */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--card-border)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              Detalle Cuotas Cobradas
              <span className="ml-2 text-xs bg-white/10 px-2 py-0.5 rounded-full text-[var(--muted)]">
                {filteredCuotas.length}
              </span>
            </h3>
            <span className="text-sm font-bold text-white">${totalCuotas.toLocaleString()}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Cliente</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Cuota #</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Monto USD</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Fecha Pago</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Receptor</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Cobrador</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Metodo</th>
              </tr>
            </thead>
            <tbody>
              {filteredCuotas.map((c) => (
                <tr key={c.id} className="border-b border-[var(--card-border)] hover:bg-white/5">
                  <td className="px-4 py-3 font-medium text-white">{c.client_nombre}</td>
                  <td className="px-4 py-3 text-white">{c.numero_cuota}</td>
                  <td className="px-4 py-3 font-medium text-white">{fmt(c.monto_usd)}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{c.fecha_pago ?? "-"}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{c.receptor ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      c.cobrador_nombre?.toLowerCase().includes("mel")
                        ? "bg-[var(--purple)]/20 text-[var(--purple-light)]"
                        : "bg-white/10 text-[var(--muted)]"
                    }`}>
                      {c.cobrador_nombre ?? "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)] text-xs">{c.metodo_pago ?? "-"}</td>
                </tr>
              ))}
              {filteredCuotas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[var(--muted)]">
                    Sin cuotas cobradas en este periodo
                  </td>
                </tr>
              )}
            </tbody>
            {filteredCuotas.length > 0 && (
              <tfoot>
                <tr className="border-t border-[var(--card-border)] bg-white/[0.02]">
                  <td className="px-4 py-3 font-medium text-[var(--muted)]" colSpan={2}>
                    Total: {filteredCuotas.length} cuotas
                  </td>
                  <td className="px-4 py-3 font-bold text-white">${totalCuotas.toLocaleString()}</td>
                  <td colSpan={2} className="px-4 py-3" />
                  <td className="px-4 py-3 font-medium text-[var(--green)]" colSpan={2}>
                    Comision (10%): ${comisionCuotas.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Renovaciones Cobradas */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--card-border)]">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">
              Renovaciones Cobradas
              <span className="ml-2 text-xs bg-white/10 px-2 py-0.5 rounded-full text-[var(--muted)]">
                {filteredRenovaciones.length}
              </span>
            </h3>
            <span className="text-sm font-bold text-white">${totalRenovaciones.toLocaleString()}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Cliente</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Monto USD</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Fecha Pago</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Receptor</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Cobrador</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--muted)]">Metodo</th>
              </tr>
            </thead>
            <tbody>
              {filteredRenovaciones.map((r) => (
                <tr key={r.id} className="border-b border-[var(--card-border)] hover:bg-white/5">
                  <td className="px-4 py-3 font-medium text-white">{r.client_nombre}</td>
                  <td className="px-4 py-3 font-medium text-white">{fmt(r.monto_usd)}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{r.fecha_pago ?? "-"}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{r.receptor ?? "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      r.cobrador_nombre?.toLowerCase().includes("mel")
                        ? "bg-[var(--purple)]/20 text-[var(--purple-light)]"
                        : "bg-white/10 text-[var(--muted)]"
                    }`}>
                      {r.cobrador_nombre ?? "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)] text-xs">{r.metodo_pago ?? "-"}</td>
                </tr>
              ))}
              {filteredRenovaciones.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[var(--muted)]">
                    Sin renovaciones cobradas en este periodo
                  </td>
                </tr>
              )}
            </tbody>
            {filteredRenovaciones.length > 0 && (
              <tfoot>
                <tr className="border-t border-[var(--card-border)] bg-white/[0.02]">
                  <td className="px-4 py-3 font-medium text-[var(--muted)]">
                    Total: {filteredRenovaciones.length} renovaciones
                  </td>
                  <td className="px-4 py-3 font-bold text-white">${totalRenovaciones.toLocaleString()}</td>
                  <td colSpan={2} className="px-4 py-3" />
                  <td className="px-4 py-3 font-medium text-[var(--green)]" colSpan={2}>
                    Comision (10%): ${comisionRenovaciones.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

// ========================================
// PendingItemRow -- item de cuota con acciones inline (marcar pagada, editar fecha, borrar)
// ========================================
function PendingItemRow({
  item,
  fmt,
  getSemaforoBg,
  getSemaforoDot,
  getTipoLabel,
  sessionTeamMemberId,
  showFecha = false,
  showVencRed = false,
  showDiasLabel = false,
  diasLabel = "",
  diasColor = "",
  onChange,
}: {
  item: CobranzasQueueItem;
  fmt: (n: number) => string;
  getSemaforoBg: (s: string) => string;
  getSemaforoDot: (s: string) => string;
  getTipoLabel: (i: CobranzasQueueItem) => string;
  sessionTeamMemberId: string;
  showFecha?: boolean;
  showVencRed?: boolean;
  showDiasLabel?: boolean;
  diasLabel?: string;
  diasColor?: string;
  onChange: () => void;
}) {
  const [mode, setMode] = useState<"none" | "pay" | "edit" | "delete">("none");
  const [newFecha, setNewFecha] = useState(item.fecha_vencimiento ?? "");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const fechaCorta = item.fecha_vencimiento
    ? new Date(item.fecha_vencimiento + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })
    : "s/f";

  async function saveFecha() {
    if (!item.payment_id) return;
    setBusy(true);
    try {
      const res = await fetch("/api/pagos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.payment_id, fecha_vencimiento: newFecha || null }),
      });
      if (res.ok) {
        setMode("none");
        onChange();
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!item.payment_id) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/pagos?id=${item.payment_id}`, { method: "DELETE" });
      if (res.ok) {
        setMode("none");
        onChange();
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rounded-lg ${getSemaforoBg(item.semaforo)}`}>
      <div className="flex items-center justify-between p-2.5 text-sm gap-2">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <span className={`w-2 h-2 rounded-full ${getSemaforoDot(item.semaforo)} flex-shrink-0`} />
          <span className="text-white font-medium truncate">{item.client_nombre}</span>
          <span className="text-[10px] text-[var(--muted)] flex-shrink-0">{getTipoLabel(item)}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {showVencRed && (
            <span className="text-[11px] text-[var(--red)]" style={{ fontVariantNumeric: "tabular-nums" }}>
              venc. {fechaCorta}
            </span>
          )}
          {showFecha && !showVencRed && (
            <span className="text-[11px] text-[var(--muted)]" style={{ fontVariantNumeric: "tabular-nums" }}>
              {fechaCorta}
            </span>
          )}
          {showDiasLabel && (
            <span className={`text-[11px] ${diasColor}`}>{diasLabel}</span>
          )}
          <span
            className="text-white font-semibold"
            style={{ fontVariantNumeric: "tabular-nums", minWidth: 70, textAlign: "right" }}
          >
            {fmt(item.monto_usd)}
          </span>
          {item.payment_id && (
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={() => setMode(mode === "pay" ? "none" : "pay")}
                title="Marcar como pagada"
                className="text-[11px] px-2 py-1 rounded bg-green-500/20 hover:bg-green-500/30 text-green-300 transition-colors"
              >
                ✓
              </button>
              <button
                onClick={() => setMode(mode === "edit" ? "none" : "edit")}
                title="Editar fecha de vencimiento"
                className="text-[11px] px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[var(--muted)] transition-colors"
              >
                ✎
              </button>
              <button
                onClick={() => setMode(mode === "delete" ? "none" : "delete")}
                title="Eliminar cuota pendiente"
                className="text-[11px] px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-300 transition-colors"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>
      {mode === "pay" && item.payment_id && (
        <div className="px-2.5 pb-2.5">
          <PaymentMiniForm
            paymentId={item.payment_id}
            taskId={item.task_id}
            defaultMonto={item.monto_usd}
            sessionTeamMemberId={sessionTeamMemberId}
            onSuccess={() => {
              setMode("none");
              onChange();
              router.refresh();
            }}
            onCancel={() => setMode("none")}
          />
        </div>
      )}
      {mode === "edit" && item.payment_id && (
        <div className="px-2.5 pb-2.5">
          <div className="p-3 bg-white/5 border border-[var(--card-border)] rounded-lg flex items-center gap-2">
            <input
              type="date"
              value={newFecha}
              onChange={(e) => setNewFecha(e.target.value)}
              className="border border-[var(--card-border)] bg-[var(--background)] text-white rounded px-2 py-1 text-sm outline-none"
            />
            <button
              type="button"
              onClick={saveFecha}
              disabled={busy}
              className="text-xs px-3 py-1 bg-[var(--purple)] text-white rounded hover:bg-[var(--purple-dark)] disabled:opacity-50"
            >
              {busy ? "..." : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => setMode("none")}
              className="text-xs px-3 py-1 bg-white/10 text-[var(--muted)] rounded hover:bg-white/20"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {mode === "delete" && item.payment_id && (
        <div className="px-2.5 pb-2.5">
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center justify-between gap-2">
            <p className="text-xs text-red-300">¿Eliminar esta cuota pendiente?</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmDelete}
                disabled={busy}
                className="text-xs px-3 py-1 bg-[var(--red)] text-white rounded hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "..." : "Sí, eliminar"}
              </button>
              <button
                type="button"
                onClick={() => setMode("none")}
                className="text-xs px-3 py-1 bg-white/10 text-[var(--muted)] rounded hover:bg-white/20"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========================================
// PaymentMiniForm -- inline form to mark paid
// ========================================
function PaymentMiniForm({
  paymentId,
  taskId,
  defaultMonto,
  sessionTeamMemberId,
  onSuccess,
  onCancel,
}: {
  paymentId: string | null;
  taskId: string | null;
  defaultMonto: number;
  sessionTeamMemberId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [monto, setMonto] = useState(defaultMonto);
  const [metodo, setMetodo] = useState("binance");
  const [receptor, setReceptor] = useState("Mercado Pago");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/cobranzas/mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_id: paymentId,
          task_id: taskId,
          monto_usd: monto,
          metodo_pago: metodo,
          receptor,
          cobrador_id: sessionTeamMemberId,
        }),
      });
      if (res.ok) onSuccess();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg space-y-2"
    >
      <div className="flex gap-2">
        <input
          type="number"
          value={monto}
          onChange={(e) => setMonto(Number(e.target.value))}
          className="border border-[var(--card-border)] bg-[var(--background)] text-white rounded px-2 py-1 text-sm w-24 outline-none"
          placeholder="USD"
        />
        <select
          value={metodo}
          onChange={(e) => setMetodo(e.target.value)}
          className="border border-[var(--card-border)] bg-[var(--background)] text-white rounded px-2 py-1 text-sm outline-none"
        >
          <option value="mercado_pago">Mercado Pago</option>
          <option value="transferencia">Transferencia</option>
          <option value="cash">Efectivo</option>
          <option value="binance">Binance</option>
          <option value="stripe">Stripe</option>
          <option value="wise">Wise</option>
        </select>
      </div>
      <select
        value={receptor}
        onChange={(e) => setReceptor(e.target.value)}
        className="border border-[var(--card-border)] bg-[var(--background)] text-white rounded px-2 py-1 text-sm w-full outline-none"
      >
        <option value="Mercado Pago">Mercado Pago</option>
        <option value="Transferencia">Transferencia</option>
        <option value="Cash">Cash</option>
        <option value="Binance">Binance</option>
        <option value="Stripe">Stripe</option>
        <option value="Wise">Wise</option>
      </select>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="text-xs px-3 py-1 bg-[var(--green)] text-black font-medium rounded hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "..." : "Confirmar pago"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1 bg-white/10 text-[var(--muted)] rounded hover:bg-white/20"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ========================================
// NoteMiniForm -- inline note/log entry
// ========================================
function NoteMiniForm({
  taskId,
  clientId,
  authorId,
  onSuccess,
  onCancel,
}: {
  taskId: string | null;
  clientId: string | null;
  authorId: string;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [nota, setNota] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nota.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/cobranzas/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: taskId,
          accion: nota,
          author_id: authorId,
        }),
      });
      if (res.ok) {
        setNota("");
        onSuccess();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-2 p-3 bg-white/5 border border-[var(--card-border)] rounded-lg space-y-2"
    >
      <textarea
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        className="border border-[var(--card-border)] bg-[var(--background)] text-white rounded px-2 py-1 text-sm w-full outline-none"
        rows={2}
        placeholder="Agregar nota..."
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading || !nota.trim()}
          className="text-xs px-3 py-1 bg-[var(--purple)] text-white rounded hover:bg-[var(--purple-dark)] disabled:opacity-50"
        >
          {loading ? "..." : "Guardar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1 bg-white/10 text-[var(--muted)] rounded hover:bg-white/20"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ========================================
// ClientNotesInline -- shows recent notes for a client in expanded row
// ========================================
function ClientNotesInline({ clientId }: { clientId: string }) {
  const [notes, setNotes] = useState<{ id: string; content: string; created_at: string; author?: { nombre: string } }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function loadNotes() {
    try {
      const res = await fetch(`/api/client-notes?client_id=${clientId}`);
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes?.slice(0, 5) ?? []);
      }
    } finally {
      setLoaded(true);
    }
  }

  function handleToggle() {
    if (!loaded) loadNotes();
    setExpanded(!expanded);
  }

  return (
    <div className="mt-3 border-t border-[var(--card-border)] pt-3">
      <button
        onClick={handleToggle}
        className="text-xs text-[var(--purple-light)] hover:text-white transition-colors"
      >
        {expanded ? "Ocultar notas" : "Ver notas del equipo"}
      </button>
      {expanded && (
        <div className="mt-2 space-y-1">
          {!loaded ? (
            <p className="text-xs text-[var(--muted)]">Cargando...</p>
          ) : notes.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">Sin notas</p>
          ) : (
            notes.map((note) => (
              <div key={note.id} className="text-xs p-2 bg-white/5 rounded">
                <span className="text-[var(--purple-light)] font-medium">{note.author?.nombre ?? "---"}</span>
                <span className="text-[var(--muted)] ml-2">
                  {new Date(note.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
                </span>
                <p className="text-white mt-0.5">{note.content}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
