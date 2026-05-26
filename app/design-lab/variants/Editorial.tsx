"use client";

import { KPIS, ROWS, NAV } from "./mockData";

/**
 * Variante 4 — Editorial
 * Notion-luxe oscuro, acentos champagne/dorado, tipografía editorial
 * (serif para headings, sans para body), mucho whitespace, líneas finas.
 * Vibe: revista premium / boutique consultancy.
 */
export default function Editorial() {
  const GOLD = "#D4B07A";
  return (
    <div
      style={{
        minHeight: "calc(100vh - 56px)",
        background: "#0F0E0C",
        color: "#E8E2D8",
        fontFamily: "'Inter', sans-serif",
        display: "grid",
        gridTemplateColumns: "240px 1fr",
      }}
    >
      <aside
        style={{
          padding: 32,
          borderRight: "1px solid #1F1D1A",
          height: "fit-content",
          position: "sticky",
          top: 56,
        }}
      >
        <div style={{ fontFamily: "'Georgia', serif", fontSize: 22, fontWeight: 400, letterSpacing: "-0.01em", marginBottom: 32, fontStyle: "italic" }}>
          ROMS <span style={{ color: GOLD }}>·</span> CRM
        </div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map((n, i) => (
            <button
              key={n.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                border: "none",
                background: "transparent",
                color: i === 0 ? GOLD : "rgba(232,226,216,0.6)",
                fontSize: i === 0 ? 11 : 13,
                fontWeight: i === 0 ? 600 : 400,
                cursor: "pointer",
                textAlign: "left",
                borderBottom: i === 0 ? `1px solid ${GOLD}` : "1px solid transparent",
                letterSpacing: i === 0 ? "0.04em" : "normal",
                textTransform: i === 0 ? "uppercase" : "none",
              }}
            >
              <span>{n.icon}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main style={{ padding: "56px 64px" }}>
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 11, color: GOLD, letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>
            — Reporte · Mayo MMXXVI
          </div>
          <h1 style={{ fontFamily: "'Georgia', serif", fontSize: 56, fontWeight: 400, letterSpacing: "-0.04em", lineHeight: 1, margin: 0, fontStyle: "italic", color: "#F5EFE3" }}>
            Buenas, Mati.
          </h1>
          <div style={{ fontSize: 15, color: "rgba(232,226,216,0.55)", marginTop: 12, maxWidth: 560, lineHeight: 1.6 }}>
            El mes viene fuerte. Vendiste un 12% más que el mes pasado y cerraste el ratio más alto del trimestre. Las cobranzas vienen al día.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 32, marginBottom: 56 }}>
          {KPIS.map((k) => (
            <div key={k.label} style={{ borderTop: `1px solid ${GOLD}40`, paddingTop: 20 }}>
              <div style={{ fontSize: 11, color: "rgba(232,226,216,0.5)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600, marginBottom: 12 }}>
                {k.label}
              </div>
              <div style={{ fontFamily: "'Georgia', serif", fontSize: 42, fontWeight: 400, letterSpacing: "-0.03em", color: "#F5EFE3", lineHeight: 1 }}>
                {k.value}
              </div>
              <div style={{ fontSize: 12, marginTop: 10, color: k.positive ? "#9FBC85" : "#C97F7F", letterSpacing: "0.04em", fontWeight: 500 }}>
                {k.delta} <span style={{ color: "rgba(232,226,216,0.4)" }}>vs mes anterior</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "'Georgia', serif", fontSize: 28, fontStyle: "italic", color: "#F5EFE3", marginBottom: 4 }}>
            Ventas recientes
          </div>
          <div style={{ fontSize: 12, color: "rgba(232,226,216,0.5)", letterSpacing: "0.06em" }}>
            {ROWS.length} clientes cerrados este mes
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${GOLD}` }}>
              {["Cliente", "Programa", "Monto", "Closer", "Fecha"].map((h) => (
                <th key={h} style={{ padding: "12px 8px", textAlign: "left", fontSize: 10, fontWeight: 600, color: GOLD, letterSpacing: "0.14em", textTransform: "uppercase" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.name} style={{ borderBottom: "1px solid #1F1D1A" }}>
                <td style={{ padding: "20px 8px", fontFamily: "'Georgia', serif", fontSize: 18, color: "#F5EFE3", fontWeight: 400 }}>{r.name}</td>
                <td style={{ padding: "20px 8px", fontSize: 13, color: "rgba(232,226,216,0.65)", fontStyle: "italic" }}>{r.program}</td>
                <td style={{ padding: "20px 8px", fontSize: 16, color: GOLD, fontFamily: "'Georgia', serif", fontVariantNumeric: "tabular-nums" }}>{r.amount}</td>
                <td style={{ padding: "20px 8px", fontSize: 12, color: "rgba(232,226,216,0.65)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{r.closer}</td>
                <td style={{ padding: "20px 8px", fontSize: 12, color: "rgba(232,226,216,0.45)", fontVariantNumeric: "tabular-nums", letterSpacing: "0.06em" }}>{r.date}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 56, display: "flex", gap: 12 }}>
          <button style={{ padding: "12px 28px", border: `1px solid ${GOLD}`, background: GOLD, color: "#0F0E0C", fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer" }}>
            Nueva venta
          </button>
          <button style={{ padding: "12px 28px", border: `1px solid ${GOLD}40`, background: "transparent", color: GOLD, fontSize: 11, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer" }}>
            Exportar reporte
          </button>
        </div>
      </main>
    </div>
  );
}
