"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";

/**
 * Toggle de tema oscuro/claro. Persiste en localStorage y aplica
 * `body.theme-light` para que las CSS vars se ajusten.
 *
 * Uso: <ThemeToggle /> — donde quieras montarlo (típicamente sidebar).
 */
export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);

  useEffect(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem("roms_theme")) as "dark" | "light" | null;
    const initial = stored === "light" ? "light" : "dark";
    setTheme(initial);
    if (initial === "light") document.body.classList.add("theme-light");
    else document.body.classList.remove("theme-light");
  }, []);

  function setT(t: "dark" | "light") {
    setTheme(t);
    if (typeof window !== "undefined") localStorage.setItem("roms_theme", t);
    if (t === "light") document.body.classList.add("theme-light");
    else document.body.classList.remove("theme-light");
  }

  if (theme == null) return null;

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => setT(theme === "dark" ? "light" : "dark")}
        aria-label={theme === "dark" ? "Activar modo claro" : "Activar modo oscuro"}
        title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
        style={{
          width: 32, height: 32, borderRadius: 8,
          border: "1px solid var(--card-border)",
          background: "var(--card-bg)",
          color: "var(--muted)",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <Icon name={theme === "dark" ? "sun" : "moon"} size={14} />
      </button>
    );
  }

  return (
    <div style={{
      display: "flex", padding: 3, gap: 2,
      background: "var(--card-bg)",
      border: "1px solid var(--card-border)",
      borderRadius: 10,
    }}>
      <button
        onClick={() => setT("dark")}
        style={btnStyle(theme === "dark")}
        aria-label="Modo oscuro"
      >
        <Icon name="moon" size={12} /> Oscuro
      </button>
      <button
        onClick={() => setT("light")}
        style={btnStyle(theme === "light")}
        aria-label="Modo claro"
      >
        <Icon name="sun" size={12} /> Claro
      </button>
    </div>
  );
}

function btnStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: "6px 10px",
    borderRadius: 7,
    border: "none",
    background: active ? "rgba(255,255,255,0.10)" : "transparent",
    color: active ? "var(--foreground)" : "var(--muted)",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    transition: "all 200ms",
  };
}
