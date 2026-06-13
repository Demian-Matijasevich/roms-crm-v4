import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "";

const PROGRAMA_DAYS: Record<string, number> = {
  roms_7: 90,
  consultoria: 90,
  omnipresencia: 120,
  multicuentas: 120,
};

/**
 * Crea registros en `clients` para cada lead cerrado/adentro_seguimiento
 * que NO tenga ya un cliente asociado. Usa fecha_pago del primer pago como
 * fecha_onboarding (o fecha_llamada si no hay pago).
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const dry = url.searchParams.get("dry") === "1";

  const sb = createServerClient();

  // Leads cerrados o adentro_seguimiento
  const { data: leads } = await sb
    .from("leads")
    .select("id, nombre, email, telefono, instagram, fecha_llamada, programa_pitcheado, estado, ticket_total")
    .in("estado", ["cerrado", "adentro_seguimiento"])
    .range(0, 4999);
  if (!leads) return NextResponse.json({ error: "no leads" }, { status: 500 });

  // Clients existentes (para no duplicar)
  const { data: existingClients } = await sb.from("clients").select("lead_id").not("lead_id", "is", null);
  const clientLeadIds = new Set((existingClients || []).map((c) => c.lead_id));

  // Pagos para fecha_onboarding
  const leadIds = leads.map((l) => l.id);
  const { data: payments } = await sb
    .from("payments")
    .select("lead_id, fecha_pago, monto_usd, estado")
    .in("lead_id", leadIds)
    .eq("estado", "pagado")
    .order("fecha_pago");
  const firstPayByLead = new Map<string, string>();
  for (const p of payments || []) {
    if (!p.lead_id || !p.fecha_pago) continue;
    if (!firstPayByLead.has(p.lead_id)) firstPayByLead.set(p.lead_id, p.fecha_pago);
  }

  let created = 0, skipped = 0, errors: string[] = [];
  const sample: unknown[] = [];

  for (const l of leads) {
    if (clientLeadIds.has(l.id)) { skipped++; continue; }
    const fechaPago = firstPayByLead.get(l.id);
    const fechaOnb = (fechaPago || l.fecha_llamada || "").split("T")[0] || null;
    if (!fechaOnb) { skipped++; continue; }
    const totalDias = PROGRAMA_DAYS[l.programa_pitcheado || ""] || 90;

    const clientData = {
      lead_id: l.id,
      nombre: l.nombre,
      email: l.email,
      telefono: l.telefono,
      programa: l.programa_pitcheado,
      estado: "activo",
      fecha_onboarding: fechaOnb,
      total_dias_programa: totalDias,
      llamadas_base: 3,
      health_score: 70,
      estado_contacto: "por_contactar",
      estado_seguimiento: "no_necesita",
      pesadilla: false,
      exito: false,
      discord: false,
      skool: false,
      win_discord: false,
      en_wa_esa: false,
      en_ig_grupo: false,
      deudor_usd: 0,
    };

    if (dry) {
      sample.push({ leadId: l.id, nombre: l.nombre, fechaOnb, programa: l.programa_pitcheado, totalDias });
      created++;
      continue;
    }

    const { error } = await sb.from("clients").insert(clientData);
    if (error) {
      errors.push(`${l.nombre}: ${error.message}`);
      continue;
    }
    created++;
    if (sample.length < 30) sample.push({ leadId: l.id, nombre: l.nombre, fechaOnb });
  }

  return NextResponse.json({
    ok: true,
    dry_run: dry,
    total_leads_cerrados: leads.length,
    skipped_already_client: skipped,
    created,
    errors: errors.slice(0, 20),
    sample,
  });
}
