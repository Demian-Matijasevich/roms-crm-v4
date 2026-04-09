import { fetchLeadById } from "@/lib/queries/leads";
import { createServerClient } from "@/lib/supabase-server";
import { getSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { PROGRAMS, LEAD_ESTADOS_LABELS } from "@/lib/constants";
import { getToday } from "@/lib/date-utils";
import { formatUSD, formatDate } from "@/lib/format";
import type { Payment } from "@/lib/types";
import EstadoCuentaLeadActions from "./EstadoCuentaLeadActions";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EstadoCuentaLeadPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const lead = await fetchLeadById(id);
  if (!lead) notFound();

  // Fetch all payments for this lead
  const supabase = createServerClient();
  const { data: paymentsData } = await supabase
    .from("payments")
    .select("*")
    .eq("lead_id", id)
    .order("numero_cuota", { ascending: true });

  const payments = (paymentsData ?? []) as Payment[];

  const totalPagado = payments
    .filter((p) => p.estado === "pagado")
    .reduce((sum, p) => sum + p.monto_usd, 0);

  const totalPendiente = payments
    .filter((p) => p.estado === "pendiente")
    .reduce((sum, p) => sum + p.monto_usd, 0);

  const totalPerdido = payments
    .filter((p) => p.estado === "perdido")
    .reduce((sum, p) => sum + p.monto_usd, 0);

  const saldoPendiente = lead.ticket_total - totalPagado;

  return (
    <div className="estado-cuenta-page min-h-screen bg-white text-black p-8 max-w-3xl mx-auto">
      <EstadoCuentaLeadActions leadId={lead.id} />

      {/* Header */}
      <div className="border-b-2 border-black pb-4 mb-6">
        <h1 className="text-2xl font-bold text-black">ROMS CRM — Estado de Cuenta (Lead)</h1>
        <p className="text-sm text-gray-500 mt-1">
          Generado el {getToday().toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Lead data */}
      <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500">Lead</p>
          <p className="font-semibold text-black text-lg">{lead.nombre}</p>
        </div>
        <div>
          <p className="text-gray-500">Estado</p>
          <p className="text-black">{LEAD_ESTADOS_LABELS[lead.estado] || lead.estado}</p>
        </div>
        <div>
          <p className="text-gray-500">Email</p>
          <p className="text-black">{lead.email || "---"}</p>
        </div>
        <div>
          <p className="text-gray-500">Telefono</p>
          <p className="text-black">{lead.telefono || "---"}</p>
        </div>
        <div>
          <p className="text-gray-500">Instagram</p>
          <p className="text-black">{lead.instagram ? `@${lead.instagram.replace(/^@/, "")}` : "---"}</p>
        </div>
        <div>
          <p className="text-gray-500">Programa pitcheado</p>
          <p className="text-black">{lead.programa_pitcheado ? PROGRAMS[lead.programa_pitcheado]?.label ?? lead.programa_pitcheado : "---"}</p>
        </div>
        <div>
          <p className="text-gray-500">Ticket total</p>
          <p className="font-semibold text-black">{formatUSD(lead.ticket_total)}</p>
        </div>
        <div>
          <p className="text-gray-500">Plan de pago</p>
          <p className="text-black">{lead.plan_pago?.replace(/_/g, " ") || "---"}</p>
        </div>
        <div>
          <p className="text-gray-500">Closer</p>
          <p className="text-black">{lead.closer?.nombre || "---"}</p>
        </div>
        <div>
          <p className="text-gray-500">Setter</p>
          <p className="text-black">{lead.setter?.nombre || "---"}</p>
        </div>
      </div>

      {/* Contexto setter */}
      {lead.contexto_setter && (
        <div className="mb-6 border border-gray-200 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 mb-1">Contexto setter</p>
          <p className="text-sm text-black leading-relaxed">{lead.contexto_setter}</p>
        </div>
      )}

      {/* Reporte general */}
      {lead.reporte_general && (
        <div className="mb-6 border border-gray-200 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 mb-1">Reporte general</p>
          <p className="text-sm text-black leading-relaxed">{lead.reporte_general}</p>
        </div>
      )}

      {/* Payments table */}
      <h2 className="text-lg font-bold text-black mb-3 border-b border-gray-300 pb-2">Historial de Pagos</h2>
      <table className="w-full text-sm mb-6 border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="text-left px-3 py-2 border border-gray-300 font-medium">#</th>
            <th className="text-left px-3 py-2 border border-gray-300 font-medium">Monto USD</th>
            <th className="text-left px-3 py-2 border border-gray-300 font-medium">Estado</th>
            <th className="text-left px-3 py-2 border border-gray-300 font-medium">Fecha Pago</th>
            <th className="text-left px-3 py-2 border border-gray-300 font-medium">Vencimiento</th>
            <th className="text-left px-3 py-2 border border-gray-300 font-medium">Receptor</th>
          </tr>
        </thead>
        <tbody>
          {payments.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center py-4 text-gray-500 border border-gray-300">
                Sin pagos registrados
              </td>
            </tr>
          ) : (
            payments.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2 border border-gray-300">
                  #{p.numero_cuota}
                </td>
                <td className="px-3 py-2 border border-gray-300 font-medium">{formatUSD(p.monto_usd)}</td>
                <td className={`px-3 py-2 border border-gray-300 font-medium ${
                  p.estado === "pagado" ? "text-green-700" :
                  p.estado === "pendiente" ? "text-yellow-700" :
                  p.estado === "perdido" ? "text-red-700" : ""
                }`}>
                  {p.estado.charAt(0).toUpperCase() + p.estado.slice(1)}
                </td>
                <td className="px-3 py-2 border border-gray-300">{formatDate(p.fecha_pago)}</td>
                <td className="px-3 py-2 border border-gray-300">{formatDate(p.fecha_vencimiento)}</td>
                <td className="px-3 py-2 border border-gray-300">{p.receptor ?? "---"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Summary */}
      <div className="border-t-2 border-black pt-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Total Pagado</span>
          <span className="font-bold text-green-700">{formatUSD(totalPagado)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Cuotas Pendientes</span>
          <span className="font-bold text-yellow-700">{formatUSD(totalPendiente)}</span>
        </div>
        {totalPerdido > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">Perdido / Refund</span>
            <span className="font-bold text-red-700">{formatUSD(totalPerdido)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-gray-300 pt-2 mt-2">
          <span className="text-gray-800 font-semibold">Saldo Pendiente (Ticket - Pagado)</span>
          <span className={`font-bold ${saldoPendiente > 0 ? "text-red-700" : "text-green-700"}`}>
            {formatUSD(saldoPendiente)}
          </span>
        </div>
      </div>
    </div>
  );
}
