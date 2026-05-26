/**
 * Status badge legacy — upgraded a estilo v3 con dot semaforizado + glow.
 * Mantiene la API original (status + label) para no romper consumidores.
 */

const ACCENTS: Record<string, string> = {
  green: "#34D399",
  red: "#FB7185",
  yellow: "#FBBF24",
  orange: "#FB923C",
  blue: "#60A5FA",
  purple: "#A78BFA",
  cyan: "#22D3EE",
  muted: "#71717a",
};

const STATUS_TO_TONE: Record<string, string> = {
  cerrado: "green",
  pagado: "green",
  activo: "green",
  done: "green",
  online: "green",
  reserva: "yellow",
  pendiente: "orange",
  pending: "orange",
  programada: "purple",
  seguimiento: "blue",
  adentro_seguimiento: "cyan",
  in_progress: "blue",
  no_show: "red",
  cancelada: "red",
  perdido: "red",
  failed: "red",
  vencido: "red",
  refund: "red",
  no_cierre: "orange",
  broke_cancelado: "red",
  reprogramada: "yellow",
  no_calificado: "muted",
  inactivo: "muted",
  offline: "muted",
};

export default function StatusBadge({
  status,
  label,
  size = "md",
}: {
  status: string;
  label?: string;
  size?: "sm" | "md";
}) {
  const tone = STATUS_TO_TONE[status] || "muted";
  const color = ACCENTS[tone];
  const sm = size === "sm";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: sm ? 4 : 6,
        fontSize: sm ? 10 : 11,
        fontWeight: 600,
        padding: sm ? "2px 7px 2px 6px" : "3px 9px 3px 7px",
        borderRadius: 100,
        background: `${color}18`,
        border: `1px solid ${color}40`,
        color,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: sm ? 5 : 6,
          height: sm ? 5 : 6,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 6px ${color}`,
          flexShrink: 0,
        }}
        aria-hidden
      />
      {label || status}
    </span>
  );
}
