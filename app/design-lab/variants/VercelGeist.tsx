"use client";

import { KPIS, ROWS, NAV } from "./mockData";

/**
 * Variante 5 — Vercel / Geist
 * Black puro, neutral total, jerarquía por contraste (no por color).
 * Geometría limpia, bordes 1px, mucho whitespace, monospace para numbers.
 * Vibe: SaaS B2B premium / vercel.com / linear minimal.
 */
export default function VercelGeist() {
  return (
    <div
      style={{
        minHeight: "calc(100vh - 56px)",
        background: "#000",
        color: "#EDEDED",
        fontFamily: "'Inter', -apple-system, sans-serif",
        display: "grid",
        gridTemplateColumns: "220px 1fr",
      }}
    >
      <aside
        style={{
          padding: "24px 12px",
          borderRight: "1px solid #1F1F1F",
          background: "#000",
          height: "fit-content",
          position: "sticky",
          top: 56,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", letterSpacing: "-0.03em", marginBottom: 24, padding: "0 8px", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 18, height: 18, background: "#fff", clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)" }} />
          ROMS
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {NAV.map((n, i) => (
            <button
              key={n.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 6,
                border: "none",
                background: i === 0 ? "#1F1F1F" : "transparent",
                color: i === 0 ? "#fff" : "#A1A1A1",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <span style={{ fontSize: 14, opacity: 0.7 }}>{n.icon}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main style={{ padding: "32px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <div style={{ fontSize: 12, color: "#A1A1A1", marginBottom: 4 }}>Mayo 2026 · Mes fiscal en curso</div>
            <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.04em", margin: 0, color: "#fff" }}>
              Dashboard
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={geistSecondary()}>Exportar</button>
            <button style={geistPrimary()}>+ Nueva venta</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 32 }}>
          {KPIS.map((k) => (
            <div key={k.label} style={geistCard()}>
              <div style={{ fontSize: 12, color: "#A1A1A1", fontWeight: 500, marginBottom: 10 }}>{k.label}</div>
              <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.04em", color: "#fff", fontFamily: "'Geist Mono', 'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums" }}>
                {k.value}
              </div>
              <div style={{ fontSize: 12, marginTop: 4, color: k.positive ? "#0AE448" : "#FF6363", fontVariantNumeric: "tabular-nums", display: "flex", alignItems: "center", gap: 4 }}>
                <span>{k.positive ? "↑" : "↓"}</span>
                <span>{k.delta.replace(/[+−-]/, "")}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ ...geistCard(), padding: 0 }}>
          <div style={{ padding: "16px 24px", borderBottom: "1px solid #1F1F1F", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>Ventas recientes</div>
            <div style={{ fontSize: 12, color: "#A1A1A1" }}>{ROWS.length} resultados · últimos 5 días</div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Cliente", "Programa", "Monto", "Closer", "Fecha"].map((h) => (
                  <th key={h} style={{ padding: "10px 24px", textAlign: "left", fontSize: 11, fontWeight: 500, color: "#A1A1A1", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #1F1F1F" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.name} style={{ borderBottom: "1px solid #1F1F1F" }}>
                  <td style={{ padding: "14px 24px", fontSize: 13, color: "#fff", fontWeight: 500 }}>{r.name}</td>
                  <td style={{ padding: "14px 24px", fontSize: 13, color: "#A1A1A1" }}>
                    <span style={{ padding: "3px 8px", borderRadius: 4, background: "#1F1F1F", border: "1px solid #2A2A2A", fontSize: 11 }}>
                      {r.program}
                    </span>
                  </td>
                  <td style={{ padding: "14px 24px", fontSize: 13, color: "#fff", fontWeight: 500, fontFamily: "'Geist Mono', 'JetBrains Mono', monospace", fontVariantNumeric: "tabular-nums" }}>
                    {r.amount}
                  </td>
                  <td style={{ padding: "14px 24px", fontSize: 13, color: "#A1A1A1" }}>{r.closer}</td>
                  <td style={{ padding: "14px 24px", fontSize: 13, color: "#A1A1A1", fontVariantNumeric: "tabular-nums" }}>{r.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function geistCard(): React.CSSProperties {
  return {
    background: "#0A0A0A",
    border: "1px solid #1F1F1F",
    borderRadius: 8,
    padding: 20,
  };
}

function geistPrimary(): React.CSSProperties {
  return {
    padding: "7px 16px",
    borderRadius: 6,
    border: "1px solid #fff",
    background: "#fff",
    color: "#000",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  };
}

function geistSecondary(): React.CSSProperties {
  return {
    padding: "7px 16px",
    borderRadius: 6,
    border: "1px solid #1F1F1F",
    background: "transparent",
    color: "#EDEDED",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  };
}
