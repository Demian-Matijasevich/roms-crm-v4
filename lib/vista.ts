/**
 * Selector de "Vista" del CRM — ROMS Todos / ROMS Normal (general) / ROMS Política.
 * Solo admins pueden cambiarla. Se guarda en cookie `roms_vista`.
 *
 * Valores:
 *   - "todos"     → muestra TODO (sin filtro)
 *   - "general"   → solo nicho = 'general' (ROMS Normal)
 *   - "politica"  → solo nicho = 'politica'
 *
 * Para verticales nuevos en el futuro: agregar al type, al selector y a este helper.
 */
import { cookies, headers } from "next/headers";

export type Vista = "todos" | "general" | "politica";

export const VISTA_COOKIE = "roms_vista";
export const VISTA_LABELS: Record<Vista, string> = {
  todos: "🌐 ROMS — Todos",
  general: "🛒 ROMS Normal",
  politica: "🏛 ROMS Política",
};

/**
 * Devuelve la vista actual.
 * - Si la request viene del subdominio política (header x-roms-vista=politica del middleware),
 *   FORZAR politica (no se puede cambiar dentro de ese subdominio).
 * - Sino, leer la cookie.
 */
export async function getVista(): Promise<Vista> {
  // Subdominio política tiene prioridad
  try {
    const h = await headers();
    if (h.get("x-roms-vista") === "politica") return "politica";
  } catch {
    // headers() puede fallar en contextos no-request
  }
  const c = await cookies();
  const raw = c.get(VISTA_COOKIE)?.value;
  if (raw === "general" || raw === "politica" || raw === "todos") return raw;
  return "todos";
}

/** True si la request entra desde el subdominio política (locked). */
export async function isPoliticaSubdomain(): Promise<boolean> {
  try {
    const h = await headers();
    return h.get("x-roms-vista") === "politica";
  } catch {
    return false;
  }
}

/**
 * Devuelve el valor de `nicho` a usar como filtro en queries.
 * null = no filtrar (vista = "todos").
 */
export async function getNichoFilter(): Promise<string | null> {
  const v = await getVista();
  if (v === "todos") return null;
  return v;
}

/**
 * Helper para queries Supabase: aplica filtro nicho si corresponde.
 * Acepta un query builder y devuelve el mismo encadenado.
 * Uso: applyNichoFilter(sb.from("leads").select("..."), nicho)
 */
export function applyNichoFilter<T extends { eq: (col: string, val: string) => T }>(
  query: T,
  nicho: string | null
): T {
  if (!nicho) return query;
  return query.eq("nicho", nicho);
}
