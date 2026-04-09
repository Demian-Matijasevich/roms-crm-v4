"use client";

import { useState } from "react";
import type { TeamMember } from "@/lib/types";
import type { PaymentMethod } from "@/lib/queries/admin";
import { PROGRAMS, COMMISSION_CLOSER, COMMISSION_SETTER } from "@/lib/constants";
import { formatPct, formatUSD } from "@/lib/format";
import { getFiscalMonthOptions, getFiscalMonth } from "@/lib/date-utils";

export interface Objective {
  id: string;
  team_member_id: string;
  mes_fiscal: string;
  objetivo_cash: number;
  objetivo_cierres: number;
  objetivo_agendas: number;
  team_member?: { id: string; nombre: string };
}

interface Props {
  team: TeamMember[];
  paymentMethods: PaymentMethod[];
  objectives?: Objective[];
}

type Tab = "equipo" | "metodos_pago" | "programas" | "comisiones" | "objetivos";

// ------- Team Member Edit Modal -------

function TeamMemberEditModal({
  member,
  onClose,
  onSaved,
}: {
  member: TeamMember;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    nombre: member.nombre,
    rol: member.rol || "",
    is_admin: member.is_admin,
    is_closer: member.is_closer,
    is_setter: member.is_setter,
    is_cobranzas: member.is_cobranzas,
    is_seguimiento: member.is_seguimiento,
    pin: member.pin || "",
    comision_pct: member.comision_pct,
    activo: member.activo,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateField(key: string, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/team/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al guardar");
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl w-full max-w-md p-5 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-white font-semibold">Editar: {member.nombre}</h3>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-white text-xl">&times;</button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs text-[var(--muted)] block mb-1">Nombre</label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => updateField("nombre", e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Rol</label>
            <input
              type="text"
              value={form.rol}
              onChange={(e) => updateField("rol", e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">PIN</label>
            <input
              type="text"
              value={form.pin}
              onChange={(e) => updateField("pin", e.target.value.replace(/\D/g, "").slice(0, 4))}
              maxLength={4}
              className="w-full px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Comision %</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={form.comision_pct}
              onChange={(e) => updateField("comision_pct", parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
            />
          </div>
        </div>

        {/* Flags */}
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["is_admin", "Admin"],
              ["is_closer", "Closer"],
              ["is_setter", "Setter"],
              ["is_cobranzas", "Cobranzas"],
              ["is_seguimiento", "Seguimiento"],
              ["activo", "Activo"],
            ] as [string, string][]
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-white cursor-pointer">
              <input
                type="checkbox"
                checked={form[key as keyof typeof form] as boolean}
                onChange={(e) => updateField(key, e.target.checked)}
                className="accent-[var(--purple)]"
              />
              {label}
            </label>
          ))}
        </div>

        {error && <p className="text-[var(--red)] text-sm">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[var(--muted)] text-sm hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-1.5 rounded-lg bg-[var(--purple)] text-white text-sm font-medium disabled:opacity-50 hover:bg-[var(--purple-dark)] transition-colors"
          >
            {loading ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------- Payment Method Edit Modal -------

function PaymentMethodModal({
  method,
  onClose,
  onSaved,
}: {
  method: PaymentMethod | null; // null = create mode
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    nombre: method?.nombre || "",
    titular: method?.titular || "",
    tipo_moneda: method?.tipo_moneda || "usd" as "ars" | "usd",
    cbu: method?.cbu || "",
    alias_cbu: method?.alias_cbu || "",
    banco: method?.banco || "",
    id_cuenta: method?.id_cuenta || "",
    observaciones: method?.observaciones || "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function updateField(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setLoading(true);
    setError("");

    try {
      const isEdit = method !== null;
      const url = isEdit
        ? `/api/admin/payment-methods/${method.id}`
        : "/api/admin/payment-methods";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al guardar");
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  const fields: { key: string; label: string }[] = [
    { key: "nombre", label: "Nombre" },
    { key: "titular", label: "Titular" },
    { key: "banco", label: "Banco" },
    { key: "cbu", label: "CBU" },
    { key: "alias_cbu", label: "Alias CBU" },
    { key: "id_cuenta", label: "ID Cuenta" },
    { key: "observaciones", label: "Observaciones" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl w-full max-w-md p-5 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-white font-semibold">
            {method ? `Editar: ${method.nombre}` : "Nuevo Metodo de Pago"}
          </h3>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-white text-xl">&times;</button>
        </div>

        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="text-xs text-[var(--muted)] block mb-1">{f.label}</label>
              <input
                type="text"
                value={(form as Record<string, string>)[f.key]}
                onChange={(e) => updateField(f.key, e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
              />
            </div>
          ))}
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Moneda</label>
            <select
              value={form.tipo_moneda}
              onChange={(e) => updateField("tipo_moneda", e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
            >
              <option value="usd">USD</option>
              <option value="ars">ARS</option>
            </select>
          </div>
        </div>

        {error && <p className="text-[var(--red)] text-sm">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-[var(--card-border)] text-[var(--muted)] text-sm hover:text-white transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-1.5 rounded-lg bg-[var(--purple)] text-white text-sm font-medium disabled:opacity-50 hover:bg-[var(--purple-dark)] transition-colors"
          >
            {loading ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ------- Main Admin Component -------

// ------- Objectives Tab Component -------

function ObjectivesTab({ team, objectives: initialObjectives }: { team: TeamMember[]; objectives: Objective[] }) {
  const [selectedMember, setSelectedMember] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(getFiscalMonth(new Date()));
  const [form, setForm] = useState({ objetivo_cash: 0, objetivo_cierres: 0, objetivo_agendas: 0 });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [objectives, setObjectives] = useState(initialObjectives);

  const monthOptions = getFiscalMonthOptions(12);
  const activeTeam = team.filter((m) => m.activo);

  // Load existing objective when member/month changes
  const existing = objectives.find(
    (o) => o.team_member_id === selectedMember && o.mes_fiscal === selectedMonth
  );

  function handleMemberChange(id: string) {
    setSelectedMember(id);
    setSaved(false);
    const obj = objectives.find((o) => o.team_member_id === id && o.mes_fiscal === selectedMonth);
    if (obj) {
      setForm({ objetivo_cash: obj.objetivo_cash, objetivo_cierres: obj.objetivo_cierres, objetivo_agendas: obj.objetivo_agendas });
    } else {
      setForm({ objetivo_cash: 0, objetivo_cierres: 0, objetivo_agendas: 0 });
    }
  }

  function handleMonthChange(month: string) {
    // The selector gives us YYYY-MM-DD, but we need the fiscal month label
    const d = new Date(month + "T12:00:00");
    const label = getFiscalMonth(d);
    setSelectedMonth(label);
    setSaved(false);
    const obj = objectives.find((o) => o.team_member_id === selectedMember && o.mes_fiscal === label);
    if (obj) {
      setForm({ objetivo_cash: obj.objetivo_cash, objetivo_cierres: obj.objetivo_cierres, objetivo_agendas: obj.objetivo_agendas });
    } else {
      setForm({ objetivo_cash: 0, objetivo_cierres: 0, objetivo_agendas: 0 });
    }
  }

  async function handleSave() {
    if (!selectedMember || !selectedMonth) return;
    setLoading(true);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/objectives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_member_id: selectedMember,
          mes_fiscal: selectedMonth,
          ...form,
        }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      const data = await res.json();
      // Update local state
      setObjectives((prev) => {
        const idx = prev.findIndex(
          (o) => o.team_member_id === selectedMember && o.mes_fiscal === selectedMonth
        );
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...form };
          return next;
        }
        return [...prev, data];
      });
      setSaved(true);
    } catch {
      alert("Error al guardar objetivo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-5 space-y-4">
        <h3 className="text-white font-semibold">Definir Objetivos Mensuales</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Miembro del equipo</label>
            <select
              value={selectedMember}
              onChange={(e) => handleMemberChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
            >
              <option value="">Seleccionar...</option>
              {activeTeam.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre} ({m.rol || "sin rol"})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Mes fiscal</label>
            <select
              value={monthOptions.find((o) => {
                const d = new Date(o.value + "T12:00:00");
                return getFiscalMonth(d) === selectedMonth;
              })?.value || ""}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {selectedMember && (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">Objetivo Cash (USD)</label>
              <input
                type="number"
                min="0"
                step="100"
                value={form.objetivo_cash}
                onChange={(e) => setForm((f) => ({ ...f, objetivo_cash: Number(e.target.value) || 0 }))}
                className="w-full px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">Objetivo Cierres</label>
              <input
                type="number"
                min="0"
                value={form.objetivo_cierres}
                onChange={(e) => setForm((f) => ({ ...f, objetivo_cierres: Number(e.target.value) || 0 }))}
                className="w-full px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--muted)] block mb-1">Objetivo Agendas</label>
              <input
                type="number"
                min="0"
                value={form.objetivo_agendas}
                onChange={(e) => setForm((f) => ({ ...f, objetivo_agendas: Number(e.target.value) || 0 }))}
                className="w-full px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
              />
            </div>
          </div>
        )}

        {selectedMember && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-4 py-1.5 rounded-lg bg-[var(--purple)] text-white text-sm font-medium disabled:opacity-50 hover:bg-[var(--purple-dark)] transition-colors"
            >
              {loading ? "Guardando..." : existing ? "Actualizar Objetivo" : "Guardar Objetivo"}
            </button>
            {saved && <span className="text-[var(--green)] text-sm">Guardado!</span>}
          </div>
        )}
      </div>

      {/* Existing objectives table */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        <div className="p-4 border-b border-[var(--card-border)]">
          <h3 className="text-white font-semibold text-sm">Objetivos Cargados</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[var(--muted)] text-xs uppercase bg-[var(--background)]">
                <th className="text-left px-3 py-2">Nombre</th>
                <th className="text-left px-3 py-2">Mes Fiscal</th>
                <th className="text-right px-3 py-2">Cash</th>
                <th className="text-right px-3 py-2">Cierres</th>
                <th className="text-right px-3 py-2">Agendas</th>
              </tr>
            </thead>
            <tbody>
              {objectives.map((o) => {
                const member = team.find((m) => m.id === o.team_member_id);
                return (
                  <tr key={o.id || `${o.team_member_id}-${o.mes_fiscal}`} className="border-t border-[var(--card-border)]">
                    <td className="px-3 py-2 text-white">{member?.nombre || o.team_member?.nombre || "?"}</td>
                    <td className="px-3 py-2 text-[var(--muted)]">{o.mes_fiscal}</td>
                    <td className="px-3 py-2 text-right text-[var(--green)]">{formatUSD(o.objetivo_cash)}</td>
                    <td className="px-3 py-2 text-right text-white">{o.objetivo_cierres}</td>
                    <td className="px-3 py-2 text-right text-white">{o.objetivo_agendas}</td>
                  </tr>
                );
              })}
              {objectives.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-[var(--muted)]">Sin objetivos cargados</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function AdminClient({ team, paymentMethods, objectives = [] }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("equipo");
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null | "new">(null);

  const tabs: { key: Tab; label: string }[] = [
    { key: "equipo", label: "Equipo" },
    { key: "metodos_pago", label: "Metodos de Pago" },
    { key: "programas", label: "Programas" },
    { key: "comisiones", label: "Comisiones" },
    { key: "objetivos", label: "Objetivos" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Admin Panel</h1>
        <p className="text-sm text-[var(--muted)]">Gestion de equipo, metodos de pago y configuracion</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === t.key
                ? "bg-[var(--purple)] text-white"
                : "text-[var(--muted)] hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: Equipo */}
      {activeTab === "equipo" && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--muted)] text-xs uppercase bg-[var(--background)]">
                  <th className="text-left px-3 py-2">Nombre</th>
                  <th className="text-left px-3 py-2">Rol</th>
                  <th className="text-center px-3 py-2">Admin</th>
                  <th className="text-center px-3 py-2">Closer</th>
                  <th className="text-center px-3 py-2">Setter</th>
                  <th className="text-center px-3 py-2">Cobranzas</th>
                  <th className="text-center px-3 py-2">Seguimiento</th>
                  <th className="text-right px-3 py-2">Comision</th>
                  <th className="text-center px-3 py-2">Activo</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {team.map((m) => (
                  <tr key={m.id} className="border-t border-[var(--card-border)] hover:bg-white/5">
                    <td className="px-3 py-2 text-white font-medium">{m.nombre}</td>
                    <td className="px-3 py-2 text-[var(--muted)]">{m.rol || "\u2014"}</td>
                    <td className="px-3 py-2 text-center">{m.is_admin ? "\u2713" : ""}</td>
                    <td className="px-3 py-2 text-center">{m.is_closer ? "\u2713" : ""}</td>
                    <td className="px-3 py-2 text-center">{m.is_setter ? "\u2713" : ""}</td>
                    <td className="px-3 py-2 text-center">{m.is_cobranzas ? "\u2713" : ""}</td>
                    <td className="px-3 py-2 text-center">{m.is_seguimiento ? "\u2713" : ""}</td>
                    <td className="px-3 py-2 text-right text-[var(--muted)]">{formatPct(m.comision_pct)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`w-2 h-2 rounded-full inline-block ${m.activo ? "bg-[var(--green)]" : "bg-[var(--red)]"}`} />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => setEditingMember(m)}
                        className="text-xs text-[var(--purple-light)] hover:text-white transition-colors"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: Metodos de Pago */}
      {activeTab === "metodos_pago" && (
        <div className="space-y-3">
          <button
            onClick={() => setEditingMethod("new")}
            className="px-3 py-1.5 rounded-lg bg-[var(--purple)] text-white text-sm font-medium hover:bg-[var(--purple-dark)] transition-colors"
          >
            + Nuevo Metodo
          </button>

          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[var(--muted)] text-xs uppercase bg-[var(--background)]">
                    <th className="text-left px-3 py-2">Nombre</th>
                    <th className="text-left px-3 py-2">Titular</th>
                    <th className="text-left px-3 py-2">Moneda</th>
                    <th className="text-left px-3 py-2">Banco</th>
                    <th className="text-left px-3 py-2">CBU / Alias</th>
                    <th className="text-left px-3 py-2">Observaciones</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {paymentMethods.map((pm) => (
                    <tr key={pm.id} className="border-t border-[var(--card-border)] hover:bg-white/5">
                      <td className="px-3 py-2 text-white font-medium">{pm.nombre}</td>
                      <td className="px-3 py-2 text-[var(--muted)]">{pm.titular || "\u2014"}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          pm.tipo_moneda === "usd" ? "bg-green-500/15 text-green-400" : "bg-blue-500/15 text-blue-400"
                        }`}>
                          {pm.tipo_moneda.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[var(--muted)]">{pm.banco || "\u2014"}</td>
                      <td className="px-3 py-2 text-[var(--muted)] text-xs">
                        {pm.alias_cbu || pm.cbu || "\u2014"}
                      </td>
                      <td className="px-3 py-2 text-[var(--muted)] text-xs">{pm.observaciones || "\u2014"}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => setEditingMethod(pm)}
                          className="text-xs text-[var(--purple-light)] hover:text-white transition-colors"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: Programas */}
      {activeTab === "programas" && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--muted)] text-xs uppercase bg-[var(--background)]">
                  <th className="text-left px-3 py-2">Programa</th>
                  <th className="text-left px-3 py-2">Clave</th>
                  <th className="text-right px-3 py-2">Precio USD</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(PROGRAMS).map(([key, prog]) => (
                  <tr key={key} className="border-t border-[var(--card-border)]">
                    <td className="px-3 py-2 text-white">{prog.label}</td>
                    <td className="px-3 py-2 text-[var(--muted)] font-mono text-xs">{key}</td>
                    <td className="px-3 py-2 text-right text-white">
                      {prog.mensual > 0 ? `$${prog.mensual.toLocaleString()}/mes` : "\u2014"}{prog.pif ? ` (PIF: $${prog.pif.toLocaleString()})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[var(--muted)] p-3 border-t border-[var(--card-border)]">
            Los programas son valores fijos definidos en el sistema. Contactar al admin para cambios.
          </p>
        </div>
      )}

      {/* TAB: Comisiones */}
      {activeTab === "comisiones" && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 space-y-4">
          <h3 className="text-sm font-semibold text-white">Estructura de Comisiones</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-[var(--purple)]">{formatPct(COMMISSION_CLOSER)}</p>
              <p className="text-sm text-[var(--muted)] mt-1">Closer</p>
              <p className="text-xs text-[var(--muted)] mt-2">Sobre cash collected de ventas donde es closer del lead</p>
            </div>
            <div className="bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-green-400">{formatPct(COMMISSION_SETTER)}</p>
              <p className="text-sm text-[var(--muted)] mt-1">Setter</p>
              <p className="text-xs text-[var(--muted)] mt-2">Sobre cash collected de ventas donde es setter del lead</p>
            </div>
          </div>

          <div className="border-t border-[var(--card-border)] pt-3">
            <h4 className="text-xs uppercase text-[var(--muted)] font-semibold mb-2">Comisiones por Miembro</h4>
            <div className="space-y-1">
              {team
                .filter((m) => m.activo && m.comision_pct > 0)
                .map((m) => (
                  <div key={m.id} className="flex justify-between items-center py-1 text-sm">
                    <span className="text-white">{m.nombre}</span>
                    <span className="text-[var(--muted)]">
                      {formatPct(m.comision_pct)} — {m.rol || "sin rol"}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: Objetivos */}
      {activeTab === "objetivos" && (
        <ObjectivesTab team={team} objectives={objectives} />
      )}

      {/* Modals */}
      {editingMember && (
        <TeamMemberEditModal
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onSaved={() => {
            setEditingMember(null);
            window.location.reload();
          }}
        />
      )}

      {editingMethod !== null && (
        <PaymentMethodModal
          method={editingMethod === "new" ? null : editingMethod}
          onClose={() => setEditingMethod(null)}
          onSaved={() => {
            setEditingMethod(null);
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
