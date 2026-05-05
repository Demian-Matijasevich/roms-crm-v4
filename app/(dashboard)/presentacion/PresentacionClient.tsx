"use client";

import { useMemo } from "react";

interface Lead { id: string; programa_pitcheado: string | null; ticket_total: number; estado: string | null; fecha_llamada: string | null }
interface Payment { lead_id: string | null; monto_usd: number; fecha_pago: string | null; estado: string }
interface Client { id: string; lead_id: string | null; programa: string | null; fecha_onboarding: string | null; fecha_offboarding: string | null; total_dias_programa: number; estado: string }
interface Rate { mes: string; rate: number }
interface Gasto { id: string; categoria: string; billetera: string; monto_usd: number; monto_ars: number; fecha: string; usd_rate_aplicado: number | null }

interface Props {
  leads: Lead[];
  payments: Payment[];
  clients: Client[];
  rates: Rate[];
  gastos: Gasto[];
}

function fmt(n: number) {
  return "$" + Math.round(n).toLocaleString("en-US");
}

export default function PresentacionClient({ leads, payments, clients, rates, gastos }: Props) {
  const today = new Date();
  const ym = today.toISOString().slice(0, 7);
  const monthStart = `${ym}-01`;
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

  const metrics = useMemo(() => {
    const init = () => ({ omnipresencia: 0, multicuentas: 0, consultoria: 0, roms_7: 0, otros: 0, total: 0 });
    const ventas = init();
    const cash = init();
    const revenue = init();

    function key(p: string | null): keyof ReturnType<typeof init> {
      const x = (p || "").toLowerCase();
      if (x.includes("multi")) return "multicuentas";
      if (x.includes("consult")) return "consultoria";
      if (x.includes("omni")) return "omnipresencia";
      if (x === "roms_7" || x.includes("roms_7")) return "roms_7";
      return "otros";
    }

    for (const l of leads) {
      if (!l.fecha_llamada) continue;
      const f = l.fecha_llamada.split("T")[0];
      if (f < monthStart || f > monthEnd) continue;
      if (l.estado !== "cerrado" && l.estado !== "adentro_seguimiento") continue;
      const k = key(l.programa_pitcheado);
      ventas[k] += l.ticket_total || 0;
      ventas.total += l.ticket_total || 0;
    }

    const programaByLead = new Map<string, string | null>();
    for (const l of leads) programaByLead.set(l.id, l.programa_pitcheado);
    const ticketByLead = new Map<string, number>();
    for (const l of leads) ticketByLead.set(l.id, l.ticket_total || 0);

    for (const p of payments) {
      if (!p.fecha_pago) continue;
      const f = p.fecha_pago.split("T")[0];
      if (f < monthStart || f > monthEnd) continue;
      const programa = p.lead_id ? programaByLead.get(p.lead_id) : null;
      const k = key(programa || null);
      cash[k] += p.monto_usd || 0;
      cash.total += p.monto_usd || 0;
    }

    const DAY = 86400000;
    const monthStartT = new Date(monthStart).getTime();
    const monthEndT = new Date(monthEnd).getTime();
    for (const c of clients) {
      if (!c.fecha_onboarding || !c.lead_id) continue;
      const ticket = ticketByLead.get(c.lead_id) || 0;
      if (ticket <= 0) continue;
      const onb = new Date(c.fecha_onboarding.split("T")[0]).getTime();
      const programEnd = c.fecha_offboarding
        ? new Date(c.fecha_offboarding.split("T")[0]).getTime()
        : onb + (c.total_dias_programa || 90) * DAY;
      const overlapStart = Math.max(onb, monthStartT);
      const overlapEnd = Math.min(programEnd, monthEndT);
      if (overlapEnd < overlapStart) continue;
      const overlapDays = Math.floor((overlapEnd - overlapStart) / DAY) + 1;
      const totalDays = c.total_dias_programa || 90;
      const monthRev = (overlapDays / totalDays) * ticket;
      const k = key(c.programa);
      revenue[k] += monthRev;
      revenue.total += monthRev;
    }

    return { ventas, cash, revenue };
  }, [leads, payments, clients, monthStart, monthEnd]);

  const gastosStats = useMemo(() => {
    const inMonth = gastos.filter((g) => g.fecha?.startsWith(ym));
    const conCategoria = inMonth.filter((g) => g.categoria && g.categoria !== "otros").length;
    const conCaja = inMonth.filter((g) => g.billetera && g.billetera !== "sin_caja").length;
    const conARS = inMonth.filter((g) => (g.monto_ars || 0) > 0).length;
    const conRate = inMonth.filter((g) => g.usd_rate_aplicado).length;
    return { total: inMonth.length, conCategoria, conCaja, conARS, conRate };
  }, [gastos, ym]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 text-white space-y-12 print:space-y-6">
      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .slide { page-break-after: always; padding: 1rem !important; }
          h1, h2, h3 { color: black !important; }
          .text-white { color: black !important; }
          .text-\\[var\\(--muted\\)\\] { color: #555 !important; }
        }
      `}</style>

      {/* COVER */}
      <section className="slide text-center py-12 border-b border-[var(--card-border)] print:border-0">
        <p className="text-xs uppercase text-[var(--purple-light)] tracking-widest mb-2">Pedido de Iñaki — Implementación</p>
        <h1 className="text-5xl font-bold mb-4">📊 Finanzas Pro</h1>
        <p className="text-xl text-[var(--muted)]">5 puntos pedidos &nbsp;·&nbsp; <span className="text-[var(--green)]">✅ Completados</span></p>
        <p className="text-sm text-[var(--muted)] mt-8">CRM ROMS · {today.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}</p>
        <button onClick={() => window.print()}
          className="no-print mt-8 bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-6 py-3 rounded-lg text-sm font-medium">
          🖨️ Exportar a PDF
        </button>
      </section>

      {/* PUNTO 1 */}
      <section className="slide">
        <Header n={1} title="Diferenciar Ventas / Cash / Revenue Devengado" status="done" />
        <p className="text-[var(--muted)] mb-6">Las 3 NO son la misma métrica. Antes estaban mezcladas, ahora se ven separadas con tooltip explicativo en cada una.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <BigMetric color="purple" label="Ventas del mes" value={fmt(metrics.ventas.total)} sub="Lo que firmamos" />
          <BigMetric color="green" label="Cash Collected" value={fmt(metrics.cash.total)} sub="Lo que entró a caja" />
          <BigMetric color="blue" label="Revenue Devengado" value={fmt(metrics.revenue.total)} sub="Lo que ganamos contablemente" />
        </div>

        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-5">
          <p className="text-sm text-[var(--muted)]">📌 <b>Por qué importan:</b> si vendiste $100k en cuotas, el cash de este mes es $33k pero la venta es $100k. Mezclarlas distorsiona el análisis.</p>
        </div>
      </section>

      {/* PUNTO 2 */}
      <section className="slide">
        <Header n={2} title="Cada métrica también por tipo de servicio" status="done" />
        <p className="text-[var(--muted)] mb-6">Ahora las 3 métricas se desglosan por programa. Sirve para ver dónde se concentra el negocio.</p>

        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr className="text-left text-[10px] uppercase text-[var(--muted)]">
                <th className="py-3 px-4">Programa</th>
                <th className="py-3 px-4 text-right">Ventas</th>
                <th className="py-3 px-4 text-right">Cash</th>
                <th className="py-3 px-4 text-right">Devengado</th>
              </tr>
            </thead>
            <tbody>
              {(["omnipresencia", "multicuentas", "consultoria", "roms_7", "otros"] as const).map((k) => {
                const v = metrics.ventas[k]; const c = metrics.cash[k]; const r = metrics.revenue[k];
                if (v === 0 && c === 0 && r === 0) return null;
                const labels: Record<string, string> = {
                  omnipresencia: "Omnipresencia", multicuentas: "Multicuentas",
                  consultoria: "Consultoría", roms_7: "ROMS 7", otros: "Otros",
                };
                return (
                  <tr key={k} className="border-t border-[var(--card-border)]/30">
                    <td className="py-3 px-4 font-medium">{labels[k]}</td>
                    <td className="py-3 px-4 text-right font-mono text-[var(--purple-light)]">{fmt(v)}</td>
                    <td className="py-3 px-4 text-right font-mono text-[var(--green)]">{fmt(c)}</td>
                    <td className="py-3 px-4 text-right font-mono text-blue-400">{fmt(r)}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-[var(--card-border)] font-bold">
                <td className="py-3 px-4">TOTAL</td>
                <td className="py-3 px-4 text-right font-mono text-[var(--purple-light)]">{fmt(metrics.ventas.total)}</td>
                <td className="py-3 px-4 text-right font-mono text-[var(--green)]">{fmt(metrics.cash.total)}</td>
                <td className="py-3 px-4 text-right font-mono text-blue-400">{fmt(metrics.revenue.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* PUNTO 3 */}
      <section className="slide">
        <Header n={3} title="Carga separada de ventas y cobros" status="done" />
        <p className="text-[var(--muted)] mb-6">El sistema siempre lo manejó así. La venta y el cobro son entidades distintas que pueden coincidir o no.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[var(--card-bg)] border border-[var(--purple-light)]/30 rounded-xl p-5">
            <p className="text-xs uppercase text-[var(--purple-light)] mb-2">🟪 Lead (venta)</p>
            <p className="text-sm text-[var(--muted)]">Se carga cuando el cliente firma. Tiene <code>ticket_total</code> y <code>programa_pitcheado</code>.</p>
            <p className="text-xs text-[var(--muted)] mt-3">Se ve en: <code>/llamadas</code>, <code>/comisiones</code></p>
          </div>
          <div className="bg-[var(--card-bg)] border border-[var(--green)]/30 rounded-xl p-5">
            <p className="text-xs uppercase text-[var(--green)] mb-2">🟩 Payment (cobro)</p>
            <p className="text-sm text-[var(--muted)]">Se carga cada vez que entra plata. Tiene <code>monto_usd</code>, <code>fecha_pago</code>, cuota #, método.</p>
            <p className="text-xs text-[var(--muted)] mt-3">Se ve en: <code>/finanzas</code>, <code>/comisiones</code></p>
          </div>
        </div>

        <div className="mt-6 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-5">
          <p className="text-sm font-semibold mb-2">Ejemplos:</p>
          <ul className="text-sm text-[var(--muted)] space-y-1.5 ml-4 list-disc">
            <li><b>Paid in full:</b> 1 venta + 1 pago el mismo día → todas las métricas reflejan</li>
            <li><b>3 cuotas:</b> 1 venta + 3 pagos en meses distintos → ventas un solo mes, cash en 3 meses</li>
            <li><b>Refund:</b> venta original + payment con estado=refund que no suma al cash</li>
          </ul>
        </div>
      </section>

      {/* PUNTO 4 */}
      <section className="slide">
        <Header n={4} title="Gastos: caja y categoría obligatorias y fixed" status="done" />
        <p className="text-[var(--muted)] mb-6">Antes eran texto libre y opcionales. Ahora son dropdowns fijos y obligatorios.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <BeforeAfter
            title="Antes ❌"
            color="red"
            items={["Categoría: input texto libre", "Caja: opcional, podía quedar vacía", "Sin validación", "Mismo gasto cargado distinto cada vez"]}
          />
          <BeforeAfter
            title="Ahora ✅"
            color="green"
            items={["Categoría: dropdown con 10 opciones fijas", "Caja: dropdown obligatorio", "Si falta cualquiera no guarda", "Categorías y cajas editables solo por admin"]}
          />
        </div>

        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-5">
          <p className="text-sm font-semibold mb-3">📊 Estado actual del mes ({ym}):</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Stat label="Gastos cargados" value={String(gastosStats.total)} />
            <Stat label="Con categoría real" value={`${gastosStats.conCategoria}/${gastosStats.total}`} />
            <Stat label="Con caja específica" value={`${gastosStats.conCaja}/${gastosStats.total}`} />
            <Stat label="Cargados en ARS" value={`${gastosStats.conARS}/${gastosStats.total}`} />
          </div>
        </div>
      </section>

      {/* PUNTO 5 */}
      <section className="slide">
        <Header n={5} title="USD/ARS por mes (no más rate atrasado)" status="done" />
        <p className="text-[var(--muted)] mb-6">Cada mes tiene su propio rate. Los gastos en ARS se convierten al rate del mes en que ocurrieron, no al rate de hoy.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <BeforeAfter
            title="Antes ❌"
            color="red"
            items={["Un solo rate global en settings", "Si lo actualizabas, los gastos viejos se recalculaban mal", "Gastos en ARS no se convertían a USD", "ARS no sumaban al total — gap en finanzas"]}
          />
          <BeforeAfter
            title="Ahora ✅"
            color="green"
            items={["Un rate por mes (usd_rate_history)", "El gasto guarda usd_rate_aplicado para auditoría", "ARS se convierten automáticamente al cargar", "Si no hay rate del mes → fallback al global"]}
          />
        </div>

        {rates.length > 0 ? (
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-5">
            <p className="text-sm font-semibold mb-3">📅 Rates cargados:</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {rates.map((r) => (
                <div key={r.mes} className="bg-[var(--background)] border border-[var(--card-border)] rounded p-2.5 text-center">
                  <p className="text-xs text-[var(--muted)] uppercase">{r.mes}</p>
                  <p className="text-base font-mono text-[var(--green)]">{Number(r.rate).toLocaleString("en-US")}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-[var(--red)]/10 border border-[var(--red)]/40 rounded-xl p-5">
            <p className="text-sm text-[var(--red)] font-semibold">⚠️ Sin rates cargados todavía</p>
            <p className="text-xs text-[var(--muted)] mt-1">Hay que cargar al menos el rate del mes actual desde <code>/finanzas</code> → sección USD/ARS por mes.</p>
          </div>
        )}
      </section>

      {/* CLOSING */}
      <section className="slide text-center py-12">
        <h2 className="text-3xl font-bold mb-6">🎯 Resumen</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-8">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="bg-[var(--green)]/10 border border-[var(--green)]/40 rounded-xl p-4">
              <p className="text-3xl font-bold text-[var(--green)]">✅</p>
              <p className="text-xs text-[var(--muted)] mt-2">Punto {n}</p>
            </div>
          ))}
        </div>
        <p className="text-[var(--muted)] max-w-2xl mx-auto">
          Todo lo pedido por Iñaki está implementado y funcionando con datos vivos. Acceso desde <code>/finanzas</code>.
        </p>
        <p className="text-xs text-[var(--muted)] mt-6">
          Próximo paso opcional: cargar los rates históricos de los meses anteriores y revisar gastos viejos con categoría=otros.
        </p>
      </section>
    </div>
  );
}

function Header({ n, title, status }: { n: number; title: string; status: "done" | "wip" }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="bg-[var(--purple)] text-white w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg">
        {n}
      </div>
      <h2 className="text-2xl font-bold flex-1">{title}</h2>
      <span className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded ${
        status === "done" ? "bg-[var(--green)]/20 text-[var(--green)]" : "bg-yellow-500/20 text-yellow-400"
      }`}>
        {status === "done" ? "✅ Listo" : "🔧 En progreso"}
      </span>
    </div>
  );
}

