"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/app/components/Toast";

interface ReportRow {
  input: string;
  matches: number;
  matchedNames?: string[];
}

export default function BulkNichoClient() {
  const toast = useToast();
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [nicho, setNicho] = useState<"politica" | "general" | "otro">("politica");
  const [modo, setModo] = useState<"nombres" | "telefonos" | "lead_ids">("nombres");
  const [previewing, setPreviewing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [preview, setPreview] = useState<ReportRow[] | null>(null);
  const [result, setResult] = useState<{ updated: number; report: ReportRow[] } | null>(null);

  const items = texto
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  async function doPreview() {
    setPreviewing(true);
    setResult(null);
    try {
      // Buscar matches sin actualizar. Hacemos llamadas individuales via API.
      const filter: Record<string, string[]> = {};
      if (modo === "nombres") filter.nombres = items;
      else if (modo === "telefonos") filter.telefonos = items;
      else filter.lead_ids = items;

      const res = await fetch("/api/admin/bulk-nicho-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreview(data.report);
      } else {
        toast.error("Error al previsualizar");
      }
    } finally {
      setPreviewing(false);
    }
  }

  async function ejecutar() {
    if (items.length === 0) {
      toast.error("Pegá al menos 1 línea");
      return;
    }
    setProcessing(true);
    try {
      const filter: Record<string, string[]> = {};
      if (modo === "nombres") filter.nombres = items;
      else if (modo === "telefonos") filter.telefonos = items;
      else filter.lead_ids = items;

      const res = await fetch("/api/admin/bulk-nicho", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nicho, filter }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult({ updated: data.updated, report: data.report });
        toast.success(`${data.updated} leads marcados como ${nicho}`);
      } else {
        toast.error("Error al procesar");
      }
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">🏷 Bulk-tag por nicho</h1>
        <p className="text-sm text-[var(--muted)]">
          Pegá una lista y marcá todos los leads que coincidan con un nicho de una vez.
        </p>
      </div>

      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1.5">Nicho destino</label>
            <div className="flex gap-2">
              {(["politica", "general", "otro"] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setNicho(opt)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    nicho === opt
                      ? opt === "politica"
                        ? "bg-purple-500/20 border-purple-500/50 text-purple-300"
                        : opt === "general"
                        ? "bg-green-500/20 border-green-500/50 text-green-300"
                        : "bg-blue-500/20 border-blue-500/50 text-blue-300"
                      : "border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--muted)]"
                  }`}
                >
                  {opt === "politica" ? "🏛 Política" : opt === "general" ? "🛒 Normal" : "📦 Otro"}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-[var(--muted)] block mb-1.5">Buscar por</label>
            <div className="flex gap-2">
              {(["nombres", "telefonos", "lead_ids"] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setModo(opt)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    modo === opt
                      ? "bg-[var(--purple)]/20 border-[var(--purple)]/50 text-purple-300"
                      : "border-[var(--card-border)] text-[var(--muted)] hover:border-[var(--muted)]"
                  }`}
                >
                  {opt === "nombres" ? "Nombre" : opt === "telefonos" ? "Teléfono" : "UUID"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs text-[var(--muted)] block mb-1.5">
            Lista (1 por línea) — {items.length} líneas
          </label>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={
              modo === "nombres"
                ? "Juan Pérez\nMaría García\nCarlos López"
                : modo === "telefonos"
                ? "+54 11 1234-5678\n5491100001111"
                : "uuid-1\nuuid-2"
            }
            rows={10}
            className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-3 text-sm text-white font-mono"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={doPreview}
            disabled={previewing || items.length === 0}
            className="text-sm px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-[var(--card-border)] disabled:opacity-50"
          >
            {previewing ? "Buscando..." : "🔍 Previsualizar matches"}
          </button>
          <button
            onClick={ejecutar}
            disabled={processing || items.length === 0}
            className={`text-sm px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50 ${
              nicho === "politica"
                ? "bg-purple-500 hover:bg-purple-600"
                : nicho === "general"
                ? "bg-green-500 hover:bg-green-600"
                : "bg-blue-500 hover:bg-blue-600"
            }`}
          >
            {processing ? "Procesando..." : `Marcar como ${nicho === "politica" ? "🏛 Política" : nicho === "general" ? "🛒 Normal" : "📦 Otro"}`}
          </button>
        </div>
      </div>

      {/* Preview */}
      {preview && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-3">🔍 Preview de matches</h2>
          <div className="space-y-1 text-sm">
            {preview.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                  r.matches === 0 ? "bg-red-500/20 text-red-300" :
                  r.matches === 1 ? "bg-green-500/20 text-green-300" :
                  "bg-amber-500/20 text-amber-300"
                }`}>
                  {r.matches === 0 ? "✗" : r.matches === 1 ? "✓" : "⚠"}
                </span>
                <span className="text-white">{r.input}</span>
                <span className="text-[var(--muted)] text-xs">
                  {r.matches === 0 ? "sin match" : r.matches === 1 ? `→ ${r.matchedNames?.[0] || ""}` : `${r.matches} matches`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-green-500/5 border border-green-500/30 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-green-300 mb-3">
            ✅ {result.updated} leads marcados como {nicho}
          </h2>
          <div className="space-y-1 text-sm">
            {result.report.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={r.matches > 0 ? "text-green-300" : "text-red-300"}>
                  {r.matches > 0 ? "✓" : "✗"}
                </span>
                <span className="text-white">{r.input}</span>
                <span className="text-[var(--muted)]">{r.matches} matches</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              setTexto("");
              setResult(null);
              setPreview(null);
              router.refresh();
            }}
            className="mt-4 text-xs px-3 py-1.5 bg-white/5 text-[var(--muted)] hover:text-white rounded-lg"
          >
            Limpiar y cargar otra lista
          </button>
        </div>
      )}
    </div>
  );
}
