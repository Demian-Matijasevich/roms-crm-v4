"use client";

import { ACCENTS } from "./tokens";

/**
 * Chip semaforizado para estados (pagado, reserva, pendiente, vencido, refund).
 * Punto de color + glow + label.
 *
 * Uso:
 *   <EstadoChip estado="pagado" />
 *   <EstadoChip estado="vencido" />
 */
type EstadoKind =
  | "pagado" | "reserva" | "pendiente" | "vencido" | "refund"
  | "cerrado" | "seguimiento" | "no_show" | "cancelada" | "no_cierre"
  | "no_calificado" | "broke_cancelado" | "adentro_seguimiento" | "reprogramada"
  | "online" | "offline";

const MAP: Record<EstadoKind, { color: string; label: string }> = {
  // pagos
  pagado:    { color: ACCENTS.green,  label: "Pagado" },
  reserva:   { color: ACCENTS.yellow, label: "Reserva" },
  pendiente: { color: ACCENTS.orange, label: "Pendiente" },
  vencido:   { color: ACCENTS.red,    label: "Vencido" },
  refund:    { color: ACCENTS.red,    label: "Refund" },
  // leads
  cerrado:              { color: ACCENTS.green,  label: "Cerrado" },
  seguimiento:          { color: ACCENTS.blue,   label: "Seguimiento" },
  adentro_seguimiento:  { color: ACCENTS.cyan,   label: "Adentro seg." },
  no_show:              { color: ACCENTS.orange, label: "No show" },
  cancelada:            { color: ACCENTS.red,    label: "Cancelada" },
  no_cierre:            { color: ACCENTS.orange, label: "No cierre" },
  no_calificado:        { color: "#71717a",      label: "No calificado" },
  broke_cancelado:      { color: ACCENTS.red,    label: "Broke" },
  reprogramada:         { color: ACCENTS.yellow, label: "Reprogramada" },
  // presencia
  online:  { color: ACCENTS.green,  label: "Online" },
  offline: { color: "#71717a",      label: "Offline" },
};

export default function EstadoChip({
  estado,
  size = "md",
}: {
  estado: EstadoKind | string;
  size?: "sm" | "md";
}) {
  const c = (estado in MAP) ? MAP[estado as EstadoKind] : { color: "#71717a", label: estado };
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
        background: `${c.color}18`,
        border: `1px solid ${c.color}40`,
        color: c.color,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: sm ? 5 : 6,
          height: sm ? 5 : 6,
          borderRadius: "50%",
          background: c.color,
          boxShadow: `0 0 6px ${c.color}`,
          flexShrink: 0,
        }}
        aria-hidden
      />
      {c.label}
    </span>
  );
}
