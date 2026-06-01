/**
 * Server component que muestra un indicador cuando hay una vista filtrada activa.
 * Se monta arriba del main para que sea obvio para el admin que está filtrando.
 */
import { getVista } from "@/lib/vista";

export default async function VistaBadge() {
  const vista = await getVista();
  // Solo mostrar cuando estás en ROMS Política. Normal (= todos) no muestra badge.
  if (vista !== "politica") return null;
  return (
    <div
      className="mb-4 px-3 py-2 rounded-lg flex items-center justify-between text-sm"
      style={{
        background: "rgba(168, 85, 247, 0.10)",
        border: "1px solid rgba(168, 85, 247, 0.30)",
        color: "#d8b4fe",
      }}
    >
      <span>
        Estás en <b>🏛 ROMS Política</b>{" "}
        <span className="text-[var(--muted)] text-xs">— solo se muestran clientes políticos</span>
      </span>
      <span className="text-[10px] text-[var(--muted)]">Cambiar app en el sidebar</span>
    </div>
  );
}
