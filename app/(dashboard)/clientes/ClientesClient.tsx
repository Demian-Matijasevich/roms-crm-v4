"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import DataTable from "@/app/components/DataTable";
import Semaforo from "@/app/components/Semaforo";
import StatusBadge from "@/app/components/StatusBadge";
import type { Client } from "@/lib/types";
import { healthToSemaforo } from "@/lib/types";
import { PROGRAMS, CLIENT_ESTADOS_LABELS } from "@/lib/constants";
import { daysUntil } from "@/lib/format";
import { parseLocalDate } from "@/lib/date-utils";

interface Props {
  clients: Client[];
  notesCounts?: Record<string, number>;
}

export default function ClientesClient({ clients, notesCounts = {} }: Props) {
  const router = useRouter();
  const [filterEstado, setFilterEstado] = useState<string>("todos");
  const [filterPrograma, setFilterPrograma] = useState<string>("todos");
  const [filterSalud, setFilterSalud] = useState<string>("todos");

  const filtered = useMemo(() => {
    let result = clients;
    if (filterEstado !== "todos") {
      result = result.filter((c) => c.estado === filterEstado);
    }
    if (filterPrograma !== "todos") {
      result = result.filter((c) => c.programa === filterPrograma);
    }
    if (filterSalud !== "todos") {
      result = result.filter((c) => healthToSemaforo(c.health_score) === filterSalud);
    }
    return result;
  }, [clients, filterEstado, filterPrograma, filterSalud]);

  const columns = [
    {
      key: "nombre",
      label: "Nombre",
      sortable: true,
      render: (row: Record<string, unknown>) => (
        <span className="font-medium text-white">{(row as unknown as Client).nombre}</span>
      ),
    },
    {
      key: "programa",
      label: "Programa",
      render: (row: Record<string, unknown>) => {
        const c = row as unknown as Client;
        return (
          <span className="text-sm">
            {c.programa ? PROGRAMS[c.programa]?.label ?? c.programa : "---"}
          </span>
        );
      },
    },
    {
      key: "estado",
      label: "Estado",
      render: (row: Record<string, unknown>) => {
        const c = row as unknown as Client;
        return (
          <StatusBadge
            status={c.estado}
            label={CLIENT_ESTADOS_LABELS[c.estado] ?? c.estado}
          />
        );
      },
    },
    {
      key: "health_score",
      label: "Salud",
      sortable: true,
      render: (row: Record<string, unknown>) => {
        const c = row as unknown as Client;
        return (
          <div className="flex items-center gap-2">
            <Semaforo value={healthToSemaforo(c.health_score)} />
            <span className="text-xs text-[var(--muted)]">{c.health_score}</span>
          </div>
        );
      },
    },
    {
      key: "dias_restantes",
      label: "Dias Rest.",
      sortable: true,
      render: (row: Record<string, unknown>) => {
        const c = row as unknown as Client;
        if (!c.fecha_onboarding) return <span className="text-[var(--muted)]">---</span>;
        const offboarding = parseLocalDate(c.fecha_onboarding);
        offboarding.setDate(offboarding.getDate() + c.total_dias_programa);
        const days = daysUntil(offboarding.toISOString().split("T")[0]);
        if (days === null) return <span className="text-[var(--muted)]">---</span>;
        return (
          <span className={days <= 0 ? "text-[var(--red)]" : days <= 15 ? "text-[var(--yellow)]" : "text-white"}>
            {days <= 0 ? `Vencido (${Math.abs(days)}d)` : `${days}d`}
          </span>
        );
      },
    },
    {
      key: "estado_contacto",
      label: "Contacto",
      render: (row: Record<string, unknown>) => {
        const c = row as unknown as Client;
        return <StatusBadge status={c.estado_contacto} />;
      },
    },
    {
      key: "notas",
      label: "Notas",
      render: (row: Record<string, unknown>) => {
        const c = row as unknown as Client;
        const count = notesCounts[c.id] ?? 0;
        if (count === 0) return <span className="text-[var(--muted)]">---</span>;
        return (
          <span className="text-sm text-[var(--purple-light)] flex items-center gap-1">
            <span>{"\u{1F4AC}"}</span>
            <span>{count}</span>
          </span>
        );
      },
    },
  ];

  const uniqueEstados = [...new Set(clients.map((c) => c.estado))];
  const uniqueProgramas = [...new Set(clients.map((c) => c.programa).filter(Boolean))];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filterEstado}
          onChange={(e) => setFilterEstado(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
        >
          <option value="todos">Todos los estados</option>
          {uniqueEstados.map((e) => (
            <option key={e} value={e}>{CLIENT_ESTADOS_LABELS[e] ?? e}</option>
          ))}
        </select>

        <select
          value={filterPrograma}
          onChange={(e) => setFilterPrograma(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
        >
          <option value="todos">Todos los programas</option>
          {uniqueProgramas.map((p) => (
            <option key={p} value={p!}>{PROGRAMS[p!]?.label ?? p}</option>
          ))}
        </select>

        <select
          value={filterSalud}
          onChange={(e) => setFilterSalud(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
        >
          <option value="todos">Toda la salud</option>
          <option value="verde">Verde (80-100)</option>
          <option value="amarillo">Amarillo (50-79)</option>
          <option value="rojo">Rojo (0-49)</option>
        </select>
      </div>

      <DataTable
        data={filtered as unknown as Record<string, unknown>[]}
        columns={columns}
        searchKey={"nombre" as keyof Record<string, unknown>}
        searchPlaceholder="Buscar por nombre..."
        pageSize={25}
        onRowClick={(row) => router.push(`/clientes/${(row as unknown as Client).id}`)}
      />
    </div>
  );
}
