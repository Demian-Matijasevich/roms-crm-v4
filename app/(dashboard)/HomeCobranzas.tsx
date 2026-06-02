"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/components/Toast";
import { formatMoney } from "@/lib/format";

interface CuotaPendiente {
  id: string;
  lead_id: string | null;
  monto_usd: number;
  fecha_vencimiento: string | null;
  numero_cuota: number;
  snoozed_until: string | null;
  snooze_count: number;
  lead_nombre: string;
  lead_telefono: string | null;
}

interface PagoMes {
  id: string;
  monto_usd: number;
  fecha_pago: string;
  cliente: string;
  metodo_pago: string | null;
}

interface Props {
  nombre: string;
  cuotasHoy: CuotaPendiente[];
  cuotasSemana: CuotaPendiente[];
  cuotasAtrasadas: CuotaPendiente[];
  pagadasHoy: PagoMes[];
  pagadasMes: PagoMes[];
  cashHoy: number;
  cashSemana: number;
  cashMes: number;
  usdRate: number;
  todayStr: string;
}

export default function HomeCobranzas({
  nombre,
  cuotasHoy,
  cuotasSemana,
  cuotasAtrasadas,
  pagadasHoy,
  pagadasMes,
  cashHoy,
  cashSemana,
  cashMes,
  usdRate,
  todayStr,
}: Props) {
  const toast = useToast();
  const router = useRouter();
  const fmt = (n: number) => formatMoney(n, 0, usdRate);

  function copyWA(c: CuotaPendiente) {
    const venc = c.fecha_vencimiento
      ? new Date(c.fecha_vencimiento + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "long" })
      : "—";
    const first = c.lead_nombre.split(" ")[0];
    const txt = `Hola ${first}, te escribo desde ROMS. Te quería avisar que tenés una cuota de ${fmt(c.monto_usd)} con vencimiento ${venc}. ¿Cómo va con eso? Cualquier cosa me avisás 🙌`;
    navigator.clipboard.writeText(txt).then(
      () => toast.success("Mensaje copiado"),
      () => toast.error("No se pudo copiar")
    );
  }

  const atrasadasTotal = useMemo(() => cuotasAtrasadas.reduce((s, c) => s + c.monto_usd, 0), [cuotasAtrasadas]);
  const hoyTotal = useMemo(() => cuotasHoy.reduce((s, c) => s + c.monto_usd, 0), [cuotasHoy]);
  const semanaTotal = useMemo(() => cuotasSemana.reduce((s, c) => s + c.monto_usd, 0), [cuotasSemana]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">💰 Cobranzas — {nombre}</h1>
        <p className="text-sm text-[var(--muted)]">Tu jornada de cobranzas: lo que cobrás hoy, esta semana y los morosos.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KPI label="✅ Cobrado HOY" value={fmt(cashHoy)} hint={`${pagadasHoy.length} cuotas`} color="green" />
        <KPI label="📅 Cobrado esta semana" value={fmt(cashSemana)} hint={`período hasta ${todayStr}`} color="blue" />
        <KPI label="📆 Cobrado este mes" value={fmt(cashMes)} hint={`${pagadasMes.length} cuotas pagadas`} color="purple" />
      </div>

      {/* Atrasadas */}
      <Section
        title="🔴 Cuotas atrasadas"
        count={cuotasAtrasadas.length}
        total={atrasadasTotal}
        fmt={fmt}
        emptyText="✅ Sin cuotas atrasadas"
        accent="red"
      >
        {cuotasAtrasadas.slice(0, 20).map((c) => (
          <CuotaRow key={c.id} c={c} todayStr={todayStr} onCopyWA={copyWA} fmt={fmt} />
        ))}
        {cuotasAtrasadas.length > 20 && (
          <Link href="/cobranzas" className="block text-xs text-[var(--purple-light)] mt-2 px-3 py-1.5 hover:bg-white/5 rounded">
            Ver todas en /cobranzas →
          </Link>
        )}
      </Section>

      {/* HOY */}
      <Section
        title="🎯 Vencen HOY"
        count={cuotasHoy.length}
        total={hoyTotal}
        fmt={fmt}
        emptyText="Sin cuotas para hoy"
        accent="amber"
      >
        {cuotasHoy.map((c) => (
          <CuotaRow key={c.id} c={c} todayStr={todayStr} onCopyWA={copyWA} fmt={fmt} />
        ))}
      </Section>

      {/* Esta semana */}
      <Section
        title="📅 Esta semana"
        count={cuotasSemana.length}
        total={semanaTotal}
        fmt={fmt}
        emptyText="Sin cuotas esta semana"
        accent="purple"
      >
        {cuotasSemana.slice(0, 15).map((c) => (
          <CuotaRow key={c.id} c={c} todayStr={todayStr} onCopyWA={copyWA} fmt={fmt} />
        ))}
      </Section>

      {/* Pagadas hoy */}
      {pagadasHoy.length > 0 && (
        <div className="bg-[var(--card-bg)] border border-green-500/30 rounded-xl p-4">
          <h2 className="text-base font-semibold text-white mb-3">✅ Ya cobré hoy</h2>
          <div className="space-y-1">
            {pagadasHoy.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-white">{p.cliente}</span>
                <span className="text-green-300 font-medium">{fmt(p.monto_usd)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="text-center">
        <Link
          href="/cobranzas"
          className="inline-block text-sm bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-5 py-2 rounded-lg font-medium"
        >
          Ir a la vista completa de cobranzas →
        </Link>
      </div>
    </div>
  );
}

function KPI({ label, value, hint, color }: { label: string; value: string; hint: string; color: "green" | "blue" | "purple" }) {
  const cl = color === "green" ? "text-green-300" : color === "blue" ? "text-blue-300" : "text-[var(--purple-light)]";
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
      <p className="text-[10px] uppercase text-[var(--muted)] font-semibold">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${cl}`} style={{ fontVariantNumeric: "tabular-nums" }}>{value}</p>
      <p className="text-[10px] text-[var(--muted)] mt-0.5">{hint}</p>
    </div>
  );
}

function Section({ title, count, total, fmt, emptyText, accent, children }: {
  title: string;
  count: number;
  total: number;
  fmt: (n: number) => string;
  emptyText: string;
  accent: "red" | "amber" | "purple";
  children: React.ReactNode;
}) {
  const border = accent === "red" ? "border-red-500/30" : accent === "amber" ? "border-amber-500/30" : "border-[var(--card-border)]";
  return (
    <div className={`bg-[var(--card-bg)] border ${border} rounded-xl overflow-hidden`}>
      <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <span className="text-sm text-[var(--muted)]">
          {count} cuotas · <b className="text-white">{fmt(total)}</b>
        </span>
      </div>
      {count === 0 ? (
        <p className="text-sm text-[var(--muted)] py-6 text-center">{emptyText}</p>
      ) : (
        <div className="divide-y divide-[var(--card-border)]/40">{children}</div>
      )}
    </div>
  );
}

function CuotaRow({ c, todayStr, onCopyWA, fmt }: { c: CuotaPendiente; todayStr: string; onCopyWA: (c: CuotaPendiente) => void; fmt: (n: number) => string }) {
  const dias = c.fecha_vencimiento
    ? Math.floor((new Date(todayStr).getTime() - new Date(c.fecha_vencimiento).getTime()) / 86400000)
    : 0;
  return (
    <div className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-white/5">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Link
          href={c.lead_id ? `/llamadas/${c.lead_id}/estado-cuenta` : "/cobranzas"}
          className="text-white font-medium hover:text-[var(--purple-light)] truncate"
        >
          {c.lead_nombre}
        </Link>
        <span className="text-[10px] text-[var(--muted)] flex-shrink-0">c#{c.numero_cuota}</span>
        {dias > 0 && <span className="text-[10px] text-[var(--red)] flex-shrink-0">{dias}d vencida</span>}
        {c.snooze_count > 0 && <span className="text-[10px] text-amber-300 flex-shrink-0">⏰ {c.snooze_count}x</span>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-white font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(c.monto_usd)}</span>
        <button
          onClick={() => onCopyWA(c)}
          className="text-[11px] px-2 py-1 rounded bg-green-500/20 hover:bg-green-500/30 text-green-300"
          title="Copiar mensaje WhatsApp"
        >
          📋 WA
        </button>
      </div>
    </div>
  );
}
