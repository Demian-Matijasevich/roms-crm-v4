"use client";

import { useState } from "react";
import { useToast } from "@/app/components/Toast";

interface RefundInput {
  lead_name: string;
  monto_usd: string;
  fecha: string;
  motivo: string;
  numero_cuota: string;
  descuento_closer: string;
  descuento_setter: string;
}

const empty: RefundInput = {
  lead_name: "",
  monto_usd: "",
  fecha: "",
  motivo: "",
  numero_cuota: "1",
  descuento_closer: "",
  descuento_setter: "",
};

export default function RefundsImportClient() {
  const toast = useToast();
  const [rows, setRows] = useState<RefundInput[]>([{ ...empty }]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown[] | null>(null);

  function update(i: number, field: keyof RefundInput, val: string) {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }
  function addRow() { setRows((prev) => [...prev, { ...empty }]); }
  function removeRow(i: number) { setRows((prev) => prev.filter((_, idx) => idx !== i)); }

  async function ejecutar() {
    const refunds = rows
      .filter((r) => r.lead_name.trim() && Number(r.monto_usd) > 0 && r.fecha)
      .map((r) => ({
        lead_name: r.lead_name.trim(),
        monto_usd: Number(r.monto_usd),
        fecha: r.fecha,
        motivo: r.motivo.trim() || undefined,
        numero_cuota: Number(r.numero_cuota) || 1,
        descuento_comision_closer_usd: Number(r.descuento_closer) || 0,
        descuento_comision_setter_usd: Number(r.descuento_setter) || 0,
      }));

    if (refunds.length === 0) {
      toast.error("Completá al menos 1 refund con nombre, monto y fecha");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/refund-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refunds }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data.report);
        toast.success(`${data.summary.ok} refunds creados · ${data.summary.not_found} no encontrados · ${data.summary.ambiguous} ambiguos`);
      } else {
        toast.error("Error al importar");
      }
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "w-full bg-[var(--background)] border border-[var(--card-border)] rounded px-2 py-1.5 text-sm text-white";

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">↩ Importar refunds históricos</h1>
        <p className="text-sm text-[var(--muted)]">
          Cargá los refunds que se hicieron por fuera del CRM. Cada refund pisa la comisión del closer/setter
          según los descuentos que pongas. Si dejás los descuentos en 0, no se descuenta nada.
        </p>
      </div>

      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase text-[var(--muted)] border-b border-[var(--card-border)]">
              <th className="px-2 py-2">Lead (nombre, busca fuzzy)</th>
              <th className="px-2 py-2 w-24">Monto USD</th>
              <th className="px-2 py-2 w-32">Fecha</th>
              <th className="px-2 py-2 w-16">Cuota#</th>
              <th className="px-2 py-2">Motivo</th>
              <th className="px-2 py-2 w-24">Desc. Closer</th>
              <th className="px-2 py-2 w-24">Desc. Setter</th>
              <th className="px-2 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-[var(--card-border)]/30">
                <td className="px-2 py-1.5"><input value={r.lead_name} onChange={(e) => update(i, "lead_name", e.target.value)} className={inputCls} placeholder="Juan Pérez" /></td>
                <td className="px-2 py-1.5"><input type="number" value={r.monto_usd} onChange={(e) => update(i, "monto_usd", e.target.value)} className={inputCls} placeholder="1000" /></td>
                <td className="px-2 py-1.5"><input type="date" value={r.fecha} onChange={(e) => update(i, "fecha", e.target.value)} className={inputCls} /></td>
                <td className="px-2 py-1.5"><input type="number" value={r.numero_cuota} onChange={(e) => update(i, "numero_cuota", e.target.value)} className={inputCls} /></td>
                <td className="px-2 py-1.5"><input value={r.motivo} onChange={(e) => update(i, "motivo", e.target.value)} className={inputCls} placeholder="chargeback / arrepentido" /></td>
                <td className="px-2 py-1.5"><input type="number" value={r.descuento_closer} onChange={(e) => update(i, "descuento_closer", e.target.value)} className={inputCls} placeholder={r.monto_usd ? String(Math.round(Number(r.monto_usd) * 0.07)) : "0"} /></td>
                <td className="px-2 py-1.5"><input type="number" value={r.descuento_setter} onChange={(e) => update(i, "descuento_setter", e.target.value)} className={inputCls} placeholder={r.monto_usd ? String(Math.round(Number(r.monto_usd) * 0.03)) : "0"} /></td>
                <td className="px-2 py-1.5">
                  <button onClick={() => removeRow(i)} className="text-[var(--red)] text-xs">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex gap-2">
          <button onClick={addRow} className="text-xs px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded">+ Otra fila</button>
          <button onClick={ejecutar} disabled={busy} className="text-xs px-4 py-1.5 bg-[var(--purple)] text-white rounded disabled:opacity-50">
            {busy ? "Importando..." : "↩ Crear refunds"}
          </button>
        </div>
        <p className="text-[10px] text-[var(--muted)] mt-3">
          💡 Los descuentos se sugieren auto: Closer = 7% del monto (programa Consult / Omni), Setter = 3%.
          Si el cliente fue Multicuentas, cambiá Closer a 5%.
        </p>
      </div>

      {result && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
          <h2 className="text-sm font-semibold text-white mb-3">Resultado</h2>
          <div className="space-y-1 text-xs font-mono">
            {(result as Array<{ lead_name: string; status: string; error?: string }>).map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={
                  r.status === "ok" ? "text-green-300" :
                  r.status === "not_found" ? "text-red-300" :
                  r.status === "ambiguous" ? "text-amber-300" :
                  "text-[var(--red)]"
                }>
                  {r.status === "ok" ? "✓" : r.status === "not_found" ? "✗ 0 matches" : r.status === "ambiguous" ? "⚠ varios matches" : "ERR"}
                </span>
                <span className="text-white">{r.lead_name}</span>
                {r.error && <span className="text-[var(--muted)]">— {r.error}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
