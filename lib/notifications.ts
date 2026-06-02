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
