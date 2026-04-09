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

export default function KPICard({ label, value, format = "number", delta, icon, valueClassName, index = 0 }: Props) {
  const formatted =
    format === "usd" ? formatUSD(value) :
    format === "pct" ? formatPctRaw(value) :
    value.toLocaleString();

  return (
    <div
      className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-4 animate-slide-up"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[var(--muted)] uppercase">{label}</span>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <p className={`text-2xl font-bold ${valueClassName ?? "text-white"}`}>{formatted}</p>
      {delta !== undefined && delta !== null && (
        <p className={`text-xs mt-1 ${delta >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
          {delta >= 0 ? "\u25B2" : "\u25BC"} {Math.abs(delta).toFixed(1)}% vs mes anterior
        </p>
      )}
    </div>
  );
}
