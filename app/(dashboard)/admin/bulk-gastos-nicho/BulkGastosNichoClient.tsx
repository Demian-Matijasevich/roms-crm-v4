"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

type Gasto = {
  id: string;
  fecha: string;
  concepto: string;
  categoria: string | null;
  monto_usd: number;
  billetera: string | null;
  pagado_a: string | null;
  nicho: string;
};

export default function BulkGastosNichoClient({ gastos }: { gastos: Gasto[] }) {
  const router = useRouter();
  const [filterCat, setFilterCat] = useState("");
  const [filterNicho, setFilterNicho] = useState<"todos" | "general" | "politica">("todos");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [localGastos, setLocalGastos] = useState(gastos);
  const [error, setError] = useState<string | null>(null);

  const categorias = useMemo(() => {
    const s = new Set<string>();
    for (const g of localGastos) if (g.categoria) s.add(g.categoria);
    return Array.from(s).sort();
  }, [localGastos]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return localGastos.filter((g) => {
      if (filterCat && g.categoria !== filterCat) return false;
      if (filterNicho !== "todos" && g.nicho !== filterNicho) return false;
      if (q && !`${g.concepto} ${g.categoria || ""} ${g.pagado_a || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [localGastos, filterCat, filterNicho, search]);

  async function changeNicho(id: string, nicho: "general" | "politica") {
    setSaving(id);
    setError(null);
    const res = await fetch("/api/gastos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, nicho }),
    });
    if (res.ok) {
      setLocalGastos((prev) => prev.map((g) => (g.id === id ? { ...g, nicho } : g)));
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || `Error ${res.status}`);
    }
    setSaving(null);
  }

  async function bulkRetag(nichoTarget: "general" | "politica") {
    if (filtered.length === 0) return;
    const ok = confirm(`¿Marcar los ${filtered.length} gastos filtrados como ${nichoTarget}?`);
    if (!ok) return;
    setSaving("__bulk__");
    setError(null);
    let okCount = 0;
    let errCount = 0;
    for (const g of filtered) {
      if (g.nicho === nichoTarget) continue;
      const res = await fetch("/api/gastos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: g.id, nicho: nichoTarget }),
      });
      if (res.ok) {
        okCount++;
      } else {
        errCount++;
      }
    }
    if (errCount > 0) setError(`${okCount} ok, ${errCount} errores`);
    router.refresh();
    setSaving(null);
  }

  const total = localGastos.length;
  const totGeneral = localGastos.filter((g) => g.nicho === "general").length;
  const totPolitica = localGastos.filter((g) => g.nicho === "politica").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-white">🏷 Bulk-tag nicho de gastos</h1>
        <p className="text-sm text-[var(--muted)]">
          Reasigná gastos históricos entre <strong>General (ROMS)</strong> y <strong>Política</strong>.
          Total: {total} · General: {totGeneral} · Política: {totPolitica}
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-3 flex flex-wrap items-center gap-3">
        <input
          placeholder="🔍 Buscar concepto / categoría / pagado a"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-[var(--background)] border border-[var(--card-border)] rounded px-3 py-1.5 text-sm text-white min-w-[260px]"
        />
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="bg-[var(--background)] border border-[var(--card-border)] rounded px-2 py-1.5 text-sm text-white"
        >
          <option value="">Todas categorías</option>
          {categorias.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={filterNicho}
          onChange={(e) => setFilterNicho(e.target.value as "todos" | "general" | "politica")}
          className="bg-[var(--background)] border border-[var(--card-border)] rounded px-2 py-1.5 text-sm text-white"
        >
          <option value="todos">Todos nichos</option>
          <option value="general">Solo General</option>
          <option value="politica">Solo Política</option>
        </select>
        <div className="text-xs text-[var(--muted)]">{filtered.length} filtrados</div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => bulkRetag("politica")}
            disabled={saving === "__bulk__" || filtered.length === 0}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs rounded font-semibold disabled:opacity-50"
          >
            🏛 Marcar filtro como Política
          </button>
          <button
            onClick={() => bulkRetag("general")}
            disabled={saving === "__bulk__" || filtered.length === 0}
            className="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 text-white text-xs rounded font-semibold disabled:opacity-50"
          >
            📊 Marcar filtro como General
          </button>
        </div>
      </div>

      {error && <div className="bg-rose-500/10 border border-rose-500/40 text-rose-300 text-sm px-3 py-2 rounded">{error}</div>}

      {/* Tabla */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white/5 text-[var(--muted)] text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Fecha</th>
                <th className="px-3 py-2 text-left">Concepto</th>
                <th className="px-3 py-2 text-left">Categoría</th>
                <th className="px-3 py-2 text-left">Pagado a</th>
                <th className="px-3 py-2 text-right">USD</th>
                <th className="px-3 py-2 text-center">Nicho</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((g) => (
                <tr key={g.id} className="border-t border-[var(--card-border)] hover:bg-white/5">
                  <td className="px-3 py-2 text-xs text-[var(--muted)]">{g.fecha}</td>
                  <td className="px-3 py-2 text-white max-w-[300px] truncate">{g.concepto}</td>
                  <td className="px-3 py-2 text-xs text-[var(--muted)]">{g.categoria || "—"}</td>
                  <td className="px-3 py-2 text-xs text-[var(--muted)]">{g.pagado_a || "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">${g.monto_usd.toLocaleString("en-US")}</td>
                  <td className="px-3 py-2 text-center">
                    <select
                      value={g.nicho}
                      onChange={(e) => changeNicho(g.id, e.target.value as "general" | "politica")}
                      disabled={saving === g.id}
                      className={`text-xs px-2 py-1 rounded border ${
                        g.nicho === "politica"
                          ? "bg-purple-500/15 border-purple-500/40 text-purple-300"
                          : "bg-white/5 border-[var(--card-border)] text-white"
                      }`}
                    >
                      <option value="general">📊 General</option>
                      <option value="politica">🏛 Política</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && (
            <div className="text-xs text-[var(--muted)] p-3 border-t border-[var(--card-border)]">
              Mostrando 500 de {filtered.length}. Filtrá para ver más específicos.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
