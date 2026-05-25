import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { z } from "zod";

const ESTADOS = ["nuevo", "intentado", "respondio", "agendado", "descartado"] as const;

const prospectoBaseSchema = z.object({
  nombre: z.string().max(200).optional().nullable(),
  telefono: z.string().min(1).max(50),
  instagram: z.string().max(100).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  origen: z.string().max(100).optional().nullable(),
  notas: z.string().max(4000).optional().nullable(),
  etiquetas: z.array(z.string().max(50)).max(20).optional().default([]),
  asignado_a: z.string().uuid().optional().nullable(),
});

// POST: bulk create (acepta array de telefonos o un objeto completo)
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const sb = createServerClient();
    const me = auth.session.team_member_id;

    // Modo bulk: { telefonos: ["...", "..."], asignado_a?: uuid, origen?, etiquetas? }
    if (Array.isArray(body.telefonos)) {
      const cleaned = (body.telefonos as unknown[])
        .map((t) => String(t).trim())
        .filter((t) => t.length > 0);
      if (cleaned.length === 0) {
        return NextResponse.json({ error: "Cargá al menos un teléfono" }, { status: 400 });
      }
      const asignado = body.asignado_a || me;
      const rows = cleaned.map((tel) => ({
        telefono: tel,
        origen: body.origen || null,
        etiquetas: Array.isArray(body.etiquetas) ? body.etiquetas : [],
        notas: body.notas || null,
        asignado_a: asignado,
        creado_por: me,
        estado: "nuevo" as const,
      }));
      const { data, error } = await sb.from("prospectos").insert(rows).select();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, count: data?.length ?? 0, prospectos: data });
    }

    // Modo single
    const parsed = prospectoBaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 400 });
    }
    const row = {
      nombre: parsed.data.nombre || null,
      telefono: parsed.data.telefono,
      instagram: parsed.data.instagram || null,
      email: parsed.data.email || null,
      origen: parsed.data.origen || null,
      notas: parsed.data.notas || null,
      etiquetas: parsed.data.etiquetas ?? [],
      asignado_a: parsed.data.asignado_a || me,
      creado_por: me,
      estado: "nuevo" as const,
    };
    const { data, error } = await sb.from("prospectos").insert(row).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, prospecto: data });
  } catch (err) {
    console.error("[POST /api/prospectos]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// PATCH: update single
export async function PATCH(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const { id, ...rest } = body;
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

    const allowed = [
      "nombre", "telefono", "instagram", "email", "origen", "notas",
      "etiquetas", "estado", "asignado_a", "fecha_ultimo_contacto",
      "fecha_proximo_seguimiento", "convertido_lead_id",
    ];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in rest) patch[k] = rest[k];

    if (patch.estado && !ESTADOS.includes(patch.estado as typeof ESTADOS[number])) {
      return NextResponse.json({ error: "Estado invalido" }, { status: 400 });
    }
    // Si pasa a "intentado" o "respondio" y no hay fecha_ultimo_contacto, ponerla ahora
    if ((patch.estado === "intentado" || patch.estado === "respondio") && !patch.fecha_ultimo_contacto) {
      patch.fecha_ultimo_contacto = new Date().toISOString();
    }

    const sb = createServerClient();
    const { data, error } = await sb.from("prospectos").update(patch).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, prospecto: data });
  } catch (err) {
    console.error("[PATCH /api/prospectos]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    const sb = createServerClient();
    const { error } = await sb.from("prospectos").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/prospectos]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
