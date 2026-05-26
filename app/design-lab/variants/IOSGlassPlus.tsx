"use client";

import { useState } from "react";
import { KPIS, ROWS, NAV } from "./mockData";

/**
 * iOS Glass — V2
 * Upgrades sobre el original:
 *  • Hover lift + spring transitions en cards
 *  • Iconos SVG (no emojis) consistentes
 *  • Avatares con gradiente único por persona
 *  • Segmented control estilo iOS
 *  • Search bar con icon embedded
 *  • Pills/badges con backdrop-blur
 *  • Chart con gradiente vertical + glow sutil
 *  • Quick action button flotante (FAB) con elevation
 *  • Dynamic Island como toast / notif
 *  • Tipografía más afinada (tracking + weights variables)
 */
export default function IOSGlassPlus() {
  const [tab, setTab] = useState<"hoy" | "semana" | "mes">("mes");
  const [showIsland, setShowIsland] = useState(false);

  return (
    <div
      style={{
        minHeight: "calc(100vh - 56px)",
        background:
          "radial-gradient(1200px 800px at 0% 0%, rgba(120,80,255,0.30), transparent 60%), radial-gradient(1000px 700px at 100% 100%, rgba(30,180,255,0.25), transparent 60%), radial-gradient(600px 500px at 50% 80%, rgba(255,80,200,0.10), transparent 60%), linear-gradient(180deg, #0a0a14 0%, #06060c 100%)",
        color: "#ECEDF0",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif",
        display: "grid",
        gridTemplateColumns: "260px 1fr",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Dynamic Island estilo notif */}
      {showIsland && (
        <div
          style={{
            position: "fixed",
            top: 72,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            background: "rgba(20,20,30,0.85)",
            backdropFilter: "blur(40px) saturate(180%)",
            WebkitBackdropFilter: "blur(40px) saturate(180%)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 100,
            padding: "10px 20px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
            animation: "islandIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#7CFFB2", boxShadow: "0 0 8px #7CFFB2" }} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>Pago recibido · Valentino · $18.000</span>
        </div>
      )}

      {/* Sidebar */}
      <aside
        style={{
          margin: 16,
          padding: 20,
          borderRadius: 24,
          background: "rgba(255,255,255,0.04)",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
          border: "1px solid rgba(255,255,255,0.08)",
          height: "fit-content",
          position: "sticky",
          top: 80,
          boxShadow: "0 16px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: "linear-gradient(135deg, #c084fc, #06b6d4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 800, color: "#fff",
            boxShadow: "0 4px 14px rgba(192,132,252,0.4)",
          }}>
            R
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.02em" }}>ROMS</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", letterSpacing: "0.04em", textTransform: "uppercase" }}>Consultora</div>
          </div>
        </div>

        {/* Search */}
        <div style={{
          position: "relative", marginBottom: 16,
          background: "rgba(0,0,0,0.25)", borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.05)",
          padding: "8px 12px 8px 34px",
        }}>
          <Icon name="search" size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }} />
          <input placeholder="Buscar..." style={{ background: "transparent", border: "none", outline: "none", fontSize: 13, color: "#fff", width: "100%", fontFamily: "inherit" }} />
          <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)", padding: "1px 5px", borderRadius: 4 }}>⌘K</span>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map((n, i) => (
            <NavBtn key={n.label} icon={navIcon(i)} label={n.label} active={i === 0} badge={i === 2 ? 3 : undefined} />
          ))}
        </nav>

        {/* User card */}
        <div style={{
          marginTop: 20, padding: 12, borderRadius: 12,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.05)",
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <Avatar name="Mati Coria" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Mati Coria</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>Admin · Plan Pro</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ padding: "32px 32px 80px 8px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
              Mes fiscal · 08 may → 07 jun
            </div>
            <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.04em", margin: "4px 0 0" }}>
              Buenas, Mati
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setShowIsland(true); setTimeout(() => setShowIsland(false), 3000); }} style={primaryBtn()}>
              + Nueva venta
            </button>
            <button style={secondaryBtn()}>Exportar</button>
          </div>
        </div>

        {/* Segmented control (iOS-style) */}
        <div style={segmentedWrap()}>
          <SegBtn label="Hoy" active={tab === "hoy"} onClick={() => setTab("hoy")} />
          <SegBtn label="Esta semana" active={tab === "semana"} onClick={() => setTab("semana")} />
          <SegBtn label="Este mes" active={tab === "mes"} onClick={() => setTab("mes")} />
        </div>

        {/* KPI grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24, marginTop: 16 }}>
          {KPIS.map((k, idx) => (
            <KpiCard key={k.label} kpi={k} index={idx} />
          ))}
        </div>

        {/* Bottom row */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
          {/* Chart */}
          <div style={glassCard({ padding: 24 })}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>Cash diario</div>
              <div style={{ display: "flex", gap: 6 }}>
                <Chip>USD</Chip>
                <Chip active>14 días</Chip>
              </div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em" }}>$48.230</div>
            <div style={{ fontSize: 11, color: "#7CFFB2", fontWeight: 600, marginBottom: 16 }}>+12,4% vs mes anterior</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 140, marginTop: 4 }}>
              {[40, 65, 35, 80, 55, 90, 70, 95, 60, 110, 75, 130, 100, 85].map((h, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${h}px`,
                    borderRadius: "8px 8px 3px 3px",
                    background: "linear-gradient(180deg, rgba(140,200,255,0.95) 0%, rgba(120,80,255,0.6) 60%, rgba(120,80,255,0.0) 100%)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), 0 2px 12px rgba(120,80,255,0.25)",
                    position: "relative",
                    transition: "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = "scaleY(1.05)")}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = "scaleY(1)")}
                />
              ))}
            </div>
          </div>

          {/* Asistente IA */}
          <div style={glassCard({ padding: 20 })}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg, #c084fc, #06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                ✨
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Asistente IA</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>Tu data del mes</div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.55, marginBottom: 14 }}>
              Vendiste un <b style={{ color: "#fff" }}>34% más</b> que abril. Top closer: <b style={{ color: "#fff" }}>Valentino</b>. 5 cobranzas vencen mañana.
            </div>
            <button style={{ ...primaryBtn(), width: "100%", justifyContent: "center", display: "flex", alignItems: "center", gap: 8 }}>
              Preguntar
              <Icon name="arrow-right" size={14} />
            </button>
          </div>
        </div>

        {/* Tabla */}
        <div style={{ ...glassCard({ padding: 0 }), overflow: "hidden", marginTop: 14 }}>
          <div style={{ padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>Ventas recientes</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{ROWS.length} cerrados este mes</div>
            </div>
            <button style={secondaryBtn()}>Ver todo</button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                {["Cliente", "Programa", "Monto", "Closer", "Fecha"].map((h) => (
                  <th key={h} style={{ padding: "10px 24px", textAlign: "left", fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.name} style={{ borderTop: "1px solid rgba(255,255,255,0.04)", transition: "background 150ms" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.025)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <td style={{ padding: "14px 24px", fontSize: 13, fontWeight: 500 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar name={r.name} size={28} />
                      <span>{r.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: "14px 24px", fontSize: 13 }}>
                    <Pill program={r.program} />
                  </td>
                  <td style={{ padding: "14px 24px", fontSize: 13, fontWeight: 600, color: "#7CFFB2", fontVariantNumeric: "tabular-nums" }}>{r.amount}</td>
                  <td style={{ padding: "14px 24px", fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{r.closer}</td>
                  <td style={{ padding: "14px 24px", fontSize: 13, color: "rgba(255,255,255,0.45)", fontVariantNumeric: "tabular-nums" }}>{r.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* FAB */}
      <button
        style={{
          position: "fixed",
          bottom: 28,
          right: 28,
          width: 56,
          height: 56,
          borderRadius: 28,
          border: "1px solid rgba(255,255,255,0.18)",
          background: "linear-gradient(135deg, rgba(140,200,255,0.95), rgba(120,80,255,0.85))",
          color: "#fff",
          fontSize: 24,
          fontWeight: 300,
          cursor: "pointer",
          boxShadow: "0 12px 40px rgba(120,80,255,0.5), inset 0 1px 0 rgba(255,255,255,0.3)",
          transition: "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          zIndex: 50,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.08)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        aria-label="Carga rápida"
      >
        +
      </button>

      <style>{`
        @keyframes islandIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-20px) scale(0.6); }
          to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

// ───── helpers ─────

function glassCard(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(40px) saturate(180%)",
    WebkitBackdropFilter: "blur(40px) saturate(180%)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 20,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)",
    transition: "transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 250ms",
    ...extra,
  };
}

