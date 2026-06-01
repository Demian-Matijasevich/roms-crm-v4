/**
 * Server component que muestra un indicador cuando hay una vista filtrada activa.
 * Se monta arriba del main para que sea obvio para el admin que está filtrando.
 */
import { getVista, VISTA_LABELS } from "@/lib/vista";

export default async function VistaBadge() {
  const vista = await getVista();
  if (vista === "todos") return null;
  return (
    <div
      className="mb-4 px-3 py-2 rounded-lg flex items-center justify-between text-sm"
      style={{
        background: vista === "politica" ? "rgba(168, 85, 247, 0.10)" : "rgba(16, 185, 129, 0.10)",
        border: `1px solid ${vista === "politica" ? "rgba(168, 85, 247, 0.30)" : "rgba(16, 185, 129, 0.30)"}`,
        color: vista === "politica" ? "#d8b4fe" : "#6ee7b7",
      }}
    >
      <span>
        Vista filtrada: <b>{VISTA_LABELS[vista]}</b>{" "}
        <span className="text-[var(--muted)] text-xs">— solo mostrando leads con nicho = "{vista}"</span>
      </span>
      <span className="text-[10px] text-[var(--muted)]">Cambiar vista en el sidebar</span>
    </div>
  );
}
