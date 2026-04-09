"use client";

import { useState } from "react";
import DataTable from "@/app/components/DataTable";
import type { TeamMember } from "@/lib/types";
import type { UtmCampaignWithPerformance } from "@/lib/queries/utm";
import { formatUSD, formatDate } from "@/lib/format";

interface Props {
  campaigns: UtmCampaignWithPerformance[];
  setters: Pick<TeamMember, "id" | "nombre">[];
}

function UtmForm({ setters, onSuccess }: { setters: Props["setters"]; onSuccess: () => void }) {
  const [url, setUrl] = useState("https://calendly.com/7roms");
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("");
  const [content, setContent] = useState("");
  const [setterId, setSetterId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const generatedUrl = source && medium && content
    ? `${url}?utm_source=${encodeURIComponent(source)}&utm_medium=${encodeURIComponent(medium)}&utm_content=${encodeURIComponent(content)}`
    : "";

  async function handleCopy() {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/utm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          source,
          medium,
          content,
          setter_id: setterId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al guardar");
      }

      setSource("");
      setMedium("");
      setContent("");
      setSetterId("");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 space-y-4">
      <h3 className="text-sm font-semibold text-white">Crear UTM</h3>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">URL Base</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Source</label>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="instagram, youtube, whatsapp..."
              className="w-full px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Medium</label>
            <input
              type="text"
              value={medium}
              onChange={(e) => setMedium(e.target.value)}
              placeholder="story, post, reel, bio, dm..."
              className="w-full px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Content</label>
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="lead_magnet_ebook, caso_exito..."
              className="w-full px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1">Setter Responsable</label>
            <select
              value={setterId}
              onChange={(e) => setSetterId(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-white text-sm focus:border-[var(--purple)] outline-none"
            >
              <option value="">Sin asignar</option>
              {setters.map((s) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Generated URL preview */}
        {generatedUrl && (
          <div className="flex items-center gap-2 bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-3">
            <code className="text-xs text-[var(--purple-light)] break-all flex-1">
              {generatedUrl}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1 rounded-lg bg-[var(--purple)] text-white text-xs font-medium shrink-0 hover:bg-[var(--purple-dark)] transition-colors"
            >
              {copied ? "Copiado!" : "Copiar"}
            </button>
          </div>
        )}

        {error && <p className="text-[var(--red)] text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading || !source || !medium || !content}
          className="px-4 py-2 rounded-lg bg-[var(--purple)] text-white font-semibold disabled:opacity-50 hover:bg-[var(--purple-dark)] transition-colors"
        >
          {loading ? "Guardando..." : "Guardar UTM"}
        </button>
      </form>
    </div>
  );
}

export default function UtmClient({ campaigns, setters }: Props) {
  const columns = [
    {
      key: "source",
      label: "Source",
      sortable: true,
      render: (row: UtmCampaignWithPerformance) => (
        <span className="text-[var(--purple-light)] font-medium">{row.source}</span>
      ),
    },
    {
      key: "medium",
      label: "Medium",
      render: (row: UtmCampaignWithPerformance) => row.medium || "\u2014",
    },
    {
      key: "content",
      label: "Content",
      render: (row: UtmCampaignWithPerformance) => row.content || "\u2014",
    },
    {
      key: "setter",
      label: "Setter",
      render: (row: UtmCampaignWithPerformance) => row.setter?.nombre ?? "\u2014",
    },
    {
      key: "agendas_count",
      label: "Agendas",
      sortable: true,
      render: (row: UtmCampaignWithPerformance) => row.agendas_count,
    },
    {
      key: "facturacion",
      label: "Facturacion",
      sortable: true,
      render: (row: UtmCampaignWithPerformance) => formatUSD(row.facturacion),
    },
    {
      key: "cash_collected",
      label: "Cash",
      sortable: true,
      render: (row: UtmCampaignWithPerformance) => (
        <span className="text-[var(--green)] font-medium">{formatUSD(row.cash_collected)}</span>
      ),
    },
    {
      key: "created_at",
      label: "Creado",
      render: (row: UtmCampaignWithPerformance) => formatDate(row.created_at),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">UTM Builder</h1>
        <p className="text-sm text-[var(--muted)]">Crear y trackear links con UTM</p>
      </div>

      <UtmForm setters={setters} onSuccess={() => window.location.reload()} />

      <div>
        <h3 className="text-sm font-semibold text-white mb-3">UTMs Existentes</h3>
        <DataTable
          data={campaigns as unknown as Record<string, unknown>[]}
          columns={columns as unknown as { key: string; label: string; sortable?: boolean; render?: (row: Record<string, unknown>) => React.ReactNode }[]}
          searchKey={"source" as keyof Record<string, unknown>}
          searchPlaceholder="Buscar por source..."
          pageSize={20}
        />
      </div>
    </div>
  );
}
