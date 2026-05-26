"use client";

import { KPIS, ROWS, NAV } from "./mockData";

/**
 * Variante 1 — iOS Glass
 * Frosted glass cards, gradiente sutil multicolor de fondo, bordes invisibles,
 * tipografía SF-like, sombras muy suaves. Vibe: iPhone settings + Notion premium.
 */
export default function IOSGlass() {
  return (
    <div
      style={{
        minHeight: "calc(100vh - 56px)",
        background:
          "radial-gradient(1200px 800px at 0% 0%, rgba(120,80,255,0.35), transparent 60%), radial-gradient(1000px 700px at 100% 100%, rgba(30,180,255,0.30), transparent 60%), linear-gradient(180deg, #0a0a14 0%, #06060c 100%)",
        color: "#ECEDF0",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif",
        display: "grid",
        gridTemplateColumns: "260px 1fr",
      }}
    >
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
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 24 }}>
          ROMS<span style={{ opacity: 0.5 }}> CRM</span>
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV.map((n, i) => (
            <button
              key={n.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderRadius: 12,
                border: "none",
                background: i === 0 ? "rgba(255,255,255,0.08)" : "transparent",
                color: i === 0 ? "#fff" : "rgba(255,255,255,0.65)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                textAlign: "left",
                transition: "all 200ms",
              }}
            >
              <span style={{ fontSize: 14 }}>{n.icon}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main style={{ padding: "32px 32px 32px 8px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", letterSpacing: "0.04em", textTransform: "uppercase", fontWeight: 600 }}>
              Mayo 2026
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.04em", margin: "4px 0 0" }}>
              Hola, Mati
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={primaryBtnStyle()}>+ Nueva venta</button>
            <button style={secondaryBtnStyle()}>Exportar</button>
          </div>
        </div>

        {/* KPI grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          {KPIS.map((k) => (
            <div key={k.label} style={glassCard({ padding: 20 })}>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", fontWeight: 500, marginBottom: 6 }}>
                {k.label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em" }}>{k.value}</div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  marginTop: 4,
                  color: k.positive ? "#7CFFB2" : "#FF8A8A",
                }}
              >
                {k.delta} vs mes anterior
              </div>
            </div>
          ))}
        </div>

        {/* Tabla */}
        <div style={{ ...glassCard({ padding: 0 }), overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>Ventas recientes</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{ROWS.length} cerrados este mes</div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                {["Cliente", "Programa", "Monto", "Closer", "Fecha"].map((h) => (
                  <th key={h} style={{ padding: "10px 20px", textAlign: "left", fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.45)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.name} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "14px 20px", fontSize: 13, fontWeight: 500 }}>{r.name}</td>
                  <td style={{ padding: "14px 20px", fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{r.program}</td>
                  <td style={{ padding: "14px 20px", fontSize: 13, fontWeight: 600, color: "#7CFFB2" }}>{r.amount}</td>
                  <td style={{ padding: "14px 20px", fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{r.closer}</td>
                  <td style={{ padding: "14px 20px", fontSize: 13, color: "rgba(255,255,255,0.45)" }}>{r.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom row */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginTop: 24 }}>
          <div style={glassCard({ padding: 20 })}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Cash collected diario</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
              {[40, 65, 35, 80, 55, 90, 70, 95, 60, 110, 75, 130, 100, 85].map((h, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: `${h}px`,
                    borderRadius: "6px 6px 2px 2px",
                    background: "linear-gradient(180deg, rgba(140,200,255,0.9), rgba(120,80,255,0.5))",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3)",
                  }}
                />
              ))}
            </div>
          </div>
          <div style={glassCard({ padding: 20 })}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Asistente IA</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.5 }}>
              Vendiste un <b style={{ color: "#fff" }}>34% más</b> que el mes pasado. Top closer: Valentino.
            </div>
            <button style={{ ...primaryBtnStyle(), marginTop: 14, width: "100%" }}>Preguntar algo</button>
          </div>
        </div>
      </main>
    </div>
  );
}

function glassCard(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(40px) saturate(180%)",
    WebkitBackdropFilter: "blur(40px) saturate(180%)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 20,
    boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)",
    ...extra,
  };
}

function primaryBtnStyle(): React.CSSProperties {
  return {
    padding: "9px 16px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.08))",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.2)",
  };
}

function secondaryBtnStyle(): React.CSSProperties {
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
