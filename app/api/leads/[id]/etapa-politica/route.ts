/**
 * POST /api/leads/[id]/etapa-politica
 * Actualiza el campo etapa_politica de un lead.
 * Solo acepta valores: nuevo, caliente, aserrado, preserrado, cerrado, perdido.
 *
 * Si el lead NO es nicho=politica:
 *   - Requiere body.confirmar_migrar=true para migrarlo (evita pisar nicho
 *     por accidente al arrastrar en kanban).
 *   - Sin esa flag → 409 con mensaje explicito.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { createNotificationsForPolitica } from "@/lib/notifications";

export const dynamic = "force-dynamic";

const ETAPAS_VALIDAS = new Set(["nuevo", "caliente", "aserrado", "preserrado", "cerrado", "perdido"]);

const ICONO_ETAPA: Record<string, string> = {
  nuevo: "🆕",
  caliente: "🔥",
  aserrado: "⏳",
  preserrado: "🤝",
  cerrado: "🎯",
  perdido: "❌",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const body = await req.json();
  const etapa = String(body.etapa || "");

  if (!ETAPAS_VALIDAS.has(etapa)) {
    return NextResponse.json({ error: "etapa inválida" }, { status: 400 });
  }

  const sb = createServerClient();
  const { data: lead, error: leadErr } = await sb.from("leads").select("id, nombre, nicho, etapa_politica").eq("id", id).maybeSingle();
  if (leadErr) return NextResponse.json({ error: leadErr.message }, { status: 500 });
  if (!lead) return NextResponse.json({ error: "lead no encontrado" }, { status: 404 });

  // Guard: si el lead NO es política, requiere confirmación explícita para migrar.
  // Evita que un arrastre en kanban convierta silenciosamente un lead general.
  const confirmarMigrar = body.confirmar_migrar === true;
  if (lead.nicho !== "politica" && !confirmarMigrar) {
    return NextResponse.json({
      error: "Este lead no es nicho política. Confirmá la migración con confirmar_migrar:true.",
      lead_nicho: lead.nicho,
    }, { status: 409 });
  }

  const updates: Record<string, unknown> = { etapa_politica: etapa };
  if (lead.nicho !== "politica") updates.nicho = "politica";

  // UPDATE atómico: usar .eq() en el nicho que vimos para detectar race conditions
  // (otra request cambiando nicho entre nuestro SELECT y UPDATE).
  let updateQuery = sb.from("leads").update(updates).eq("id", id);
  if (lead.nicho !== null) updateQuery = updateQuery.eq("nicho", lead.nicho);
  else updateQuery = updateQuery.is("nicho", null);
  const { data: updated, error } = await updateQuery.select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: "El nicho del lead cambió en otra request, recargá." }, { status: 409 });
  }

  // Activity log + Notif al equipo política cuando cambia de etapa
  if (lead.etapa_politica !== etapa) {
    const from = lead.etapa_politica || "—";
    await sb.from("lead_activity").insert({
      lead_id: id,
      actor_id: auth.session.team_member_id || null,
      actor_nombre: auth.session.nombre,
      tipo: "etapa_change",
      mensaje: `movió de ${from} a ${etapa}`,
      meta: { from, to: etapa },
    });

    const icono = ICONO_ETAPA[etapa] || "📋";
    await createNotificationsForPolitica({
      tipo: etapa === "cerrado" ? "venta" : "info",
      titulo: `${icono} ${lead.nombre || "Lead"} → ${etapa}`,
      mensaje: `${auth.session.nombre} movió "${lead.nombre}" a ${etapa}`,
      link: `/pipeline?lead=${id}`,
      meta: { lead_id: id, etapa, actor: auth.session.nombre },
    }, { excludeNombres: [auth.session.nombre] });
  }

  return NextResponse.json({ ok: true, etapa, nicho_propagado: lead.nicho !== "politica" });
}
