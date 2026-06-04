/**
 * POST /api/leads/[id]/etapa-politica
 * Actualiza el campo etapa_politica de un lead.
 * Solo acepta valores: nuevo, caliente, aserrado, preserrado, cerrado, perdido.
 * Si el lead no es nicho=politica todavía, lo marca como politica (auto-propagación).
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

  const updates: Record<string, unknown> = { etapa_politica: etapa };
  if (lead.nicho !== "politica") updates.nicho = "politica";

  const { error } = await sb.from("leads").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notif al equipo política cuando cambia de etapa (excluye al propio actor)
  if (lead.etapa_politica !== etapa) {
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
