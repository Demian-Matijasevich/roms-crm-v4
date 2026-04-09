import type { Semaforo as SemaforoType } from "@/lib/types";

const COLORS: Record<string, { bg: string; text: string; label: string }> = {
  verde: { bg: "bg-[var(--green)]/15", text: "text-[var(--green)]", label: "Al d\u00eda" },
  amarillo: { bg: "bg-[var(--yellow)]/15", text: "text-[var(--yellow)]", label: "Atenci\u00f3n" },
  rojo: { bg: "bg-[var(--red)]/15", text: "text-[var(--red)]", label: "Urgente" },
  vencido: { bg: "bg-[var(--red)]/15", text: "text-[var(--red)]", label: "Vencido" },
  urgente: { bg: "bg-[var(--red)]/15", text: "text-[var(--red)]", label: "Urgente" },
  proximo: { bg: "bg-[var(--yellow)]/15", text: "text-[var(--yellow)]", label: "Pr\u00f3ximo" },
  ok: { bg: "bg-[var(--green)]/15", text: "text-[var(--green)]", label: "OK" },
  agotadas: { bg: "bg-[var(--red)]/15", text: "text-[var(--red)]", label: "Agotadas" },
  ultima: { bg: "bg-[var(--yellow)]/15", text: "text-[var(--yellow)]", label: "\u00DAltima" },
  disponible: { bg: "bg-[var(--green)]/15", text: "text-[var(--green)]", label: "Disponible" },
};

export default function Semaforo({ value, label }: { value: string; label?: string }) {
  const config = COLORS[value] || COLORS.verde;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label || config.label}
    </span>
  );
}
