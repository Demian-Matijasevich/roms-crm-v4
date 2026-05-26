"use client";

import { useState, useEffect, useRef } from "react";
import { KPIS, ROWS, NAV } from "./mockData";

/**
 * iOS Glass — V3 PRO
 * Suma sobre v2: semaforización, sidebar collapse, equipo online, dynamic island,
 * particle noise, tooltips chart, skeleton shimmer, empty state SVG, light mode,
 * CMD+K spotlight, page transitions, mesh animado.
 */

type Pal = {
  bg: string; text: string; textMuted: string; textSubtle: string;
  cardBg: string; cardBorder: string; inputBg: string; overlay: string;
  meshA: string; meshB: string; meshC: string; sidebarBorder: string;
  barTopFill: string; barMidFill: string; barBottomFill: string; barGlow: string;
};
const PALETTES: Record<"dark" | "light", Pal> = {
  dark: {
    bg: "#06060c",
    text: "#ECEDF0",
    textMuted: "rgba(255,255,255,0.55)",
    textSubtle: "rgba(255,255,255,0.40)",
    cardBg: "rgba(255,255,255,0.04)",
    cardBorder: "rgba(255,255,255,0.08)",
    inputBg: "rgba(0,0,0,0.25)",
    overlay: "rgba(20,20,30,0.85)",
    meshA: "rgba(120,80,255,0.30)",
    meshB: "rgba(30,180,255,0.22)",
    meshC: "rgba(255,80,200,0.12)",
    sidebarBorder: "#0a0a14",
    barTopFill: "rgba(140,200,255,0.95)",
    barMidFill: "rgba(120,80,255,0.6)",
    barBottomFill: "rgba(120,80,255,0)",
    barGlow: "rgba(120,80,255,0.25)",
  },
  light: {
    bg: "#F2F3F8",
    text: "#1B1D24",
    textMuted: "rgba(20,20,40,0.62)",
    textSubtle: "rgba(20,20,40,0.42)",
    cardBg: "rgba(255,255,255,0.65)",
    cardBorder: "rgba(20,20,40,0.08)",
    inputBg: "rgba(255,255,255,0.85)",
    overlay: "rgba(255,255,255,0.85)",
    meshA: "rgba(120,80,255,0.18)",
    meshB: "rgba(30,180,255,0.16)",
    meshC: "rgba(255,80,200,0.10)",
    sidebarBorder: "#F2F3F8",
    barTopFill: "rgba(80,120,255,0.95)",
    barMidFill: "rgba(120,80,255,0.7)",
    barBottomFill: "rgba(120,80,255,0)",
    barGlow: "rgba(80,120,255,0.30)",
  },
};

const ACCENTS = {
  green: "#34D399",
  red: "#FB7185",
  yellow: "#FBBF24",
  orange: "#FB923C",
  blue: "#60A5FA",
  purple: "#A78BFA",
  cyan: "#22D3EE",
} as const;

const COBRANZAS = [
  { client: "Marco Ferreiro", amount: 1200, dueIn: -3, status: "vencido" as const, cuota: 2 },
  { client: "Mariano Fraschieri", amount: 5000, dueIn: -1, status: "vencido" as const, cuota: 1 },
  { client: "Sofía Vichich", amount: 1500, dueIn: 2, status: "urgente" as const, cuota: 3 },
  { client: "Mauricio Zagan", amount: 8000, dueIn: 5, status: "urgente" as const, cuota: 2 },
  { client: "Alberto Weretilneck", amount: 10000, dueIn: 12, status: "proximo" as const, cuota: 2 },
  { client: "Moni Bega", amount: 3760, dueIn: 18, status: "ok" as const, cuota: 2 },
];

const TEAM_ONLINE = [
  { name: "Valentino", role: "Closer", online: true, activeLeads: 12 },
  { name: "Agustín", role: "Closer", online: true, activeLeads: 8 },
  { name: "Juan Martín", role: "Closer", online: false, activeLeads: 5 },
  { name: "Guille", role: "Setter", online: true, activeLeads: 14 },
  { name: "Igna", role: "Setter", online: false, activeLeads: 9 },
];

const CHART_DATA = [
  { d: "11/05", v: 40 }, { d: "12/05", v: 65 }, { d: "13/05", v: 35 }, { d: "14/05", v: 80 },
  { d: "15/05", v: 55 }, { d: "16/05", v: 90 }, { d: "17/05", v: 70 }, { d: "18/05", v: 95 },
  { d: "19/05", v: 60 }, { d: "20/05", v: 110 }, { d: "21/05", v: 75 }, { d: "22/05", v: 130 },
  { d: "23/05", v: 100 }, { d: "24/05", v: 85 },
];

