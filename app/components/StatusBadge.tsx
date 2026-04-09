const COLORS: Record<string, string> = {
  cerrado: "bg-[var(--green)]/15 text-[var(--green)]",
  pagado: "bg-[var(--green)]/15 text-[var(--green)]",
  activo: "bg-[var(--green)]/15 text-[var(--green)]",
  done: "bg-[var(--green)]/15 text-[var(--green)]",
  pendiente: "bg-[var(--yellow)]/15 text-[var(--yellow)]",
  pending: "bg-[var(--yellow)]/15 text-[var(--yellow)]",
  programada: "bg-[var(--purple)]/15 text-[var(--purple-light)]",
  seguimiento: "bg-blue-500/15 text-blue-400",
  in_progress: "bg-blue-500/15 text-blue-400",
  no_show: "bg-[var(--red)]/15 text-[var(--red)]",
  cancelada: "bg-[var(--red)]/15 text-[var(--red)]",
  perdido: "bg-[var(--red)]/15 text-[var(--red)]",
  failed: "bg-[var(--red)]/15 text-[var(--red)]",
  inactivo: "bg-[var(--muted)]/15 text-[var(--muted)]",
};

export default function StatusBadge({ status, label }: { status: string; label?: string }) {
  const color = COLORS[status] || "bg-[var(--muted)]/15 text-[var(--muted)]";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {label || status}
    </span>
  );
}
