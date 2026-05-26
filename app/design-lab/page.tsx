"use client";

import { useState } from "react";
import IOSGlass from "./variants/IOSGlass";
import IOSGlassPlus from "./variants/IOSGlassPlus";
import IOSGlassPro from "./variants/IOSGlassPro";
import Aurora from "./variants/Aurora";
import LinearSoft from "./variants/LinearSoft";
import Editorial from "./variants/Editorial";
import VercelGeist from "./variants/VercelGeist";

const VARIANTS = [
  { id: "ios-pro", label: "iOS Glass v3 ⭐", desc: "v2 + semaforización rojo/verde, cobranzas semaforizadas, equipo online, sidebar collapse, mesh animado", component: IOSGlassPro },
  { id: "ios-plus", label: "iOS Glass v2", desc: "Iconos SVG, segmented, avatares, FAB, dynamic island", component: IOSGlassPlus },
  { id: "ios", label: "iOS Glass v1", desc: "Frosted glass base — la versión inicial", component: IOSGlass },
  { id: "aurora", label: "Aurora", desc: "Glass + auroras coloridas en el fondo, vivo y moderno", component: Aurora },
  { id: "linear", label: "Linear Soft", desc: "Gris suave, mono-acento, mucho aire — estilo Linear / Vercel", component: LinearSoft },
  { id: "editorial", label: "Editorial", desc: "Notion-luxe oscuro, dorado champagne, tipografía editorial", component: Editorial },
  { id: "geist", label: "Vercel Geist", desc: "Black puro, neutro, jerarquía por contraste — estilo Vercel", component: VercelGeist },
] as const;

export default function DesignLabPage() {
  const [active, setActive] = useState<typeof VARIANTS[number]["id"]>("ios-pro");
  const ActiveComp = VARIANTS.find((v) => v.id === active)?.component || IOSGlassPro;

  return (
    <div style={{ background: "#000", minHeight: "100vh" }}>
      {/* Switcher fijo arriba */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(0,0,0,0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          padding: "12px 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#fff", letterSpacing: "-0.02em" }}>
            🎨 Design Lab
          </span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {VARIANTS.map((v) => (
              <button
                key={v.id}
                onClick={() => setActive(v.id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 500,
                  border: "1px solid",
                  borderColor: active === v.id ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.1)",
                  background: active === v.id ? "rgba(255,255,255,0.1)" : "transparent",
                  color: active === v.id ? "#fff" : "#a1a1aa",
                  cursor: "pointer",
                  transition: "all 200ms",
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 11, color: "#71717a", marginLeft: "auto" }}>
            {VARIANTS.find((v) => v.id === active)?.desc}
          </span>
        </div>
      </div>

      {/* Render variante */}
      <ActiveComp />
    </div>
  );
}
