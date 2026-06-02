"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/app/components/Toast";

interface Lead {
  id: string;
  nombre: string;
  programa_pitcheado: string | null;
  ticket_total: number;
  estado: string;
  fecha_llamada: string | null;
  closer_nombre: string | null;
}

const PROGRAMAS = [
  { value: "omnipresencia", label: "Omnipresencia" },
  { value: "multicuentas", label: "Multicuentas" },
  { value: "consultoria", label: "Consultoría" },
  { value: "roms_7", label: "ROMS 7" },
];

// Sugerencia automática por ticket
function sugerirPrograma(ticket: number): string | null {
  if (ticket >= 30000) return "multicuentas";
  if (ticket >= 18000) return "omnipresencia";
  if (ticket >= 5000) return "omnipresencia";
  if (ticket >= 1000) return "consultoria";
  return null;
}

export default function LeadsSinProgramaClient({ leads: initial }: { leads: Lead[] }) {
  const toast = useToast();
  const router = useRouter();
  const [leads, setLeads] = useState(initial);
  const [updating, setUpdating] = useState<Set<string>>(new Set());

  async function setPrograma(leadId: string, programa: string) {
    setUpdating((p) => new Set(p).add(leadId));
    try {
      const res = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: leadId, programa_pitcheado: programa }),
      });
      if (res.ok) {
        toast.success("Programa asignado");
        setLeads((prev) => prev.filter((l) => l.id !== leadId));
      } else {
        toast.error("Error al asignar");
      }
    } finally {
      setUpdating((p) => { const n = new Set(p); n.delete(leadId); return n; });
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">⚠️ Leads sin programa cargado</h1>
        <p className="text-sm text-[var(--muted)]">
          Estos leads están cerrados/reservados pero no tienen <code>programa_pitcheado</code>.
          Eso rompe el cálculo de comisiones (caen en &quot;Otros&quot;). Asigná el programa correcto.
        </p>
      </div>

      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4">
        <p className="text-sm text-white mb-3">
          <span className="text-amber-300 font-semibold">{leads.length}</span> leads pendientes
        </p>

        {leads.length === 0 ? (
          <p className="text-sm text-[var(--muted)] py-8 text-center">✨ Todos los leads tienen programa cargado</p>
        ) : (
          <div className="space-y-2">
            {leads.map((l) => {
              const isUpdating = updating.has(l.id);
              const sugerido = sugerirPrograma(l.ticket_total);
              return (
                <div key={l.id} className="bg-white/5 border border-[var(--card-border)] rounded-lg p-3">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Link
                        href={`/llamadas/${l.id}/estado-cuenta`}
                        className="text-white font-medium hover:text-[var(--purple-light)]"
                      >
                        {l.nombre}
                      </Link>
                      <span className="text-xs text-[var(--muted)]">
                        {l.estado} · ${l.ticket_total.toLocaleString()} · {l.closer_nombre || "sin closer"}
                      </span>
                    </div>
                    {sugerido && (
                      <span className="text-[10px] text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded">
                        Sugerido: {PROGRAMAS.find((p) => p.value === sugerido)?.label}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {PROGRAMAS.map((p) => (
                      <button
                        key={p.value}
                        onClick={() => setPrograma(l.id, p.value)}
                        disabled={isUpdating}
                        className={`text-xs px-3 py-1.5 rounded border transition-colors disabled:opacity-50 ${
                          sugerido === p.value
                            ? "bg-amber-500/20 border-amber-500/50 text-amber-200"
                            : "bg-white/5 border-[var(--card-border)] hover:border-[var(--muted)] text-white"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-[10px] text-[var(--muted)] text-center">
        Sugerencia heurística por ticket: ≥30k Multicuentas · ≥18k Omnipresencia · ≥5k Omnipresencia · 1-5k Consultoría
      </p>
    </div>
  );
}
