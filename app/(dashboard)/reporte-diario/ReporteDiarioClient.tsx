"use client";

import { useState } from "react";

function todayISO() { return new Date().toISOString().split("T")[0]; }

export default function ReporteDiarioClient() {
  const [fecha, setFecha] = useState(todayISO());
  const [report, setReport] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setReport("");
    const res = await fetch(`/api/reports/daily?fecha=${fecha}`);
    const json = await res.json();
    setReport(json.text || json.error || "Sin datos");
    setLoading(false);
  }

  async function copy() {
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Reporte Diario</h1>
        <p className="text-sm text-[var(--muted)]">Generá un resumen en texto de lo que pasó en el día — listo para pegar en WhatsApp/Slack.</p>
      </div>

      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 space-y-4">
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-sm text-[var(--muted)] block mb-1">Fecha</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm" />
          </div>
          <button onClick={generate} disabled={loading}
            className="bg-[var(--purple)] hover:bg-[var(--purple-dark)] disabled:opacity-50 text-white px-6 py-2 rounded-lg text-sm font-medium">
            {loading ? "Generando..." : "Generar"}
          </button>
        </div>
      </div>

      {report && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-white">Reporte {fecha}</h3>
            <button onClick={copy} className="text-sm text-[var(--purple-light)] hover:underline">
              {copied ? "✓ Copiado" : "Copiar"}
            </button>
          </div>
          <pre className="whitespace-pre-wrap text-sm text-white font-mono bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-4">{report}</pre>
        </div>
      )}
    </div>
  );
}
