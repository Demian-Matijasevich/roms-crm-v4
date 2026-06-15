/**
 * Helpers para crear notificaciones in-app.
 * Server-side: usar createServerClient + createNotification.
 */
import { createServerClient } from "@/lib/supabase-server";

export type TipoNotif = "lead_frio" | "refund" | "cuota_riesgo" | "apure" | "venta" | "renovacion" | "alerta" | "info";

export interface CreateNotifInput {
  recipient_id: string;
  tipo: TipoNotif;
  titulo: string;
  mensaje?: string;
  link?: string;
  meta?: Record<string, unknown>;
}

export async function createNotification(input: CreateNotifInput): Promise<{ ok: boolean; error?: string }> {
  const sb = createServerClient();
  const { error } = await sb.from("notifications").insert({
    recipient_id: input.recipient_id,
    tipo: input.tipo,
    titulo: input.titulo,
    mensaje: input.mensaje || null,
    link: input.link || null,
    meta: input.meta || null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function createNotificationsForAdmins(input: Omit<CreateNotifInput, "recipient_id">): Promise<number> {
  const sb = createServerClient();
  const { data: admins } = await sb.from("team_members").select("id").eq("is_admin", true).eq("activo", true);
  if (!admins) return 0;
  const rows = admins.map((a) => ({
    recipient_id: a.id,
    tipo: input.tipo,
    titulo: input.titulo,
    mensaje: input.mensaje || null,
    link: input.link || null,
    meta: input.meta || null,
  }));
  const { error } = await sb.from("notifications").insert(rows);
  if (error) return 0;
  return rows.length;
}

/**
 * Notifica a todos los miembros del equipo política.
 * Se basa en la flag team_members.is_politica (boolean). Para agregar/quitar
 * gente, toggle desde `/admin` o directo en la DB. Fallback de migración:
 * si la flag no está seteada todavía, usa la whitelist legacy.
 */
const POLITICA_NOMBRES_LEGACY = ["Juanma", "Mati", "Fran", "Seba", "Nacho", "Nicolás"];

export async function createNotificationsForPolitica(
  input: Omit<CreateNotifInput, "recipient_id">,
  opts: { excludeNombres?: string[] } = {}
): Promise<number> {
  const sb = createServerClient();
  const exclude = new Set(opts.excludeNombres || []);

  // Primero intenta la flag is_politica.
  const { data: politicaMembers } = await sb
    .from("team_members")
    .select("id, nombre")
    .eq("is_politica", true)
    .eq("activo", true);

  let members = politicaMembers || [];
  // Fallback: si nadie tiene la flag (post-migración inmediata o si nunca se
  // setea), usar la whitelist hardcodeada por compatibilidad.
  if (members.length === 0) {
    const { data: fallback } = await sb
      .from("team_members")
      .select("id, nombre")
      .in("nombre", POLITICA_NOMBRES_LEGACY)
      .eq("activo", true);
    members = fallback || [];
  }

  const filtered = members.filter((m) => !exclude.has(m.nombre));
  if (filtered.length === 0) return 0;
  const rows = filtered.map((m) => ({
    recipient_id: m.id,
    tipo: input.tipo,
    titulo: input.titulo,
    mensaje: input.mensaje || null,
    link: input.link || null,
    meta: input.meta || null,
  }));
  const { error } = await sb.from("notifications").insert(rows);
  if (error) return 0;
  return rows.length;
}