function primaryBtn(): React.CSSProperties {
  return {
    padding: "9px 16px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06))",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.2)",
    transition: "transform 200ms",
  };
}

function secondaryBtn(): React.CSSProperties {
  return {
    padding: "9px 16px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  };
}

function segmentedWrap(): React.CSSProperties {
  return {
    display: "inline-flex",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 10,
    padding: 3,
    gap: 2,
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
  };
}

function SegBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 7,
        border: "none",
        background: active ? "rgba(255,255,255,0.12)" : "transparent",
        color: active ? "#fff" : "rgba(255,255,255,0.6)",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        boxShadow: active ? "0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.1)" : "none",
        transition: "all 200ms",
      }}
    >
      {label}
    </button>
  );
}

function KpiCard({ kpi, index }: { kpi: typeof KPIS[number]; index: number }) {
  return (
    <div
      style={glassCard({ padding: 20, cursor: "pointer" })}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 12px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {kpi.label}
        </div>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: kpiIconBg(index), display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={kpiIcon(index)} size={14} />
        </div>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>
        {kpi.value}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4, color: kpi.positive ? "#7CFFB2" : "#FF8A8A" }}>
        {kpi.delta} <span style={{ color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>vs mes ant.</span>
      </div>
    </div>
  );
}

function NavBtn({ icon, label, active, badge }: { icon: string; label: string; active: boolean; badge?: number }) {
  return (
    <button
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "9px 12px",
        borderRadius: 10,
        border: "none",
        background: active ? "rgba(255,255,255,0.08)" : "transparent",
        color: active ? "#fff" : "rgba(255,255,255,0.65)",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        textAlign: "left",
        transition: "all 150ms",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <Icon name={icon} size={16} style={{ opacity: active ? 1 : 0.7 }} />
      <span style={{ flex: 1 }}>{label}</span>
      {badge != null && (
        <span style={{
          background: "#FF3B30", color: "#fff",
          fontSize: 10, fontWeight: 700,
          padding: "1px 6px", borderRadius: 10, minWidth: 18, textAlign: "center",
        }}>
          {badge}
        </span>
      )}
    </button>
  );
}

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  // Gradiente único determinístico por nombre
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 60) % 360;
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div
      style={{
        width: size, height: size, borderRadius: "50%",
        background: `linear-gradient(135deg, hsl(${h1}, 70%, 60%), hsl(${h2}, 70%, 50%))`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: size * 0.4, fontWeight: 700, color: "#fff",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      {initials}
    </div>
  );
}

