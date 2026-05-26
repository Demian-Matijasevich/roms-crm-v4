"use client";

import { KPIS, ROWS, NAV } from "./mockData";

/**
 * Variante 3 — Linear Soft
 * Inspirado en linear.app: grises suaves, mono-acento azul cobalto,
 * tipografía sans con kerning negativo, mucho aire, sin glass.
 * Vibe: super profesional, calmo, alta densidad de info legible.
 */
export default function LinearSoft() {
  const ACCENT = "#5E6AD2";
  return (
    <div
      style={{
        minHeight: "calc(100vh - 56px)",
        background: "#08090C",
        color: "#E1E2E6",
        fontFamily: "'Inter', -apple-system, sans-serif",
        display: "grid",
        gridTemplateColumns: "240px 1fr",
      }}
    >
      <aside
        style={{
          padding: "24px 16px",
          borderRight: "1px solid #1A1B1E",
          background: "#0A0B0E",
          height: "fit-content",
          position: "sticky",
          top: 56,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", letterSpacing: "-0.02em", marginBottom: 24, padding: "0 8px" }}>
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
                padding: "7px 10px",
                borderRadius: 6,
                border: "none",
                background: i === 0 ? "#1A1B1E" : "transparent",
                color: i === 0 ? "#fff" : "#9DA0A8",
                fontSize: 13,
                fontWeight: 450,
                cursor: "pointer",
                textAlign: "left",
                transition: "background 100ms",
              }}
            >
              <span style={{ fontSize: 14, opacity: 0.7 }}>{n.icon}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main style={{ padding: 40 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", margin: 0, color: "#fff" }}>
              Dashboard
            </h1>
            <div style={{ fontSize: 13, color: "#7E8189", marginTop: 4 }}>Mayo 2026 — Fiscal en curso</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{ padding: "7px 14px", borderRadius: 6, border: "1px solid #1A1B1E", background: "transparent", color: "#9DA0A8", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
              Exportar
            </button>
            <button style={{ padding: "7px 14px", borderRadius: 6, border: "none", background: ACCENT, color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", boxShadow: "0 0 0 1px rgba(94,106,210,0.2), 0 1px 2px rgba(94,106,210,0.5)" }}>
              + Nueva venta
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, marginBottom: 32, background: "#1A1B1E", border: "1px solid #1A1B1E", borderRadius: 8, overflow: "hidden" }}>
          {KPIS.map((k) => (
            <div key={k.label} style={{ background: "#0A0B0E", padding: "20px 22px" }}>
              <div style={{ fontSize: 12, color: "#7E8189", fontWeight: 500, marginBottom: 8 }}>{k.label}</div>
              <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", color: "#fff" }}>{k.value}</div>
              <div style={{ fontSize: 12, marginTop: 4, color: k.positive ? "#5DC791" : "#E5484D", fontWeight: 500 }}>
                {k.delta}
              </div>
            </div>
          ))}
        </div>

        <div style={{ border: "1px solid #1A1B1E", borderRadius: 8, overflow: "hidden", background: "#0A0B0E" }}>
          <div style={{ padding: "14px 22px", borderBottom: "1px solid #1A1B1E", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Ventas recientes</div>
            <div style={{ fontSize: 12, color: "#7E8189" }}>{ROWS.length} resultados</div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Cliente", "Programa", "Monto", "Closer", "Fecha"].map((h) => (
                  <th key={h} style={{ padding: "8px 22px", textAlign: "left", fontSize: 11, fontWeight: 500, color: "#7E8189", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.name} style={{ borderTop: "1px solid #1A1B1E" }}>
                  <td style={{ padding: "11px 22px", fontSize: 13, color: "#E1E2E6", fontWeight: 500 }}>{r.name}</td>
                  <td style={{ padding: "11px 22px", fontSize: 13, color: "#9DA0A8" }}>{r.program}</td>
                  <td style={{ padding: "11px 22px", fontSize: 13, color: "#E1E2E6", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{r.amount}</td>
                  <td style={{ padding: "11px 22px", fontSize: 13, color: "#9DA0A8" }}>{r.closer}</td>
                  <td style={{ padding: "11px 22px", fontSize: 13, color: "#7E8189", fontVariantNumeric: "tabular-nums" }}>{r.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