function BigMetric({ color, label, value, sub }: { color: "purple" | "green" | "blue"; label: string; value: string; sub: string }) {
  const colorMap = {
    purple: { text: "text-[var(--purple-light)]", border: "border-[var(--purple)]/40", bg: "bg-[var(--purple)]/5" },
    green: { text: "text-[var(--green)]", border: "border-[var(--green)]/40", bg: "bg-[var(--green)]/5" },
    blue: { text: "text-blue-400", border: "border-blue-400/40", bg: "bg-blue-400/5" },
  };
  const c = colorMap[color];
  return (
    <div className={`${c.bg} border ${c.border} rounded-xl p-6 text-center`}>
      <p className={`text-xs uppercase tracking-wide ${c.text} mb-2`}>{label}</p>
      <p className={`text-3xl font-bold ${c.text}`}>{value}</p>
      <p className="text-xs text-[var(--muted)] mt-2">{sub}</p>
    </div>
  );
}

function BeforeAfter({ title, color, items }: { title: string; color: "red" | "green"; items: string[] }) {
  const c = color === "red"
    ? { border: "border-[var(--red)]/40", bg: "bg-[var(--red)]/5", text: "text-[var(--red)]" }
    : { border: "border-[var(--green)]/40", bg: "bg-[var(--green)]/5", text: "text-[var(--green)]" };
  return (
    <div className={`${c.bg} border ${c.border} rounded-xl p-5`}>
      <p className={`text-sm font-bold ${c.text} mb-3`}>{title}</p>
      <ul className="text-sm text-[var(--muted)] space-y-1.5 ml-4 list-disc">
        {items.map((it, i) => (<li key={i}>{it}</li>))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--background)] border border-[var(--card-border)] rounded p-3 text-center">
      <p className="text-xs text-[var(--muted)] uppercase">{label}</p>
      <p className="text-xl font-bold text-white mt-1">{value}</p>
    </div>
  );
}