function Pill({ program }: { program: string }) {
  const colors: Record<string, string> = {
    "Omnipresencia": "rgba(192,132,252,0.15)",
    "Multicuentas": "rgba(34,197,94,0.15)",
    "Consultoría": "rgba(6,182,212,0.15)",
  };
  const borders: Record<string, string> = {
    "Omnipresencia": "rgba(192,132,252,0.35)",
    "Multicuentas": "rgba(34,197,94,0.35)",
    "Consultoría": "rgba(6,182,212,0.35)",
  };
  return (
    <span style={{
      fontSize: 11, fontWeight: 600,
      padding: "3px 9px", borderRadius: 100,
      background: colors[program] || "rgba(255,255,255,0.06)",
      border: `1px solid ${borders[program] || "rgba(255,255,255,0.1)"}`,
      color: "rgba(255,255,255,0.9)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
    }}>
      {program}
    </span>
  );
}

function Chip({ children, active }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600,
      padding: "4px 8px", borderRadius: 6,
      background: active ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
      border: `1px solid ${active ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)"}`,
      color: active ? "#fff" : "rgba(255,255,255,0.6)",
      cursor: "pointer",
    }}>
      {children}
    </span>
  );
}

// ───── icons (SVG inline, sin dependencias) ─────

function Icon({ name, size = 16, style }: { name: string; size?: number; style?: React.CSSProperties }) {
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, style };
  switch (name) {
    case "search": return <svg {...props}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>;
    case "dashboard": return <svg {...props}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>;
    case "phone": return <svg {...props}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>;
    case "list": return <svg {...props}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>;
    case "money": return <svg {...props}><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>;
    case "chart": return <svg {...props}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>;
    case "sparkles": return <svg {...props}><path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5z" /><path d="M19 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" /></svg>;
    case "arrow-right": return <svg {...props}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>;
    case "trending-up": return <svg {...props}><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>;
    case "refresh": return <svg {...props}><path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.8 1 6.4 2.6L21 8" /><polyline points="21 3 21 8 16 8" /></svg>;
    default: return <svg {...props}><circle cx="12" cy="12" r="8" /></svg>;
  }
}

function navIcon(i: number): string {
  return ["dashboard", "phone", "list", "money", "chart", "sparkles"][i] || "dashboard";
}

function kpiIcon(i: number): string {
  return ["money", "trending-up", "refresh", "chart"][i] || "chart";
}

function kpiIconBg(i: number): string {
  return [
    "linear-gradient(135deg, rgba(34,197,94,0.25), rgba(34,197,94,0.05))",
    "linear-gradient(135deg, rgba(192,132,252,0.25), rgba(192,132,252,0.05))",
    "linear-gradient(135deg, rgba(255,138,138,0.25), rgba(255,138,138,0.05))",
    "linear-gradient(135deg, rgba(96,165,250,0.25), rgba(96,165,250,0.05))",
  ][i] || "rgba(255,255,255,0.05)";
}
