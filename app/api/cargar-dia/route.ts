import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { createPayment } from "@/lib/queries/payments";
import { syncLeadToSheet } from "@/lib/sheet-sync";
import type { MetodoPago } from "@/lib/types";

// GET /api/cargar-dia?closer_id=X&fecha=YYYY-MM-DD
// Returns leads for that closer with fecha_llamada or fecha_agendado on that date.
export async function GET(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  const closer_id = url.searchParams.get("closer_id");
  const fecha = url.searchParams.get("fecha");
  if (!closer_id || !fecha) {
    return NextResponse.json({ error: "closer_id y fecha requeridos" }, { status: 400 });
  }

  const sb = createServerClient();
  // Leads with closer = X AND (fecha_llamada OR fecha_agendado) = fecha
  const { data, error } = await sb
    .from("leads")
    .select("id, nombre, email, instagram, telefono, fecha_llamada, fecha_agendado, estado, programa_pitcheado, ticket_total, notas_internas")
    .eq("closer_id", closer_id)
    .or(`fecha_llamada.gte.${fecha},fecha_agendado.gte.${fecha}`)
    .or(`fecha_llamada.lte.${fecha}T23:59:59,fecha_agendado.lte.${fecha}T23:59:59`)
    .range(0, 999);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Filter client-side for precise day match (handling both date and timestamp formats)
  const filtered = (data || []).filter((l) => {
    const fl = l.fecha_llamada?.split("T")[0];
    const fa = l.fecha_agendado?.split("T")[0];
    return fl === fecha || fa === fecha;
  });

  // Order by fecha_llamada then fecha_agendado
  filtered.sort((a, b) => {
    const ta = (a.fecha_llamada || a.fecha_agendado || "");
    const tb = (b.fecha_llamada || b.fecha_agendado || "");
    return ta.localeCompare(tb);
  });

  return NextResponse.json({ leads: filtered });
}

// POST /api/cargar-dia
// Body: { lead_id, estado, programa, ticket_total, notas, payment?: {...} }
export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  try {
    const body = await req.json();
    const { lead_id, estado, programa, ticket_total, notas, payment } = body as {
      lead_id: string;
      estado: string;
      programa: string | null;
      ticket_total: number | null;
      notas: string | null;
      payment: { monto_usd: number; monto_ars: number; fecha_pago: string | null; metodo_pago: string | null; receptor: string | null; comprobante_url: string | null } | null;
    };

    if (!lead_id || !estado) return NextResponse.json({ error: "lead_id y estado requeridos" }, { status: 400 });

    const sb = createServerClient();

    // Fetch current lead to preserve data we don't touch
    const { data: current } = await sb.from("leads").select("notas_internas, ticket_total, programa_pitcheado, fecha_llamada, fecha_agendado").eq("id", lead_id).single();

    // Build update
    const update: Record<string, unknown> = { estado };
    if (programa) update.programa_pitcheado = programa;
    if (ticket_total !== null && ticket_total > 0) update.ticket_total = ticket_total;

    // Append notas (don't overwrite)
    if (notas && notas.trim()) {
      const existingNotes = current?.notas_internas || "";
      update.notas_internas = existingNotes ? `${existingNotes}\n${new Date().toISOString().split("T")[0]}: ${notas}` : notas;
    }

    // Set fecha_llamada to today if not set (or keep existing)
    if (!current?.fecha_llamada && current?.fecha_agendado) {
      update.fecha_llamada = current.fecha_agendado;
    }

    const { error: updateErr } = await sb.from("leads").update(update).eq("id", lead_id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    // Create payment if applicable
    if (payment && (payment.monto_usd > 0 || payment.monto_ars > 0)) {
      // Check existing payments to avoid dup
      const { data: existingPays } = await sb.from("payments").select("numero_cuota").eq("lead_id", lead_id).order("numero_cuota", { ascending: false }).limit(1);
      const nextCuota = existingPays?.[0]?.numero_cuota ? existingPays[0].numero_cuota + 1 : 1;

      await createPayment({
        lead_id,
        client_id: null,
        renewal_id: null,
        numero_cuota: nextCuota,
        monto_usd: payment.monto_usd || 0,
        monto_ars: payment.monto_ars || 0,
        fecha_pago: payment.fecha_pago,
        fecha_vencimiento: null,
        estado: "pagado",
        metodo_pago: (payment.metodo_pago as MetodoPago) || null,
        receptor: payment.receptor || null,
        comprobante_url: payment.comprobante_url || null,
        cobrador_id: null,
        verificado: false,
        es_renovacion: false,
      });
    }

    // Sync to Sheet ROMS (best-effort, don't fail the response)
    const sheetSync = await syncLeadToSheet(lead_id);

    return NextResponse.json({ ok: true, sheetSync });
  } catch (err) {
    console.error("[POST /api/cargar-dia]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
