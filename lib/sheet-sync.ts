import { createServerClient } from "@/lib/supabase-server";
import { upsertLeadToSheet } from "@/lib/sheets-write";

/**
 * Helper to sync a lead to the Registro Calls Sheet.
 * Call this AFTER any lead/payment insert or update in API routes,
 * in a fire-and-forget manner (await the promise but catch errors so
 * failure doesn't block the primary write).
 */
export async function syncLeadToSheet(leadId: string): Promise<{ ok: boolean; row?: number | null; error?: string }> {
  try {
    const sb = createServerClient();
    const { data: lead, error } = await sb
      .from("leads")
      .select("id, sheets_row_index, nombre, instagram, email, telefono, fecha_llamada, fecha_agendado, estado, programa_pitcheado, ticket_total, fuente, closer_id, setter_id")
      .eq("id", leadId)
      .maybeSingle();
    if (error || !lead) return { ok: false, error: error?.message || "lead not found" };

    // Fetch closer/setter names
    const memberIds = [lead.closer_id, lead.setter_id].filter((x): x is string => !!x);
    let closer_nombre: string | null = null;
    let setter_nombre: string | null = null;
    if (memberIds.length > 0) {
      const { data: members } = await sb.from("team_members").select("id, nombre").in("id", memberIds);
      for (const m of members || []) {
        if (m.id === lead.closer_id) closer_nombre = m.nombre;
        if (m.id === lead.setter_id) setter_nombre = m.nombre;
      }
    }

    // Fetch receptor from first payment
    const { data: pays } = await sb
      .from("payments")
      .select("receptor, numero_cuota")
      .eq("lead_id", leadId)
      .eq("estado", "pagado")
      .order("numero_cuota")
      .limit(1);
    const receptor = pays?.[0]?.receptor || null;

    const row = await upsertLeadToSheet({
      id: lead.id,
      sheets_row_index: lead.sheets_row_index,
      nombre: lead.nombre,
      instagram: lead.instagram,
      email: lead.email,
      telefono: lead.telefono,
      fecha_llamada: lead.fecha_llamada,
      fecha_agendado: lead.fecha_agendado,
      estado: lead.estado,
      programa_pitcheado: lead.programa_pitcheado,
      ticket_total: lead.ticket_total || 0,
      fuente: lead.fuente,
      closer_nombre,
      setter_nombre,
      receptor,
    });

    if (row && !lead.sheets_row_index) {
      await sb.from("leads").update({ sheets_row_index: row }).eq("id", lead.id);
    }
    return { ok: true, row };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
