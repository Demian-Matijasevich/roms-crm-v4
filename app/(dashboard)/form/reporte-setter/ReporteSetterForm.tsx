"use client";

import { useState } from "react";
import type { AuthSession } from "@/lib/types";

interface Props {
  session: AuthSession;
}

const inputClass =
  "w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)] placeholder:text-[var(--muted)]";
const labelClass = "text-sm text-[var(--muted)] block mb-1";

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export default function ReporteSetterForm({ session }: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 4 campos EOD simplificado
  const [fecha, setFecha] = useState(todayISO());
  const [conversaciones, setConversaciones] = useState("");
  const [agendasEnviadas, setAgendasEnviadas] = useState("");
  const [agendadas, setAgendadas] = useState("");
  const [aclaracion, setAclaracion] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const conv = parseInt(conversaciones, 10);
    const env = parseInt(agendasEnviadas, 10);
    const ag = parseInt(agendadas, 10);

    if (isNaN(conv) || conv < 0 || isNaN(env) || env < 0 || isNaN(ag) || ag < 0) {
      setError("Ingresa números válidos (>= 0).");
      return;
    }

    setLoading(true);

    // Mantenemos compat con schema viejo:
    // conversaciones → conversaciones_iniciadas
    // agendasEnviadas → calendarios_enviados
    // agendadas → agendas (numérico Secure Scale)
    const body = {
      setter_id: session.team_member_id,
      fecha,
      conversaciones_iniciadas: conv,
      respuestas_historias: 0,
      calendarios_enviados: env,
      origen_principal: [],
      fups: 0,
      agendas: ag,
      agendas_calificadas: 0,
      aclaracion: aclaracion.trim() || undefined,
    };

    try {
      const res = await fetch("/api/reporte-setter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al guardar");
      }

      setSubmitted(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setFecha(todayISO());
    setConversaciones("");
    setAgendasEnviadas("");
    setAgendadas("");
    setAclaracion("");
    setError("");
    setSubmitted(false);
  }

  if (submitted) {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-10 text-center flex flex-col items-center gap-4 max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-[var(--foreground)]">Reporte enviado</h3>
        <p className="text-sm text-[var(--muted)]">Cierre EOD listo.</p>
        <button
          onClick={reset}
          className="mt-2 bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          Cargar otro día
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <form onSubmit={handleSubmit} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <div className="mb-5 pb-4 border-b border-[var(--card-border)]">
          <p className="text-sm font-semibold">Reporte EOD — Setter</p>
          <p className="text-xs text-[var(--muted)]">{session.nombre}</p>
        </div>

        <div className="mb-4">
          <label className={labelClass}>Fecha *</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
            className={inputClass}
          />
        </div>

        <div className="mb-4">
          <label className={labelClass}>Conversaciones del día *</label>
          <input
            type="number"
            min={0}
            value={conversaciones}
            onChange={(e) => setConversaciones(e.target.value)}
            placeholder="0"
            className={`${inputClass} text-center text-lg`}
            required
            inputMode="numeric"
          />
          <p className="text-[10px] text-[var(--muted)] mt-1">Total de chats que iniciaste o respondiste hoy.</p>
        </div>

        <div className="mb-4">
          <label className={labelClass}>Agendas enviadas *</label>
          <input
            type="number"
            min={0}
            value={agendasEnviadas}
            onChange={(e) => setAgendasEnviadas(e.target.value)}
            placeholder="0"
            className={`${inputClass} text-center text-lg`}
            required
            inputMode="numeric"
          />
          <p className="text-[10px] text-[var(--muted)] mt-1">Cuántos links de calendario mandaste.</p>
        </div>

        <div className="mb-4">
          <label className={labelClass}>Agendadas *</label>
          <input
            type="number"
            min={0}
            value={agendadas}
            onChange={(e) => setAgendadas(e.target.value)}
            placeholder="0"
            className={`${inputClass} text-center text-lg`}
            required
            inputMode="numeric"
          />
          <p className="text-[10px] text-[var(--muted)] mt-1">De las enviadas, cuántas quedaron en el calendario.</p>
        </div>

        <div className="mb-6">
          <label className={labelClass}>Aclaración</label>
          <textarea
            value={aclaracion}
            onChange={(e) => setAclaracion(e.target.value)}
            placeholder="Algo a destacar del día — objeción común, lead caliente, problema..."
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </div>

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="bg-[var(--purple)] hover:bg-[var(--purple-dark)] disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium w-full transition-colors"
        >
          {loading ? "Enviando..." : "Enviar reporte"}
        </button>
      </form>
    </div>
  );
}
