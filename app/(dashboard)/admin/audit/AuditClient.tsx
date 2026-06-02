"use client";

import { useState } from "react";
import Link from "next/link";

interface Entry {
  id: string;
  entity_type: string;
  entity_id: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  changed_by_nombre: string | null;
  action: string;
  created_at: string;
}

function timeAgo(date: string): string {
  const ms = Date.now() - new Date(date).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min}min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr}h`;
  return `hace ${Math.floor(hr / 24)}d`;
}

export default function AuditClient({ entries, filterEntity, filterId }: { entries: Entry[]; filterEntity: string; filterId: string }) {
  const [showOldNew, setShowOldNew] = useState(true);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">🕵 Audit log</h1>
        <p className="text-sm text-[var(--muted)]">
          Últimos {entries.length} cambios{filterEntity ? ` · entity=${filterEntity}` : ""}{filterId ? ` · id=${filterId.slice(0, 8)}…` : ""}.
        </p>
        <div className="mt-2 flex gap-2 flex-wrap text-xs">
          <Link href="/admin/audit" className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white">Todos</Link>
          <Link href="/admin/audit?entity=lead" className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white">Leads</Link>
          <Link href="/admin/audit?entity=payment" className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white">Pagos</Link>
          <Link href="/admin/audit?entity=client" className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white">Clientes</Link>
          <button onClick={() => setShowOldNew(!showOldNew)} className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-white ml-auto">
            {showOldNew ? "Ocultar valores" : "Mostrar valores"}
          </button>
        </div>
      </div>

      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        {entries.length === 0 ? (
          <p className="text-sm text-[var(--muted)] py-8 text-center">Sin entradas de audit</p>
        ) : (
          <div className="divide-y divide-[var(--card-border)]/40">
            {entries.map((e) => (
              <div key={e.id} className="px-4 py-2.5 hover:bg-white/5">
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <span className="text-[10px] uppercase font-bold bg-[var(--purple)]/20 text-[var(--purple-light)] px-2 py-0.5 rounded">
                    {e.entity_type}
                  </span>
                  <span className="text-white">{e.field || e.action}</span>
                  <Link
                    href={`/admin/audit?id=${e.entity_id}`}
                    className="text-[10px] text-[var(--muted)] hover:text-white font-mono"
                  >
                    {e.entity_id.slice(0, 8)}…
                  </Link>
                  <span className="text-[var(--muted)] text-xs ml-auto">
                    {e.changed_by_nombre || "—"} · {timeAgo(e.created_at)}
                  </span>
                </div>
                {showOldNew && (e.old_value !== null || e.new_value !== null) && (
                  <div className="mt-1 text-xs flex items-center gap-2 flex-wrap">
                    <span className="text-red-300 line-through">{e.old_value ?? "(null)"}</span>
                    <span className="text-[var(--muted)]">→</span>
                    <span className="text-green-300">{e.new_value ?? "(null)"}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
