import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { syncLeadToSheetSafe } from "@/lib/sheet-sync";

export const dynamic = "force-dynamic";

function normalizeTel(t: string | null | undefined): string | null {
  if (!t) return null;
  const digits = String(t).replace(/\D/g, "");
  return digits.length >= 6 ? digits : null;
}

const ADMIN_ONLY_FIELDS = new Set([
  "closer_id", "cobrador_id", "nombre", "email", "telefono",
  "fecha_agendado", "fecha_llamada", "ticket_total", "programa_pitcheado",
  "concepto", "plan_pago", "utm_source", "utm_medium", "utm_content",
  "fuente", "lead_calificado", "lead_score",
]);
// Setters/closers can only update setter_id/estado/notes on leads without setter (claim workflow)
const SETTER_ALLOWED_FIELDS = new Set(["setter_id", "estado", "notas_internas", "contexto_setter", "reporte_general"]);

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    if (!body.nombre || typeof body.nombre !== "string" || !body.nombre.trim()) {
      return NextResponse.json({ error: "nombre requerido" }, { status: 400 });
    }
    // Audit Juanma 2026-05-25: lead nuevo manual exige al menos un canal de
    // contacto + fuente. (iClosed webhook bypassa esto creando con email).
    const sourceWebhook = body._source === "webhook";
    if (!sourceWebhook) {
      const tieneContacto = !!(
        (body.instagram && String(body.instagram).trim()) ||
        (body.telefono && String(body.telefono).trim()) ||
        (body.email && String(body.email).trim())
      );
      if (!tieneContacto) {
        return NextResponse.json(
          { error: "Falta contacto — cargá al menos uno: instagram, teléfono o email." },
          { status: 400 }
        );
      }
      if (!body.fuente || !String(body.fuente).trim()) {
        return NextResponse.json(
          { error: "Falta fuente — seleccioná de dónde viene el lead." },
          { status: 400 }
        );
      }
    }

    const allowed = [
      "nombre", "email", "telefono", "instagram",
      "fuente", "utm_source", "utm_medium", "utm_content",
      "fecha_agendado", "fecha_llamada",
      "estado", "setter_id", "closer_id", "cobrador_id",
      "ticket_total", "programa_pitcheado", "concepto", "plan_pago",
      "lead_calificado", "lead_score",
      "contexto_setter", "reporte_general", "notas_internas",
    ];

    const insertData: Record<string, unknown> = {
      estado: "pendiente",
      ticket_total: 0,
      fue_seguimiento: false,
    };
    for (const k of allowed) {
      if (k in body && body[k] !== undefined && body[k] !== "") insertData[k] = body[k];
    }
    // Normalizar telefono automáticamente
    if (insertData.telefono) {
      insertData.telefono_normalizado = normalizeTel(insertData.telefono as string);
    }

    const sb = createServerClient();
    const { data, error } = await sb.from("leads").insert(insertData).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (data?.id) await syncLeadToSheetSafe(data.id);
    return NextResponse.json({ ok: true, lead: data });
  } catch (err) {
    console.error("[POST /api/leads]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  const session = auth.session;

  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

    const allowed = [
      "setter_id", "closer_id", "cobrador_id", "estado",
      "utm_source", "utm_medium", "utm_content",
      "nombre", "instagram", "email", "telefono",
      "fecha_agendado", "fecha_llamada",
      "ticket_total", "programa_pitcheado", "concepto", "plan_pago",
      "fuente", "lead_calificado", "lead_score",
      "contexto_setter", "reporte_general", "notas_internas",
      // 028 — Nicho
      "nicho",
      // 025 — Secure Scale
      "se_presento", "cerrado_en_llamada", "transcripcion_url",
      // 021 — Iñaki
      "fecha_cierre_estimada",
      // 029 — Tel normalizado
      "telefono_normalizado",
    ];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in updates) patch[k] = updates[k];

    // Si cambió el teléfono, auto-recomputar el normalizado
    if ("telefono" in patch) {
      patch.telefono_normalizado = normalizeTel(patch.telefono as string | null);
    }

    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "nada para actualizar" }, { status: 400 });

    // Non-admin: restrict fields, and for setter_id only allow claiming as self on unassigned leads
    if (!session.is_admin) {
      for (const k of Object.keys(patch)) {
        if (ADMIN_ONLY_FIELDS.has(k) || !SETTER_ALLOWED_FIELDS.has(k)) {
          return NextResponse.json({ error: `campo '${k}' requiere admin` }, { status: 403 });
        }
      }
      if ("setter_id" in patch) {
        // Allow only: self-assigning AND the lead currently has no setter
        if (patch.setter_id !== session.team_member_id) {
          return NextResponse.json({ error: "solo podés asignar a vos mismo" }, { status: 403 });
        }
        const sb = createServerClient();
        const { data: existing } = await sb.from("leads").select("setter_id").eq("id", id).maybeSingle();
        if (existing && existing.setter_id && existing.setter_id !== session.team_member_id) {
          return NextResponse.json({ error: "este lead ya tiene setter asignado" }, { status: 403 });
        }
      }
    }

    const sb = createServerClient();
    // Snapshot ANTES para audit
    const { data: oldRow } = await sb.from("leads").select("*").eq("id", id).maybeSingle();
    const { data, error } = await sb.from("leads").update(patch).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Audit log
    if (oldRow && data) {
      const { logAuditPatch } = await import("@/lib/audit");
      await logAuditPatch(session, "lead", id, oldRow as Record<string, unknown>, patch);
    }

    if (data?.id) await syncLeadToSheetSafe(data.id);

    return NextResponse.json({ ok: true, lead: data });
  } catch (err) {
    console.error("[PATCH /api/leads]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

    const sb = createServerClient();
    // Unlink related records first (preserve them, just break the FK to avoid constraint errors)
    await sb.from("clients").update({ lead_id: null }).eq("lead_id", id);
    await sb.from("tracker_sessions").update({ lead_id: null }).eq("lead_id", id);
    await sb.from("agent_tasks").update({ lead_id: null }).eq("lead_id", id);
    // Delete associated payments (no value preserving them without a lead)
    await sb.from("payments").delete().eq("lead_id", id);
    const { error } = await sb.from("leads").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/leads]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
