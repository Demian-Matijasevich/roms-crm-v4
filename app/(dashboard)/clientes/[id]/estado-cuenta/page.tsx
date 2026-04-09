import { fetchClientById } from "@/lib/queries/clients";
import { getSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { PROGRAMS } from "@/lib/constants";
import { formatUSD, formatDate } from "@/lib/format";
import { getToday } from "@/lib/date-utils";
import EstadoCuentaActions from "./EstadoCuentaActions";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EstadoCuentaPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const client = await fetchClientById(id);
  if (!client) notFound();

  const totalPagado = client.payments
    .filter((p) => p.estado === "pagado")
    .reduce((sum, p) => sum + p.monto_usd, 0);

  const totalPendiente = client.payments
    .filter((p) => p.estado === "pendiente")
    .reduce((sum, p) => sum + p.monto_usd, 0);

  const totalPerdido = client.payments
    .filter((p) => p.estado === "perdido")
    .reduce((sum, p) => sum + p.monto_usd, 0);

  return (
    <div className="estado-cuenta-page min-h-screen bg-white text-black p-8 max-w-3xl mx-auto">
      {/* Print button - hidden in print */}
      <EstadoCuentaActions clientId={client.id} />

      {/* Header */}
      <div className="border-b-2 border-black pb-4 mb-6">
        <h1 className="text-2xl font-bold text-black">ROMS CRM — Estado de Cuenta</h1>
        <p className="text-sm text-gray-500 mt-1">
          Generado el {getToday().toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Client data */}
      <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500">Cliente</p>
          <p className="font-semibold text-black text-lg">{client.nombre}</p>
        </div>
        <div>
          <p className="text-gray-500">Programa</p>
          <p className="font-semibold text-black">{client.programa ? PROGRAMS[client.programa]?.label ?? client.programa : "---"}</p>
        </div>
        <div>
          <p className="text-gray-500">Email</p>
          <p className="text-black">{client.email || "---"}</p>
        </div>
        <div>
          <p className="text-gray-500">Telefono</p>
          <p className="text-black">{client.telefono || "---"}</p>
        </div>
        <div>
          <p className="text-gray-500">Estado</p>
          <p className="text-black capitalize">{client.estado.replace(/_/g, " ")}</p>
        </div>
        <div>
          <p className="text-gray-500">Onboarding</p>
          <p className="text-black">{formatDate(client.fecha_onboarding)}</p>
        </div>
      </div>

      {/* Payments table */}
      <h2 className="text-lg font-bold text-black mb-3 border-b border-gray-300 pb-2">Historial de Pagos</h2>
      <table className="w-full text-sm mb-6 border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="text-left px-3 py-2 border border-gray-300 font-medium">#</th>
            <th className="text-left px-3 py-2 border border-gray-300 font-medium">Monto USD</th>
            <th className="text-left px-3 py-2 border border-gray-300 font-medium">Fecha Pago</th>
            <th className="text-left px-3 py-2 border border-gray-300 font-medium">Vencimiento</th>
            <th className="text-left px-3 py-2 border border-gray-300 font-medium">Estado</th>
            <th className="text-left px-3 py-2 border border-gray-300 font-medium">Metodo</th>
          </tr>
        </thead>
        <tbody>
          {client.payments.length === 0 ? (
            <tr>
              <td colSpan={6} className="text-center py-4 text-gray-500 border border-gray-300">
                Sin pagos registrados
              </td>
            </tr>
          ) : (
            client.payments.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2 border border-gray-300">
                  #{p.numero_cuota} {p.es_renovacion ? "(Renovacion)" : ""}
                </td>
                <td className="px-3 py-2 border border-gray-300 font-medium">{formatUSD(p.monto_usd)}</td>
                <td className="px-3 py-2 border border-gray-300">{formatDate(p.fecha_pago)}</td>
                <td className="px-3 py-2 border border-gray-300">{formatDate(p.fecha_vencimiento)}</td>
                <td className={`px-3 py-2 border border-gray-300 font-medium ${
                  p.estado === "pagado" ? "text-green-700" :
                  p.estado === "pendiente" ? "text-yellow-700" :
                  p.estado === "perdido" ? "text-red-700" : ""
                }`}>
                  {p.estado.charAt(0).toUpperCase() + p.estado.slice(1)}
                </td>
                <td className="px-3 py-2 border border-gray-300">{p.metodo_pago ?? "---"}</td>
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
          <span className="text-gray-600">Saldo Pendiente</span>
          <span className="font-bold text-yellow-700">{formatUSD(totalPendiente)}</span>
        </div>
        {totalPerdido > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">Perdido / Refund</span>
            <span className="font-bold text-red-700">{formatUSD(totalPerdido)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
