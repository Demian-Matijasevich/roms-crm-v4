"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Client } from "@/lib/types";
import { PROGRAMS } from "@/lib/constants";

interface Props {
  clients: Pick<Client, "id" | "nombre" | "programa" | "lead_id">[];
}

const REDES_OPTIONS = ["Instagram", "TikTok", "YouTube", "Facebook", "Twitter/X", "LinkedIn"];

export default function OnboardingForm({ clients }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [clientId, setClientId] = useState("");
  const [fechaIngreso, setFechaIngreso] = useState(new Date().toISOString().split("T")[0]);
  const [edad, setEdad] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [discordUser, setDiscordUser] = useState("");
  const [skoolUser, setSkoolUser] = useState("");
  const [redesSociales, setRedesSociales] = useState("");
  const [redSocialOrigen, setRedSocialOrigen] = useState<string[]>([]);
  const [porqueCompro, setPorqueCompro] = useState("");
  const [victoriaRapida, setVictoriaRapida] = useState("");
  const [resultadoEsperado, setResultadoEsperado] = useState("");
  const [compromisoPagos, setCompromisoPagos] = useState(false);
  const [confirmoTerminos, setConfirmoTerminos] = useState(false);
  const [etapaEcommerce, setEtapaEcommerce] = useState("");
  const [topicoCompra, setTopicoCompra] = useState("");

  const selectedClient = clients.find((c) => c.id === clientId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) { setError("Selecciona un cliente"); return; }
    setSaving(true);
    setError("");

    const body: Record<string, unknown> = {
      client_id: clientId,
      lead_id: selectedClient?.lead_id || undefined,
      fecha_ingreso: fechaIngreso,
      edad: edad ? parseInt(edad) : undefined,
      email: email || undefined,
      telefono: telefono || undefined,
      discord_user: discordUser || undefined,
      skool_user: skoolUser || undefined,
      redes_sociales: redesSociales || undefined,
      red_social_origen: redSocialOrigen,
      porque_compro: porqueCompro || undefined,
      victoria_rapida: victoriaRapida || undefined,
      resultado_esperado: resultadoEsperado || undefined,
      compromiso_pagos: compromisoPagos,
      confirmo_terminos: confirmoTerminos,
      etapa_ecommerce: etapaEcommerce || undefined,
      topico_compra: topicoCompra || undefined,
    };

    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setSuccess(true);
      setTimeout(() => router.push(`/clientes/${clientId}`), 1500);
    } else {
      const data = await res.json();
      setError(data.error || "Error al guardar");
    }
    setSaving(false);
  }

  function toggleRedOrigen(red: string) {
    setRedSocialOrigen((prev) =>
      prev.includes(red) ? prev.filter((r) => r !== red) : [...prev, red]
    );
  }

  if (success) {
    return (
      <div className="bg-[var(--green)]/10 border border-[var(--green)]/30 rounded-xl p-6 text-center">
        <p className="text-[var(--green)] font-bold text-lg">Onboarding guardado!</p>
        <p className="text-[var(--muted)] mt-1">Redirigiendo al perfil del cliente...</p>
      </div>
    );
  }

  const inputCls = "w-full px-3 py-2 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none";
  const labelCls = "block text-xs text-[var(--muted)] mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Client selector */}
      <div>
        <label className={labelCls}>Cliente *</label>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputCls} required>
          <option value="">Seleccionar cliente...</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} {c.programa ? `\u2014 ${PROGRAMS[c.programa]?.label ?? c.programa}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Fecha de Ingreso *</label>
          <input type="date" value={fechaIngreso} onChange={(e) => setFechaIngreso(e.target.value)} className={inputCls} required />
        </div>
        <div>
          <label className={labelCls}>Edad</label>
          <input type="number" value={edad} onChange={(e) => setEdad(e.target.value)} className={inputCls} min="15" max="99" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Telefono</label>
          <input type="text" value={telefono} onChange={(e) => setTelefono(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Discord User</label>
          <input type="text" value={discordUser} onChange={(e) => setDiscordUser(e.target.value)} className={inputCls} placeholder="username#1234" />
        </div>
        <div>
          <label className={labelCls}>Skool User</label>
          <input type="text" value={skoolUser} onChange={(e) => setSkoolUser(e.target.value)} className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Redes Sociales (links)</label>
        <textarea value={redesSociales} onChange={(e) => setRedesSociales(e.target.value)} className={inputCls + " resize-none"} rows={2} placeholder="@instagram, tiktok.com/..." />
      </div>

      <div>
        <label className={labelCls}>Red Social de Origen</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {REDES_OPTIONS.map((red) => (
            <button
              key={red}
              type="button"
              onClick={() => toggleRedOrigen(red)}
              className={`px-3 py-1 rounded-full text-xs transition-colors ${
                redSocialOrigen.includes(red)
                  ? "bg-[var(--purple)] text-white"
                  : "bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--purple)]"
              }`}
            >
              {red}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>Por que compro?</label>
        <textarea value={porqueCompro} onChange={(e) => setPorqueCompro(e.target.value)} className={inputCls + " resize-none"} rows={3} />
      </div>

      <div>
        <label className={labelCls}>Victoria rapida que busca</label>
        <textarea value={victoriaRapida} onChange={(e) => setVictoriaRapida(e.target.value)} className={inputCls + " resize-none"} rows={2} />
      </div>

      <div>
        <label className={labelCls}>Resultado esperado</label>
        <textarea value={resultadoEsperado} onChange={(e) => setResultadoEsperado(e.target.value)} className={inputCls + " resize-none"} rows={2} />
      </div>

      <div>
        <label className={labelCls}>Etapa de Ecommerce</label>
        <select value={etapaEcommerce} onChange={(e) => setEtapaEcommerce(e.target.value)} className={inputCls}>
          <option value="">Seleccionar...</option>
          <option value="cero">Desde cero</option>
          <option value="experiencia_sin_resultados">Tiene experiencia, sin resultados</option>
          <option value="experiencia_escalar">Tiene experiencia, quiere escalar</option>
        </select>
      </div>

      <div>
        <label className={labelCls}>Topico de compra</label>
        <input type="text" value={topicoCompra} onChange={(e) => setTopicoCompra(e.target.value)} className={inputCls} />
      </div>

      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
          <input type="checkbox" checked={compromisoPagos} onChange={(e) => setCompromisoPagos(e.target.checked)} className="accent-[var(--purple)]" />
          Compromiso de pagos
        </label>
        <label className="flex items-center gap-2 text-sm text-white cursor-pointer">
          <input type="checkbox" checked={confirmoTerminos} onChange={(e) => setConfirmoTerminos(e.target.checked)} className="accent-[var(--purple)]" />
          Confirmo terminos
        </label>
      </div>

      {error && <p className="text-[var(--red)] text-sm">{error}</p>}

      <button
        type="submit"
        disabled={saving || !clientId}
        className="w-full p-3 rounded-lg bg-[var(--purple)] text-white font-semibold disabled:opacity-50 hover:bg-[var(--purple-dark)] transition-colors"
      >
        {saving ? "Guardando..." : "Guardar Onboarding"}
      </button>
    </form>
  );
}
