"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface LeadResult {
  id: string;
  nombre: string;
  instagram: string | null;
  email: string | null;
  estado: string;
}

interface ClientResult {
  id: string;
  nombre: string;
  email: string | null;
  programa: string | null;
  estado: string;
}

interface PaymentResult {
  id: string;
  lead_id: string | null;
  client_id: string | null;
  monto_usd: number;
  estado: string;
  fecha_pago: string | null;
  leads: { nombre: string };
}

interface SearchResults {
  leads: LeadResult[];
  clients: ClientResult[];
  payments: PaymentResult[];
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({ leads: [], clients: [], payments: [] });
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Flatten results for keyboard navigation
  const flatItems: { type: string; label: string; sub: string; href: string }[] = [];
  results.leads.forEach((l) =>
    flatItems.push({
      type: "lead",
      label: l.nombre,
      sub: [l.instagram, l.email, l.estado].filter(Boolean).join(" - "),
      href: `/pipeline?lead=${l.id}`,
    })
  );
  results.clients.forEach((c) =>
    flatItems.push({
      type: "client",
      label: c.nombre,
      sub: [c.programa, c.estado].filter(Boolean).join(" - "),
      href: `/clientes/${c.id}`,
    })
  );
  results.payments.forEach((p) =>
    flatItems.push({
      type: "payment",
      label: `$${p.monto_usd} - ${p.leads?.nombre ?? "---"}`,
      sub: [p.estado, p.fecha_pago].filter(Boolean).join(" - "),
      href: p.client_id ? `/clientes/${p.client_id}` : `/pipeline?lead=${p.lead_id}`,
    })
  );

  // Global keyboard shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults({ leads: [], clients: [], payments: [] });
      setSelectedIdx(0);
    }
  }, [open]);

  // Debounced search
  const search = useCallback(async (term: string) => {
    if (term.length < 2) {
      setResults({ leads: [], clients: [], payments: [] });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data);
        setSelectedIdx(0);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  function handleQueryChange(val: string) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  }

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && flatItems[selectedIdx]) {
      navigate(flatItems[selectedIdx].href);
    }
  }

  if (!open) return null;

  const hasResults = flatItems.length > 0;
  const showEmpty = query.length >= 2 && !loading && !hasResults;

  // Group indices for section headers
  const leadsStart = 0;
  const clientsStart = results.leads.length;
  const paymentsStart = clientsStart + results.clients.length;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--card-border)]">
          <svg className="w-5 h-5 text-[var(--muted)] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar leads, clientes, pagos..."
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-[var(--muted)]"
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] text-[var(--muted)] bg-white/5 border border-[var(--card-border)] rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {loading && (
            <div className="px-4 py-6 text-center text-sm text-[var(--muted)]">Buscando...</div>
          )}

          {showEmpty && (
            <div className="px-4 py-6 text-center text-sm text-[var(--muted)]">Sin resultados para &quot;{query}&quot;</div>
          )}

          {hasResults && (
            <div className="py-2">
              {/* Leads */}
              {results.leads.length > 0 && (
                <>
                  <p className="px-4 py-1 text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider">Leads</p>
                  {results.leads.map((l, i) => {
                    const idx = leadsStart + i;
                    return (
                      <button
                        key={`lead-${l.id}`}
                        onClick={() => navigate(flatItems[idx].href)}
                        onMouseEnter={() => setSelectedIdx(idx)}
                        className={`w-full text-left px-4 py-2 flex items-center justify-between text-sm transition-colors ${
                          selectedIdx === idx ? "bg-[var(--purple)]/15 text-white" : "text-[var(--muted)] hover:bg-white/5"
                        }`}
                      >
                        <span className="text-white font-medium">{l.nombre}</span>
                        <span className="text-xs">{[l.instagram, l.estado].filter(Boolean).join(" - ")}</span>
                      </button>
                    );
                  })}
                </>
              )}

              {/* Clients */}
              {results.clients.length > 0 && (
                <>
                  <p className="px-4 py-1 text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider mt-1">Clientes</p>
                  {results.clients.map((c, i) => {
                    const idx = clientsStart + i;
                    return (
                      <button
                        key={`client-${c.id}`}
                        onClick={() => navigate(flatItems[idx].href)}
                        onMouseEnter={() => setSelectedIdx(idx)}
                        className={`w-full text-left px-4 py-2 flex items-center justify-between text-sm transition-colors ${
                          selectedIdx === idx ? "bg-[var(--purple)]/15 text-white" : "text-[var(--muted)] hover:bg-white/5"
                        }`}
                      >
                        <span className="text-white font-medium">{c.nombre}</span>
                        <span className="text-xs">{[c.programa, c.estado].filter(Boolean).join(" - ")}</span>
                      </button>
                    );
                  })}
                </>
              )}

              {/* Payments */}
              {results.payments.length > 0 && (
                <>
                  <p className="px-4 py-1 text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wider mt-1">Pagos</p>
                  {results.payments.map((p, i) => {
                    const idx = paymentsStart + i;
                    return (
                      <button
                        key={`payment-${p.id}`}
                        onClick={() => navigate(flatItems[idx].href)}
                        onMouseEnter={() => setSelectedIdx(idx)}
                        className={`w-full text-left px-4 py-2 flex items-center justify-between text-sm transition-colors ${
                          selectedIdx === idx ? "bg-[var(--purple)]/15 text-white" : "text-[var(--muted)] hover:bg-white/5"
                        }`}
                      >
                        <span className="text-white font-medium">${p.monto_usd} - {p.leads?.nombre ?? "---"}</span>
                        <span className="text-xs">{[p.estado, p.fecha_pago].filter(Boolean).join(" - ")}</span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
