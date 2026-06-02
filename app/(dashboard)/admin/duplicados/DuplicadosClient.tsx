"use client";

import { useState } from "react";
import Link from "next/link";

interface EnrichedLead {
  id: string;
  nombre: string | null;
  telefono: string | null;
  telefono_normalizado: string | null;
  email: string | null;
  instagram: string | null;
  estado: string | null;
  ticket_total: number;
  closer_nombre: string | null;
  created_at?: string;
}

interface Group {
  key: string;
  motivo: "telefono" | "email" | "instagram" | "nombre_similar";
  leads: EnrichedLead[];
}

const MOTIVO_LABEL: Record<string, string> = {
  telefono: "📱 Mismo teléfono",
  email: "📧 Mismo email",
  instagram: "📷 Mismo Instagram",
  nombre_similar: "📝 Nombre similar (typo)",
};

export default function DuplicadosClient({ groups: initial }: { groups: Group[] }) {
  const [groups, setGroups] = useState(initial);
  const [ignorados, setIgnorados] = useState<Set<string>>(new Set());

  const visible = groups.filter((g) => !ignorados.has(g.key));

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">🔍 Leads duplicados detectados</h1>
        <p className="text-sm text-[var(--muted)]">
          {visible.length} grupos de duplicados encontrados por teléfono / email / IG / nombre similar (Levenshtein).
        </p>
      </div>

      {visible.length === 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-8 text-center">
          <p className="text-sm text-[var(--muted)]">✨ Sin duplicados detectados</p>
        </div>
      )}

      <div className="space-y-3">
        {visible.map((g) => (
          <div key={g.key} className="bg-[var(--card-bg)] border border-amber-500/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-amber-300">
                {MOTIVO_LABEL[g.motivo]} ({g.leads.length} leads)
              </h3>
              <button
                onClick={() => setIgnorados((p) => new Set(p).add(g.key))}
                className="text-[10px] text-[var(--muted)] hover:text-white"
              >
                Ignorar
              </button>
            </div>
            <div className="space-y-2">
              {g.leads.map((l) => (
                <div key={l.id} className="bg-white/5 border border-[var(--card-border)] rounded-lg p-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <Link
                      href={`/llamadas/${l.id}/estado-cuenta`}
                      target="_blank"
                      className="text-white font-medium hover:text-[var(--purple-light)]"
                    >
                      {l.nombre || "(sin nombre)"}
                    </Link>
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      {l.estado && <span className="text-[var(--muted)]">{l.estado}</span>}
                      {l.closer_nombre && <span className="text-[var(--muted)]">closer: {l.closer_nombre}</span>}
                      {l.ticket_total > 0 && <span className="text-[var(--purple-light)]">${l.ticket_total.toLocaleString()}</span>}
                    </div>
                  </div>
                  <div className="text-[11px] text-[var(--muted)] mt-1 flex flex-wrap gap-3">
                    {l.telefono && <span>📱 {l.telefono}</span>}
                    {l.email && <span>📧 {l.email}</span>}
                    {l.instagram && <span>📷 {l.instagram}</span>}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-[var(--muted)] mt-2">
              💡 Para mergear: ir a cada lead, copiar info al que tiene más historial, y eliminar el duplicado.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
