import { formatUSD, formatPctRaw } from "@/lib/format";

interface Props {
  label: string;
  value: number;
  format?: "usd" | "pct" | "number";
  delta?: number | null;
  icon?: string;
  valueClassName?: string;
  /** Index for stagger animation (0, 1, 2, 3...) */
  index?: number;
}

/**
 * KPICard upgraded — frosted glass card con backdrop blur, hover lift,
 * tabular nums, delta con flecha + color semaforizado, animación stagger.
 * Mantiene la API original.
 */
export default function KPICard({ label, value, format = "number", delta, icon, valueClassName, index = 0 }: Props) {
  const formatted =
    format === "usd" ? formatUSD(value) :
    format === "pct" ? formatPctRaw(value) :
    value.toLocaleString();

  const positive = delta != null && delta >= 0;
  const deltaColor = positive ? "var(--green)" : "var(--red)";

  return (
    <div
      className="animate-slide-up group"
      style={{
        background: "var(--card-bg)",
        backdropFilter: "blur(40px) saturate(180%)",
        WebkitBackdropFilter: "blur(40px) saturate(180%)",
        border: "1px solid var(--card-border)",
        borderRadius: 20,
        padding: 20,
        boxShadow: "0 8px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.06)",
        animationDelay: `${index * 50}ms`,
        transition: "transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 250ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 12px 40px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 8px 32px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.06)";
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span style={{
          fontSize: 11, color: "var(--muted)", fontWeight: 600,
          letterSpacing: "0.04em", textTransform: "uppercase",
        }}>{label}</span>
        {icon && <span style={{ fontSize: 16, opacity: 0.7 }}>{icon}</span>}
      </div>
      <p
        className={valueClassName ?? "text-white"}
        style={{
          fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em",
          fontVariantNumeric: "tabular-nums", margin: 0,
        }}
      >
        {formatted}
      </p>
      {delta !== undefined && delta !== null && (
        <p style={{
          fontSize: 11, fontWeight: 600, marginTop: 6,
          color: deltaColor,
          display: "flex", alignItems: "center", gap: 4,
        }}>
          <span>{positive ? "↑" : "↓"}</span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{Math.abs(delta).toFixed(1)}%</span>
          <span style={{ color: "var(--muted)", fontWeight: 500 }}>vs mes ant.</span>
        </p>
      )}
    </div>
  );
}