const CMD_K_ITEMS = [
  { icon: "money", label: "Cargar nueva venta", shortcut: "N", category: "Acciones" },
  { icon: "phone", label: "Cargar llamada rápida", shortcut: "L", category: "Acciones" },
  { icon: "search", label: "Buscar lead por nombre", shortcut: "/", category: "Navegación" },
  { icon: "dashboard", label: "Ir a Dashboard", shortcut: "G D", category: "Navegación" },
  { icon: "money", label: "Ir a Finanzas", shortcut: "G F", category: "Navegación" },
  { icon: "list", label: "Ir a Cobranzas", shortcut: "G C", category: "Navegación" },
  { icon: "sparkles", label: "Preguntar al asistente IA", shortcut: "?", category: "IA" },
];

export default function IOSGlassPro() {
  const [tab, setTab] = useState<"hoy" | "semana" | "mes">("mes");
  const [showIsland, setShowIsland] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [cmdK, setCmdK] = useState(false);
  const [cmdQ, setCmdQ] = useState("");
  const [chartHover, setChartHover] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const P = PALETTES[theme];

  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdK((x) => !x);
      }
      if (e.key === "Escape") setCmdK(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filteredCmd = CMD_K_ITEMS.filter((c) =>
    !cmdQ || c.label.toLowerCase().includes(cmdQ.toLowerCase())
  );

  return (
    <div
      style={{
        minHeight: "calc(100vh - 56px)",
        background: P.bg,
        color: P.text,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
        fontFeatureSettings: '"cv11", "ss01", "ss03", "cv02"',
        position: "relative",
        overflow: "hidden",
        transition: "background 400ms ease, color 400ms ease",
        opacity: mounted ? 1 : 0,
        animation: mounted ? "fadeIn 400ms ease-out" : undefined,
      }}
    >
      {/* Mesh + noise background */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: `radial-gradient(1200px 800px at 0% 0%, ${P.meshA}, transparent 60%), radial-gradient(1000px 700px at 100% 100%, ${P.meshB}, transparent 60%), radial-gradient(600px 500px at 50% 80%, ${P.meshC}, transparent 60%)`,
        transition: "background 400ms ease",
      }} />
      <div style={{
        position: "absolute", top: "-200px", left: "20%", width: 600, height: 600,
        background: `radial-gradient(circle, ${P.meshA}, transparent 65%)`,
        filter: "blur(60px)", animation: "drift1 20s ease-in-out infinite", pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", bottom: "-200px", right: "15%", width: 700, height: 700,
        background: `radial-gradient(circle, ${P.meshC}, transparent 65%)`,
        filter: "blur(60px)", animation: "drift2 25s ease-in-out infinite", pointerEvents: "none",
      }} />
      {/* Noise texture overlay */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", opacity: theme === "dark" ? 0.035 : 0.05, zIndex: 1,
        backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        mixBlendMode: theme === "dark" ? "overlay" : "multiply",
      }} />

      {/* Dynamic Island */}
      {showIsland && (
        <div style={dynamicIslandStyle(P)}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: ACCENTS.green, boxShadow: `0 0 10px ${ACCENTS.green}` }} />
          <span style={{ fontSize: 13, fontWeight: 500 }}>Pago recibido · Valentino · $18.000</span>
          <span style={{ fontSize: 11, color: P.textMuted }}>hace 2s</span>
        </div>
      )}

      {/* CMD+K modal */}
      {cmdK && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 200,
            background: theme === "dark" ? "rgba(0,0,0,0.45)" : "rgba(20,20,40,0.25)",
            backdropFilter: "blur(20px) saturate(150%)", WebkitBackdropFilter: "blur(20px) saturate(150%)",
            display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 120,
            animation: "fadeIn 200ms ease-out",
          }}
          onClick={() => setCmdK(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 560, maxWidth: "92vw",
              background: P.overlay,
              backdropFilter: "blur(60px) saturate(180%)", WebkitBackdropFilter: "blur(60px) saturate(180%)",
              border: `1px solid ${P.cardBorder}`,
              borderRadius: 20,
              boxShadow: "0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
              overflow: "hidden",
              animation: "modalPop 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: `1px solid ${P.cardBorder}` }}>
              <Icon name="search" size={16} style={{ opacity: 0.5 }} />
              <input
                autoFocus
                value={cmdQ}
                onChange={(e) => setCmdQ(e.target.value)}
                placeholder="Buscar acciones, leads, páginas..."
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 15, color: P.text, fontFamily: "inherit" }}
              />
              <span style={{ fontSize: 10, color: P.textSubtle, border: `1px solid ${P.cardBorder}`, padding: "2px 6px", borderRadius: 4 }}>ESC</span>
            </div>
            <div style={{ maxHeight: 360, overflowY: "auto", padding: 8 }}>
              {filteredCmd.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center" }}>
                  <EmptyIllustration />
                  <div style={{ fontSize: 13, color: P.textMuted, marginTop: 8 }}>Sin coincidencias para &quot;{cmdQ}&quot;</div>
                </div>
              ) : (
                filteredCmd.map((c, i) => (
                  <button
                    key={c.label}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 12,
                      padding: "10px 12px", borderRadius: 10, border: "none",
                      background: i === 0 ? (theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(20,20,40,0.06)") : "transparent",
                      color: P.text, fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "left",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = theme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(20,20,40,0.04)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = i === 0 ? (theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(20,20,40,0.06)") : "transparent")}
                  >
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: theme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(20,20,40,0.05)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon name={c.icon} size={14} />
                    </div>
                    <span style={{ flex: 1 }}>{c.label}</span>
                    <span style={{ fontSize: 10, color: P.textSubtle, marginRight: 6 }}>{c.category}</span>
                    <span style={{ fontSize: 10, color: P.textSubtle, border: `1px solid ${P.cardBorder}`, padding: "1px 5px", borderRadius: 4, fontFamily: "monospace" }}>
                      {c.shortcut}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div style={{ padding: "10px 16px", borderTop: `1px solid ${P.cardBorder}`, fontSize: 10, color: P.textSubtle, display: "flex", justifyContent: "space-between" }}>
              <span>↑↓ navegar · ↵ ejecutar</span>
              <span>{filteredCmd.length} resultado{filteredCmd.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>
      )}

      <div style={{ position: "relative", zIndex: 2, display: "grid", gridTemplateColumns: sidebarOpen ? "260px 1fr" : "72px 1fr", transition: "grid-template-columns 300ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}>
        {/* Sidebar */}
        <aside style={sidebarStyle(P, sidebarOpen)}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, justifyContent: sidebarOpen ? "space-between" : "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={brandBox()}>R</div>
              {sidebarOpen && (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.02em" }}>ROMS</div>
                  <div style={{ fontSize: 10, color: P.textMuted, letterSpacing: "0.04em", textTransform: "uppercase" }}>Consultora</div>
                </div>
              )}
            </div>
            {sidebarOpen && (
              <button onClick={() => setSidebarOpen(false)} aria-label="Colapsar sidebar"
                style={{ border: "none", background: "transparent", color: P.textMuted, cursor: "pointer", padding: 4 }}>
                <Icon name="chevron-left" size={16} />
              </button>
            )}
          </div>

          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)} aria-label="Expandir sidebar"
              style={{ width: "100%", marginBottom: 12, padding: 8, borderRadius: 8, border: `1px solid ${P.cardBorder}`, background: P.cardBg, color: P.textMuted, cursor: "pointer", display: "flex", justifyContent: "center" }}>
              <Icon name="chevron-right" size={14} />
            </button>
          )}

          {sidebarOpen && (
            <button onClick={() => setCmdK(true)} style={searchBoxStyle(P)}>
              <Icon name="search" size={14} style={{ opacity: 0.5 }} />
              <span style={{ fontSize: 13, color: P.textMuted, flex: 1, textAlign: "left" }}>Buscar...</span>
              <span style={{ fontSize: 10, color: P.textSubtle, border: `1px solid ${P.cardBorder}`, padding: "1px 5px", borderRadius: 4 }}>⌘K</span>
            </button>
          )}

          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {NAV.map((n, i) => (
              <NavBtn
                key={n.label}
                icon={navIcon(i)}
                label={n.label}
                active={i === 0}
                badge={i === 2 ? 3 : i === 3 ? "!" : undefined}
                badgeColor={i === 3 ? ACCENTS.red : ACCENTS.blue}
                collapsed={!sidebarOpen}
                palette={P}
                theme={theme}
              />
            ))}
          </nav>

          {sidebarOpen && (
            <>
              {/* Theme toggle */}
              <div style={{ marginTop: 20, padding: 4, borderRadius: 10, background: P.cardBg, border: `1px solid ${P.cardBorder}`, display: "flex", gap: 2 }}>
                <button onClick={() => setTheme("dark")} style={themeBtn(theme === "dark", P)}>
                  <Icon name="moon" size={12} /> Oscuro
                </button>
                <button onClick={() => setTheme("light")} style={themeBtn(theme === "light", P)}>
                  <Icon name="sun" size={12} /> Claro
                </button>
              </div>
              {/* User card */}
              <div style={userCardStyle(P)}>
                <div style={{ position: "relative" }}>
                  <Avatar name="Mati Coria" size={32} />
                  <div style={{
                    position: "absolute", bottom: -1, right: -1, width: 10, height: 10,
                    borderRadius: "50%", background: ACCENTS.green, border: `2px solid ${P.sidebarBorder}`,
                  }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>Mati Coria</div>
                  <div style={{ fontSize: 10, color: ACCENTS.green, fontWeight: 500 }}>Online · Admin</div>
                </div>
              </div>
            </>
          )}
        </aside>

        {/* Main */}
        <main style={{ padding: "32px 32px 80px 8px" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: P.textMuted, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 600 }}>
                Mes fiscal · 08 may → 07 jun
              </div>
              <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.04em", margin: "4px 0 0" }}>
                Buenas, Mati
              </h1>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={segmentedWrap(P)}>
                <SegBtn label="Hoy" active={tab === "hoy"} onClick={() => setTab("hoy")} palette={P} />
                <SegBtn label="Semana" active={tab === "semana"} onClick={() => setTab("semana")} palette={P} />
                <SegBtn label="Mes" active={tab === "mes"} onClick={() => setTab("mes")} palette={P} />
              </div>
              <button onClick={() => { setShowIsland(true); setTimeout(() => setShowIsland(false), 3000); }} style={primaryBtn(P, theme)}>
                + Nueva venta
              </button>
            </div>
          </div>

          {/* KPI grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 14 }}>
            {KPIS.map((k, idx) => (
              <KpiCard key={k.label} kpi={k} index={idx} palette={P} />
            ))}
          </div>

          {/* Row: cobranzas + asistente */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 14 }}>
            <div style={{ ...glassCard(P, { padding: 0 }), overflow: "hidden" }}>
              <div style={{ padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${P.cardBorder}` }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", display: "flex", alignItems: "center", gap: 8 }}>
                    Cobranzas pendientes
                    <span style={{
                      background: `${ACCENTS.red}20`, border: `1px solid ${ACCENTS.red}40`,
                      color: ACCENTS.red, fontSize: 10, fontWeight: 700,
                      padding: "2px 8px", borderRadius: 100,
                    }}>2 VENCIDAS</span>
                  </div>
                  <div style={{ fontSize: 11, color: P.textMuted, marginTop: 2 }}>
                    Total por cobrar: <span style={{ color: P.text, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>$29.460</span>
                  </div>
                </div>
                <button style={secondaryBtn(P, theme)}>📋 Copiar para WA</button>
              </div>
              <div>
                {COBRANZAS.map((c, idx) => {
                  const color = statusColor(c.status);
                  const labelTxt = c.dueIn < 0 ? `${Math.abs(c.dueIn)}d atrasado` : c.dueIn === 0 ? "vence hoy" : `en ${c.dueIn}d`;
                  return (
                    <div key={c.client}
                      style={{
                        display: "grid", gridTemplateColumns: "auto 1fr auto auto", alignItems: "center", gap: 12,
                        padding: "12px 24px",
                        borderTop: idx === 0 ? "none" : `1px solid ${P.cardBorder}`,
                        borderLeft: `3px solid ${color}`,
                        transition: "background 150ms",
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = theme === "dark" ? "rgba(255,255,255,0.025)" : "rgba(20,20,40,0.025)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                      <StatusDot color={color} pulse={c.status === "vencido"} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{c.client}</div>
                        <div style={{ fontSize: 11, color: P.textMuted }}>Cuota #{c.cuota} · {labelTxt}</div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: c.status === "vencido" ? ACCENTS.red : P.text, fontVariantNumeric: "tabular-nums" }}>
                        ${c.amount.toLocaleString("en-US")}
                      </div>
                      <button aria-label="Marcar pagado" style={{
                        padding: "4px 10px", borderRadius: 8, border: `1px solid ${P.cardBorder}`,
                        background: P.cardBg, color: P.text,
                        fontSize: 11, fontWeight: 500, cursor: "pointer",
                      }}>Marcar ✓</button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Asistente IA */}
            <div style={glassCard(P, { padding: 20 })}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 12, background: "linear-gradient(135deg, #c084fc, #06b6d4)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(192,132,252,0.4)" }}>
                  <Icon name="sparkles" size={18} style={{ color: "#fff" }} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Asistente IA</div>
                  <div style={{ fontSize: 10, color: ACCENTS.green, fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENTS.green }} />
                    Conectado
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 13, color: P.text, lineHeight: 1.6, marginBottom: 14, opacity: 0.85 }}>
                Vendiste un <b style={{ color: ACCENTS.green, opacity: 1 }}>+34%</b> que abril. Top closer: <b style={{ color: P.text, opacity: 1 }}>Valentino</b>. <span style={{ color: ACCENTS.red, fontWeight: 600 }}>2 cobranzas vencidas</span>.
              </div>
              <button style={{ ...primaryBtn(P, theme), width: "100%", justifyContent: "center", display: "flex", alignItems: "center", gap: 8 }}>
                Preguntar
                <Icon name="arrow-right" size={14} />
              </button>
            </div>
          </div>

          {/* Row: chart + team + skeleton demo */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 14 }}>
            {/* Chart con tooltips */}
            <div style={glassCard(P, { padding: 24 })}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>Cash diario · últimos 14 días</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Chip palette={P} theme={theme}>USD</Chip>
                  <Chip palette={P} theme={theme}>ARS</Chip>
                  <Chip palette={P} theme={theme} active>14d</Chip>
                  <Chip palette={P} theme={theme}>30d</Chip>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>$48.230</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: ACCENTS.green, display: "flex", alignItems: "center", gap: 4 }}>
                  <Icon name="trending-up" size={14} />
                  +12,4% vs mes anterior
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 130, marginTop: 4, position: "relative" }}>
                {CHART_DATA.map((d, i) => (
                  <div key={i}
                    style={{ flex: 1, position: "relative", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
                    onMouseEnter={() => setChartHover(i)}
                    onMouseLeave={() => setChartHover(null)}
                  >
                    {chartHover === i && (
                      <div style={tooltipStyle(P)}>
                        <div style={{ fontSize: 10, color: P.textMuted, fontWeight: 500 }}>{d.d}/2026</div>
                        <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>${(d.v * 100).toLocaleString("en-US")}</div>
                      </div>
                    )}
                    <div
                      style={{
                        height: `${d.v}px`,
                        borderRadius: "8px 8px 3px 3px",
                        background: `linear-gradient(180deg, ${P.barTopFill} 0%, ${P.barMidFill} 60%, ${P.barBottomFill} 100%)`,
                        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), 0 2px 12px ${P.barGlow}`,
                        transition: "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                        transform: chartHover === i ? "scaleY(1.08)" : "scaleY(1)",
                        opacity: chartHover === null || chartHover === i ? 1 : 0.6,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", marginTop: 8, fontSize: 10, color: P.textSubtle, justifyContent: "space-between", fontVariantNumeric: "tabular-nums" }}>
                <span>11/05</span><span>14/05</span><span>17/05</span><span>20/05</span><span>23/05</span><span>25/05</span>
              </div>
            </div>

            {/* Team online */}
            <div style={glassCard(P, { padding: 20 })}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Equipo</div>
                <div style={{ fontSize: 11, color: ACCENTS.green, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENTS.green, boxShadow: `0 0 6px ${ACCENTS.green}` }} />
                  {TEAM_ONLINE.filter((t) => t.online).length} online
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {TEAM_ONLINE.map((m) => (
                  <div key={m.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ position: "relative" }}>
                      <Avatar name={m.name} size={28} />
                      <div style={{
                        position: "absolute", bottom: -1, right: -1, width: 8, height: 8,
                        borderRadius: "50%",
                        background: m.online ? ACCENTS.green : (theme === "dark" ? "#52525b" : "#a1a1aa"),
                        border: `1.5px solid ${P.sidebarBorder}`,
                        boxShadow: m.online ? `0 0 6px ${ACCENTS.green}` : "none",
                      }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{m.name}</div>
                      <div style={{ fontSize: 10, color: P.textMuted }}>{m.role}</div>
                    </div>
                    <div style={{ fontSize: 11, color: P.text, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {m.activeLeads}
                      <span style={{ color: P.textSubtle, marginLeft: 3, fontWeight: 400 }}>leads</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Skeleton demo + Empty state demo */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div style={glassCard(P, { padding: 20 })}>
              <div style={{ fontSize: 13, fontWeight: 600, color: P.textMuted, marginBottom: 12, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Skeleton (cargando)
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={shimmerStyle(theme, { width: 32, height: 32, borderRadius: "50%" })} />
                    <div style={{ flex: 1 }}>
                      <div style={shimmerStyle(theme, { width: "60%", height: 12, borderRadius: 4, marginBottom: 6 })} />
                      <div style={shimmerStyle(theme, { width: "40%", height: 10, borderRadius: 4 })} />
                    </div>
                    <div style={shimmerStyle(theme, { width: 60, height: 14, borderRadius: 4 })} />
                  </div>
                ))}
              </div>
            </div>
            <div style={glassCard(P, { padding: 0, overflow: "hidden" })}>
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${P.cardBorder}`, fontSize: 13, fontWeight: 600 }}>Empty state</div>
              <EmptyStateBlock palette={P} />
            </div>
          </div>

          {/* Tabla ventas */}
          <div style={{ ...glassCard(P, { padding: 0 }), overflow: "hidden" }}>
            <div style={{ padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${P.cardBorder}` }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em" }}>Ventas recientes</div>
                <div style={{ fontSize: 11, color: P.textMuted, marginTop: 2 }}>{ROWS.length} cerrados este mes</div>
              </div>
              <button style={secondaryBtn(P, theme)}>Ver todo</button>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: theme === "dark" ? "rgba(255,255,255,0.02)" : "rgba(20,20,40,0.02)" }}>
                  {["Cliente", "Programa", "Monto", "Closer", "Fecha", "Estado"].map((h) => (
                    <th key={h} style={{ padding: "10px 20px", textAlign: "left", fontSize: 10, fontWeight: 600, color: P.textMuted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r, i) => {
                  const estados = ["pagado", "pagado", "reserva", "pagado", "pendiente"] as const;
                  const est = estados[i] || "pagado";
                  return (
                    <tr key={r.name} style={{ borderTop: `1px solid ${P.cardBorder}`, transition: "background 150ms" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = theme === "dark" ? "rgba(255,255,255,0.025)" : "rgba(20,20,40,0.025)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                      <td style={{ padding: "14px 20px", fontSize: 13, fontWeight: 500 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <Avatar name={r.name} size={28} />
                          <span>{r.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: "14px 20px" }}><Pill program={r.program} /></td>
                      <td style={{ padding: "14px 20px", fontSize: 13, fontWeight: 600, color: ACCENTS.green, fontVariantNumeric: "tabular-nums" }}>{r.amount}</td>
                      <td style={{ padding: "14px 20px", fontSize: 13, color: P.text, opacity: 0.75 }}>{r.closer}</td>
                      <td style={{ padding: "14px 20px", fontSize: 13, color: P.textMuted, fontVariantNumeric: "tabular-nums" }}>{r.date}</td>
                      <td style={{ padding: "14px 20px" }}><EstadoChip estado={est} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      <button onClick={() => setCmdK(true)}
        style={{
          position: "fixed", bottom: 28, right: 28,
          width: 56, height: 56, borderRadius: 28,
          border: "1px solid rgba(255,255,255,0.18)",
          background: "linear-gradient(135deg, rgba(140,200,255,0.95), rgba(120,80,255,0.85))",
          color: "#fff", fontSize: 24, fontWeight: 300,
          cursor: "pointer",
          boxShadow: "0 12px 40px rgba(120,80,255,0.5), inset 0 1px 0 rgba(255,255,255,0.3)",
          transition: "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          zIndex: 50,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.08) rotate(90deg)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1) rotate(0)")}
        aria-label="Acción rápida (CMD+K)"
      >+</button>

      <style>{`
        @keyframes drift1 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(60px, 40px); } }
        @keyframes drift2 { 0%,100% { transform: translate(0,0); } 50% { transform: translate(-50px, -30px); } }
        @keyframes pulseRing { 0% { transform: scale(1); opacity: 0.7; } 100% { transform: scale(2.5); opacity: 0; } }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes islandIn { from { opacity: 0; transform: translateX(-50%) translateY(-20px) scale(0.6); } to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } }
        @keyframes modalPop { from { opacity: 0; transform: translateY(-10px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}

// ───── styles helpers ─────

function glassCard(P: Pal, extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    background: P.cardBg, backdropFilter: "blur(40px) saturate(180%)", WebkitBackdropFilter: "blur(40px) saturate(180%)",
    border: `1px solid ${P.cardBorder}`, borderRadius: 20,
    boxShadow: "0 8px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.06)",
    transition: "transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 250ms, background 400ms",
    ...extra,
  };
}

function sidebarStyle(P: Pal, open: boolean): React.CSSProperties {
  return {
    margin: 16, padding: open ? 20 : 12, borderRadius: 24,
    background: P.cardBg, backdropFilter: "blur(40px) saturate(180%)", WebkitBackdropFilter: "blur(40px) saturate(180%)",
    border: `1px solid ${P.cardBorder}`, height: "fit-content", position: "sticky", top: 80,
    boxShadow: "0 16px 48px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)",
    overflow: "hidden", transition: "all 300ms",
  };
}

function searchBoxStyle(P: Pal): React.CSSProperties {
  return {
    width: "100%", marginBottom: 16,
    background: P.inputBg, borderRadius: 12, border: `1px solid ${P.cardBorder}`,
    padding: "9px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
  };
}

function brandBox(): React.CSSProperties {
  return {
    width: 32, height: 32, borderRadius: 10, flexShrink: 0,
    background: "linear-gradient(135deg, #c084fc, #06b6d4)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 16, fontWeight: 800, color: "#fff",
    boxShadow: "0 4px 14px rgba(192,132,252,0.4)",
  };
}

function themeBtn(active: boolean, P: Pal): React.CSSProperties {
  return {
    flex: 1, padding: "6px 8px", borderRadius: 7, border: "none",
    background: active ? (P === PALETTES.dark ? "rgba(255,255,255,0.1)" : "rgba(20,20,40,0.08)") : "transparent",
    color: active ? P.text : P.textMuted,
    fontSize: 11, fontWeight: 600, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
    transition: "all 200ms",
  };
}

function userCardStyle(P: Pal): React.CSSProperties {
  return {
    marginTop: 12, padding: 12, borderRadius: 12,
    background: P.cardBg, border: `1px solid ${P.cardBorder}`,
    display: "flex", alignItems: "center", gap: 10,
  };
}

function primaryBtn(P: Pal, theme: "dark" | "light"): React.CSSProperties {
  return {
    padding: "9px 16px", borderRadius: 12,
    border: theme === "dark" ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(20,20,40,0.15)",
    background: theme === "dark"
      ? "linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06))"
      : "linear-gradient(180deg, #2A2D3A, #1B1D24)",
    backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
    color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
    boxShadow: "0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.2)",
  };
}

function secondaryBtn(P: Pal, theme: "dark" | "light"): React.CSSProperties {
  return {
    padding: "7px 14px", borderRadius: 10,
    border: `1px solid ${P.cardBorder}`,
    background: P.cardBg, color: P.text,
    fontSize: 12, fontWeight: 500, cursor: "pointer",
  };
}

function segmentedWrap(P: Pal): React.CSSProperties {
  return {
    display: "inline-flex", background: P.cardBg, border: `1px solid ${P.cardBorder}`,
    borderRadius: 10, padding: 3, gap: 2,
    backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
  };
}

function dynamicIslandStyle(P: Pal): React.CSSProperties {
  return {
    position: "fixed", top: 72, left: "50%", transform: "translateX(-50%)", zIndex: 100,
    background: P.overlay, backdropFilter: "blur(40px) saturate(180%)", WebkitBackdropFilter: "blur(40px) saturate(180%)",
    border: `1px solid ${P.cardBorder}`, borderRadius: 100, padding: "10px 20px",
    display: "flex", alignItems: "center", gap: 12,
    boxShadow: "0 12px 40px rgba(0,0,0,0.3)",
    animation: "islandIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1)",
  };
}

function tooltipStyle(P: Pal): React.CSSProperties {
  return {
    position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
    background: P.overlay, backdropFilter: "blur(30px)", WebkitBackdropFilter: "blur(30px)",
    border: `1px solid ${P.cardBorder}`, borderRadius: 10, padding: "8px 12px",
    minWidth: 100, textAlign: "center", boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
    pointerEvents: "none", zIndex: 10, color: P.text,
    animation: "fadeIn 150ms ease-out",
  };
}

function shimmerStyle(theme: "dark" | "light", extra: React.CSSProperties): React.CSSProperties {
  const colors = theme === "dark"
    ? "rgba(255,255,255,0.04), rgba(255,255,255,0.12), rgba(255,255,255,0.04)"
    : "rgba(20,20,40,0.05), rgba(20,20,40,0.12), rgba(20,20,40,0.05)";
  return {
    background: `linear-gradient(90deg, ${colors})`,
    backgroundSize: "200% 100%",
    animation: "shimmer 1.4s linear infinite",
    ...extra,
  };
}

// ───── components ─────

function SegBtn({ label, active, onClick, palette }: { label: string; active: boolean; onClick: () => void; palette: Pal }) {
  return (
    <button onClick={onClick}
      style={{
        padding: "6px 14px", borderRadius: 7, border: "none",
        background: active ? (palette === PALETTES.dark ? "rgba(255,255,255,0.12)" : "rgba(20,20,40,0.08)") : "transparent",
        color: active ? palette.text : palette.textMuted,
        fontSize: 12, fontWeight: 600, cursor: "pointer",
        boxShadow: active ? "0 2px 8px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.08)" : "none",
        transition: "all 200ms",
      }}
    >{label}</button>
  );
}

function KpiCard({ kpi, index, palette }: { kpi: typeof KPIS[number]; index: number; palette: Pal }) {
  const color = kpi.positive ? ACCENTS.green : ACCENTS.red;
  return (
    <div style={glassCard(palette, { padding: 20, cursor: "pointer" })}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 12px 40px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 8px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.06)"; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: palette.textMuted, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>{kpi.label}</div>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: kpiIconBg(index), display: "flex", alignItems: "center", justifyContent: "center", color: kpiIconColor(index) }}>
          <Icon name={kpiIcon(index)} size={14} />
        </div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", color: palette.text }}>{kpi.value}</div>
      <div style={{ fontSize: 11, fontWeight: 600, marginTop: 6, color, display: "flex", alignItems: "center", gap: 4 }}>
        <span>{kpi.positive ? "↑" : "↓"}</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{kpi.delta.replace(/[+−↑↓]/g, "")}</span>
        <span style={{ color: palette.textSubtle, fontWeight: 500 }}>vs mes ant.</span>
      </div>
    </div>
  );
}

function NavBtn({ icon, label, active, badge, badgeColor, collapsed, palette, theme }: {
  icon: string; label: string; active: boolean; badge?: number | string; badgeColor?: string; collapsed?: boolean;
  palette: Pal; theme: "dark" | "light";
}) {
  const hoverBg = theme === "dark" ? "rgba(255,255,255,0.04)" : "rgba(20,20,40,0.04)";
  const activeBg = theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(20,20,40,0.06)";
  return (
    <button title={collapsed ? label : undefined}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: collapsed ? "9px 0" : "9px 12px",
        borderRadius: 10, border: "none",
        background: active ? activeBg : "transparent",
        color: active ? palette.text : palette.textMuted,
        fontSize: 13, fontWeight: 500, cursor: "pointer",
        textAlign: "left", transition: "all 150ms",
        justifyContent: collapsed ? "center" : "flex-start",
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = hoverBg; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <Icon name={icon} size={16} style={{ opacity: active ? 1 : 0.75 }} />
      {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
      {badge != null && !collapsed && (
        <span style={{
          background: badgeColor || ACCENTS.blue, color: "#fff",
          fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10,
          minWidth: 18, textAlign: "center",
          boxShadow: `0 0 8px ${badgeColor || ACCENTS.blue}80`,
        }}>{badge}</span>
      )}
    </button>
  );
}

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 60) % 360;
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `linear-gradient(135deg, hsl(${h1}, 70%, 60%), hsl(${h2}, 70%, 50%))`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.4, fontWeight: 700, color: "#fff",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 8px rgba(0,0,0,0.3)",
      flexShrink: 0,
    }}>{initials}</div>
  );
}

function Pill({ program }: { program: string }) {
  const colors: Record<string, [string, string]> = {
    "Omnipresencia": [`${ACCENTS.purple}25`, `${ACCENTS.purple}50`],
    "Multicuentas": [`${ACCENTS.green}25`, `${ACCENTS.green}50`],
    "Consultoría": [`${ACCENTS.cyan}25`, `${ACCENTS.cyan}50`],
  };
  const [bg, border] = colors[program] || ["rgba(255,255,255,0.06)", "rgba(255,255,255,0.1)"];
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 100,
      background: bg, border: `1px solid ${border}`, color: "currentColor",
      backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
    }}>{program}</span>
  );
}

function Chip({ children, active, palette, theme }: { children: React.ReactNode; active?: boolean; palette: Pal; theme: "dark" | "light" }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "4px 8px", borderRadius: 6,
      background: active ? (theme === "dark" ? "rgba(255,255,255,0.1)" : "rgba(20,20,40,0.08)") : palette.cardBg,
      border: `1px solid ${palette.cardBorder}`,
      color: active ? palette.text : palette.textMuted, cursor: "pointer",
    }}>{children}</span>
  );
}

function EstadoChip({ estado }: { estado: "pagado" | "reserva" | "pendiente" | "vencido" }) {
  const map = {
    pagado:    { color: ACCENTS.green,  label: "Pagado" },
    reserva:   { color: ACCENTS.yellow, label: "Reserva" },
    pendiente: { color: ACCENTS.orange, label: "Pendiente" },
    vencido:   { color: ACCENTS.red,    label: "Vencido" },
  };
  const c = map[estado];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: 11, fontWeight: 600, padding: "3px 9px 3px 7px", borderRadius: 100,
      background: `${c.color}18`, border: `1px solid ${c.color}40`, color: c.color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.color, boxShadow: `0 0 6px ${c.color}` }} />
      {c.label}
    </span>
  );
}

function StatusDot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <div style={{ position: "relative", width: 10, height: 10 }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}80` }} />
      {pulse && <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: color, animation: "pulseRing 1.6s ease-out infinite" }} />}
    </div>
  );
}

function EmptyIllustration() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" style={{ opacity: 0.5 }}>
      <defs>
        <linearGradient id="empty-g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <circle cx="40" cy="40" r="32" stroke="url(#empty-g)" strokeWidth="2" strokeDasharray="4 4" opacity="0.5" />
      <circle cx="40" cy="40" r="20" stroke="url(#empty-g)" strokeWidth="2" opacity="0.7" />
      <path d="M30 40h20M40 30v20" stroke="url(#empty-g)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function EmptyStateBlock({ palette }: { palette: Pal }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 20px" }}>
      <EmptyIllustration />
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 12, color: palette.text }}>Sin prospectos por acá</div>
      <div style={{ fontSize: 11, color: palette.textMuted, marginTop: 4, textAlign: "center", maxWidth: 240 }}>
        No tenés prospectos con esos filtros. Cargá nuevos números para que aparezcan.
      </div>
      <button style={{
        marginTop: 14, padding: "8px 14px", borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.18)",
        background: "linear-gradient(135deg, #c084fc, #06b6d4)",
        color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
        boxShadow: "0 4px 14px rgba(192,132,252,0.3)",
      }}>+ Cargar números</button>
    </div>
  );
}

function statusColor(status: "vencido" | "urgente" | "proximo" | "ok") {
  return { vencido: ACCENTS.red, urgente: ACCENTS.orange, proximo: ACCENTS.yellow, ok: ACCENTS.green }[status];
}

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
    case "chevron-left": return <svg {...props}><polyline points="15 18 9 12 15 6" /></svg>;
    case "chevron-right": return <svg {...props}><polyline points="9 18 15 12 9 6" /></svg>;
    case "moon": return <svg {...props}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>;
    case "sun": return <svg {...props}><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22" /><line x1="4.93" y1="4.93" x2="6.34" y2="6.34" /><line x1="17.66" y1="17.66" x2="19.07" y2="19.07" /><line x1="2" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22" y2="12" /><line x1="4.93" y1="19.07" x2="6.34" y2="17.66" /><line x1="17.66" y1="6.34" x2="19.07" y2="4.93" /></svg>;
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
  return [`${ACCENTS.green}25`, `${ACCENTS.purple}25`, `${ACCENTS.red}25`, `${ACCENTS.blue}25`][i] || "rgba(255,255,255,0.05)";
}
function kpiIconColor(i: number): string {
  return [ACCENTS.green, ACCENTS.purple, ACCENTS.red, ACCENTS.blue][i] || "#fff";
}
