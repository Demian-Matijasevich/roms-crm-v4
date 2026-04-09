"use client";

import { useState } from "react";
import type { AuthSession } from "@/lib/types";

interface Props {
  session: AuthSession;
}

const inputClass =
  "w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-3 py-2.5 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--purple)] placeholder:text-[var(--muted)]";
const labelClass = "text-sm text-[var(--muted)] block mb-1";

const ORIGENES = [
  "Historias", "DM directo", "Lead magnet", "YouTube",
  "Comentarios", "Reels", "Encuesta", "WhatsApp", "Otro",
];

function todayISO(): string {
  return new Date().toISOString().split("T")[0];
}

export default function ReporteSetterForm({ session }: Props) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Form fields
  const [fecha, setFecha] = useState(todayISO());
  const [conversacionesIniciadas, setConversacionesIniciadas] = useState("");
  const [respuestasHistorias, setRespuestasHistorias] = useState("");
  const [calendariosEnviados, setCalendariosEnviados] = useState("");
  const [ventasPorChat, setVentasPorChat] = useState("");
  const [agendasConfirmadas, setAgendasConfirmadas] = useState("");
  const [origenPrincipal, setOrigenPrincipal] = useState<string[]>([]);

  function toggleOrigen(origen: string) {
    setOrigenPrincipal((prev) =>
      prev.includes(origen) ? prev.filter((o) => o !== origen) : [...prev, origen]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const conv = parseInt(conversacionesIniciadas, 10);
    const resp = parseInt(respuestasHistorias, 10);
    const cal = parseInt(calendariosEnviados, 10);

    if (isNaN(conv) || conv < 0 || isNaN(resp) || resp < 0 || isNaN(cal) || cal < 0) {
      setError("Ingresa numeros validos (>= 0) en los campos numericos.");
      return;
    }

    setLoading(true);

    const body = {
      setter_id: session.team_member_id,
      fecha,
      conversaciones_iniciadas: conv,
      respuestas_historias: resp,
      calendarios_enviados: cal,
      ventas_por_chat: ventasPorChat.trim() || undefined,
      agendas_confirmadas: agendasConfirmadas.trim() || undefined,
      origen_principal: origenPrincipal,
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
    setConversacionesIniciadas("");
    setRespuestasHistorias("");
    setCalendariosEnviados("");
    setVentasPorChat("");
    setAgendasConfirmadas("");
    setOrigenPrincipal([]);
    setError("");
    setSubmitted(false);
  }

  // ── Success state ──
  if (submitted) {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-10 text-center flex flex-col items-center gap-4 max-w-md mx-auto">
        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-[var(--foreground)]">Reporte enviado</h3>
        <p className="text-sm text-[var(--muted)]">Tus datos se guardaron en Supabase.</p>
        <button
          onClick={reset}
          className="mt-2 bg-[var(--purple)] hover:bg-[var(--purple-dark)] text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          Crear otro reporte
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <form onSubmit={handleSubmit} className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <div className="mb-5 pb-4 border-b border-[var(--card-border)]">
          <p className="text-sm font-semibold">Reporte Diario</p>
          <p className="text-xs text-[var(--muted)]">{session.nombre}</p>
        </div>

        {/* Fecha */}
        <div className="mb-4">
          <label className={labelClass}>Fecha *</label>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required className={inputClass} />
        </div>

        {/* Conversaciones iniciadas */}
        <div className="mb-4">
          <label className={labelClass}>Conversaciones iniciadas *</label>
          <input
            type="number"
            min={0}
            value={conversacionesIniciadas}
            onChange={(e) => setConversacionesIniciadas(e.target.value)}
            placeholder="0"
            className={`${inputClass} text-center text-lg`}
            required
          />
        </div>

        {/* Respuestas a historias */}
        <div className="mb-4">
          <label className={labelClass}>Respuestas a historias *</label>
          <input
            type="number"
            min={0}
            value={respuestasHistorias}
            onChange={(e) => setRespuestasHistorias(e.target.value)}
            placeholder="0"
            className={`${inputClass} text-center text-lg`}
            required
          />
        </div>

        {/* Calendarios enviados */}
        <div className="mb-4">
          <label className={labelClass}>Calendarios enviados *</label>
          <input
            type="number"
            min={0}
            value={calendariosEnviados}
            onChange={(e) => setCalendariosEnviados(e.target.value)}
            placeholder="0"
            className={`${inputClass} text-center text-lg`}
            required
          />
        </div>

        {/* Ventas por chat */}
        <div className="mb-4">
          <label className={labelClass}>Ventas por chat (nombres)</label>
          <textarea
            value={ventasPorChat}
            onChange={(e) => setVentasPorChat(e.target.value)}
            placeholder="Nombre 1, Nombre 2..."
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* Agendas confirmadas */}
        <div className="mb-4">
          <label className={labelClass}>Agendas confirmadas (nombres)</label>
          <textarea
            value={agendasConfirmadas}
            onChange={(e) => setAgendasConfirmadas(e.target.value)}
            placeholder="Nombre 1, Nombre 2..."
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* Origen principal */}
        <div className="mb-6">
          <label className={labelClass}>Origen principal de los leads</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {ORIGENES.map((o) => (
              <button
                type="button"
                key={o}
                onClick={() => toggleOrigen(o)}
                className={`text-xs py-1.5 px-3 rounded-lg border transition-colors ${
                  origenPrincipal.includes(o)
                    ? "bg-[var(--purple)]/10 border-[var(--purple)] text-purple-300"
                    : "border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--muted)]"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
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
