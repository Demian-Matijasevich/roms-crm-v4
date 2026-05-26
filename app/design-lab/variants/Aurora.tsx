"use client";

import { KPIS, ROWS, NAV } from "./mockData";

/**
 * Variante 2 — Aurora
 * Fondo con auroras coloridas animadas (blobs blureados), glass cards encima,
 * acentos violetas + cyan. Vibe: futurista, vivo, alta presencia visual.
 */
export default function Aurora() {
  return (
    <div
      style={{
        minHeight: "calc(100vh - 56px)",
        background: "#070712",
        color: "#E8E8F0",
        fontFamily: "'Inter', -apple-system, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Aurora blobs */}
      <div style={blobStyle({ background: "radial-gradient(circle, #8b5cf6, transparent 60%)", top: "-200px", left: "-200px", animationDelay: "0s" })} />
      <div style={blobStyle({ background: "radial-gradient(circle, #06b6d4, transparent 60%)", top: "30%", right: "-200px", animationDelay: "-4s" })} />
      <div style={blobStyle({ background: "radial-gradient(circle, #ec4899, transparent 60%)", bottom: "-200px", left: "30%", animationDelay: "-8s" })} />

      <div style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "260px 1fr" }}>
        {/* Sidebar */}
        <aside
          style={{
            margin: 16,
            padding: 20,
            borderRadius: 24,
            background: "rgba(20,20,40,0.5)",
            backdropFilter: "blur(30px)",
            WebkitBackdropFilter: "blur(30px)",
            border: "1px solid rgba(255,255,255,0.1)",
            height: "fit-content",
            position: "sticky",
            top: 80,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.04em", marginBottom: 24, background: "linear-gradient(90deg, #c084fc, #06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            ROMS CRM
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
                  background: i === 0 ? "linear-gradient(90deg, rgba(139,92,246,0.3), rgba(6,182,212,0.2))" : "transparent",
                  color: i === 0 ? "#fff" : "rgba(255,255,255,0.7)",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span>{n.icon}</span>
                <span>{n.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <main style={{ padding: "32px 32px 32px 8px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: "#c084fc", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700 }}>
                ✨ Mayo 2026
              </div>
              <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.04em", margin: "4px 0 0", background: "linear-gradient(90deg, #fff, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Hola, Mati
              </h1>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={auroraPrimary()}>+ Nueva venta</button>
              <button style={auroraSecondary()}>Exportar</button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
            {KPIS.map((k) => (
              <div key={k.label} style={auroraCard()}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>
                  {k.label}
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em" }}>{k.value}</div>
                <div style={{ fontSize: 11, fontWeight: 700, marginTop: 4, color: k.positive ? "#34d399" : "#fb7185" }}>
                  {k.delta} vs mes anterior
                </div>
              </div>
            ))}
          </div>

          <div style={{ ...auroraCard(), padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Ventas recientes</div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Cliente", "Programa", "Monto", "Closer", "Fecha"].map((h) => (
                    <th key={h} style={{ padding: "10px 20px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#c084fc", letterSpacing: "0.06em", textTransform: "uppercase" }}>
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
                    <td style={{ padding: "14px 20px", fontSize: 13, fontWeight: 700, color: "#34d399" }}>{r.amount}</td>
                    <td style={{ padding: "14px 20px", fontSize: 13, color: "rgba(255,255,255,0.7)" }}>{r.closer}</td>
                    <td style={{ padding: "14px 20px", fontSize: 13, color: "rgba(255,255,255,0.45)" }}>{r.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      <style>{`
        @keyframes drift {
          0%, 100% { transform: translate(0,0); }
          50% { transform: translate(50px, -30px); }
        }
      `}</style>
    </div>
  );
}

function blobStyle(extra: React.CSSProperties): React.CSSProperties {
  return {
    position: "absolute",
    width: 600,
    height: 600,
    filter: "blur(80px)",
    opacity: 0.5,
    animation: "drift 12s ease-in-out infinite",
    ...extra,
  };
}

function auroraCard(): React.CSSProperties {
  return {
    background: "rgba(20,20,40,0.4)",
    backdropFilter: "blur(30px) saturate(140%)",
    WebkitBackdropFilter: "blur(30px) saturate(140%)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 20,
    padding: 20,
    boxShadow: "0 16px 60px rgba(139,92,246,0.15)",
  };
}

function auroraPrimary(): React.CSSProperties {
  return {
    padding: "10px 18px",
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg, #8b5cf6, #06b6d4)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 8px 24px rgba(139,92,246,0.4)",
  };
}

function auroraSecondary(): React.CSSProperties {
  return {
    padding: "10px 18px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  };
}
