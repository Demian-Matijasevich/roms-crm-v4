/**
 * Design tokens del sistema "iOS Glass v3".
 * Centralizados acá para que cualquier component los importe sin hardcodear.
 * NO reemplazan a los CSS vars existentes (--purple, --green, etc.) —
 * conviven. Estos son los semánticos del look nuevo.
 */

export const ACCENTS = {
  green: "#34D399",
  red: "#FB7185",
  yellow: "#FBBF24",
  orange: "#FB923C",
  blue: "#60A5FA",
  purple: "#A78BFA",
  cyan: "#22D3EE",
  pink: "#F472B6",
} as const;

export type AccentKey = keyof typeof ACCENTS;

/**
 * Glass card style (presets) para usar inline o composición.
 */
export const GLASS = {
  card: {
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(40px) saturate(180%)",
    WebkitBackdropFilter: "blur(40px) saturate(180%)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 20,
    boxShadow: "0 8px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.06)",
  },
  cardHover: {
    transform: "translateY(-2px)",
    boxShadow: "0 12px 40px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08)",
  },
  surface: {
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(40px) saturate(180%)",
    WebkitBackdropFilter: "blur(40px) saturate(180%)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
};

export const SPRING = "cubic-bezier(0.34, 1.56, 0.64, 1)";
