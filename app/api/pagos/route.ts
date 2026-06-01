import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pagoSchema } from "@/lib/schemas";
import { createPayment, uploadComprobante } from "@/lib/queries/payments";
import { createServerClient } from "@/lib/supabase-server";
import { syncLeadToSheet } from "@/lib/sheet-sync";
import type { MetodoPago, PaymentEstado } from "@/lib/types";

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function planToCuotas(plan: string | null | undefined): number {
  if (!plan) return 1;
  if (plan === "paid_in_full") return 1;
  if (plan === "2_cuotas") return 2;
  if (plan === "3_cuotas") return 3;
  return 0; // personalizado u otros → no auto-generar
}

export async function POST(req: NextRequest) {
  try {
    const result = await requireSession();
    if ("error" in result) return result.error;
    const session = result.session;

    // Handle file upload
    const isUpload = req.nextUrl.searchParams.get("upload") === "1";
    if (isUpload) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const leadId = formData.get("lead_id") as string;

      if (!file || !leadId) {
        return NextResponse.json({ error: "Archivo y lead_id requeridos" }, { status: 400 });
      }

      const url = await uploadComprobante(file, leadId);
      if (!url) {
        return NextResponse.json({ error: "Error al subir comprobante" }, { status: 500 });
      }

      return NextResponse.json({ ok: true, url });
    }

    // Handle payment creation
    const body = await req.json();
    const parsed = pagoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos invalidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const sb = createServerClient();
    const leadId = parsed.data.lead_id || null;
    const clientId = parsed.data.client_id || null;
    const numeroCuota = parsed.data.numero_cuota;
    const estado = parsed.data.estado as PaymentEstado;

    // B — Si se está cargando como "pagado" y existe una cuota pendiente con mismo lead/cliente + numero_cuota,
    //     actualizamos esa en lugar de crear duplicado.
    let payment: Awaited<ReturnType<typeof createPayment>> = null;
    let reusedPending = false;

    if (estado === "pagado" && (leadId || clientId)) {
      const q = sb
        .from("payments")
        .select("*")
        .eq("numero_cuota", numeroCuota)
        .eq("estado", "pendiente")
        .limit(1);
      if (leadId) q.eq("lead_id", leadId);
      if (clientId) q.eq("client_id", clientId);

      const { data: existingPending } = await q;
      const candidate = existingPending?.[0];

      if (candidate) {
        const updatePatch: Record<string, unknown> = {
          estado: "pagado",
          monto_usd: parsed.data.monto_usd,
          monto_ars: parsed.data.monto_ars,
          fecha_pago: parsed.data.fecha_pago,
          metodo_pago: (parsed.data.metodo_pago as MetodoPago) || null,
          receptor: parsed.data.receptor || null,
          cobrador_id: session.team_member_id,
          es_renovacion: parsed.data.es_renovacion,
        };
        if (body.comprobante_url) updatePatch.comprobante_url = body.comprobante_url;

        const { data: updated, error: updErr } = await sb
          .from("payments")
          .update(updatePatch)
          .eq("id", candidate.id)
          .select()
          .single();
        if (updErr) {
          console.error("[POST /api/pagos] update pending error:", updErr.message);
          return NextResponse.json({ error: updErr.message }, { status: 500 });
        }
        payment = updated as typeof payment;
        reusedPending = true;
      }
    }

    // Si no reusamos, crear pago nuevo
    if (!payment) {
      const paymentData: Record<string, unknown> = {
        lead_id: leadId,
        client_id: clientId,
        renewal_id: null,
        numero_cuota: numeroCuota,
        monto_usd: parsed.data.monto_usd,
        monto_ars: parsed.data.monto_ars,
        fecha_pago: parsed.data.fecha_pago,
        fecha_vencimiento: null,
        estado,
        metodo_pago: (parsed.data.metodo_pago as MetodoPago) || null,
        receptor: parsed.data.receptor || null,
        comprobante_url: (body.comprobante_url as string) || null,
        // Refund #2 — Setear cobrador_id también para refunds (no solo para pagados)
        cobrador_id: estado === "pagado" || estado === "refund" ? session.team_member_id : null,
        verificado: false,
        es_renovacion: parsed.data.es_renovacion,
        // 027 — Descuentos de comisión negociados (típicamente en refunds)
        descuento_comision_closer_usd: Number(parsed.data.descuento_comision_closer_usd || 0),
        descuento_comision_setter_usd: Number(parsed.data.descuento_comision_setter_usd || 0),
      };

      // createPayment espera Omit<Payment, ...>; usamos any local porque
      // los nuevos campos están en DB pero el tipo Payment puede no reflejarlos aún.
      payment = await createPayment(paymentData as Parameters<typeof createPayment>[0]);
      if (!payment) {
        return NextResponse.json({ error: "Error al crear pago" }, { status: 500 });
      }
    }

    // A — Auto-generar cuotas pendientes futuras si es c1 y existe plan_pago.
    let cuotasGeneradas: number = 0;
    if (estado === "pagado" && payment.numero_cuota === 1 && leadId) {
      const { data: leadRow } = await sb
        .from("leads")
        .select("plan_pago, ticket_total")
        .eq("id", leadId)
        .maybeSingle();

      const totalCuotas = planToCuotas(leadRow?.plan_pago as string | null);
      if (totalCuotas > 1 && leadRow) {
        const { data: existingNumbers } = await sb
          .from("payments")
          .select("numero_cuota")
          .eq("lead_id", leadId);
        const yaCargadas = new Set((existingNumbers || []).map((p) => p.numero_cuota));

        const restante = Math.max(0, Number(leadRow.ticket_total || 0) - Number(payment.monto_usd || 0));
        const montoPorCuota = totalCuotas > 1 ? Math.round(restante / (totalCuotas - 1)) : 0;

        const aCrear: Array<Record<string, unknown>> = [];
        for (let n = 2; n <= totalCuotas; n++) {
          if (yaCargadas.has(n)) continue;
          aCrear.push({
            lead_id: leadId,
            client_id: clientId,
            numero_cuota: n,
            monto_usd: montoPorCuota,
            monto_ars: 0,
            fecha_pago: null,
            fecha_vencimiento: addDays(parsed.data.fecha_pago, 30 * (n - 1)),
            estado: "pendiente",
            verificado: false,
            es_renovacion: false,
          });
        }
        if (aCrear.length > 0) {
          const { error: insErr } = await sb.from("payments").insert(aCrear);
          if (insErr) {
            console.error("[POST /api/pagos] generate future cuotas error:", insErr.message);
          } else {
            cuotasGeneradas = aCrear.length;
          }
        }
      }
    }

    // G — Avanzar estado del lead según completitud del ticket
    // Refund #1 — Si refund total → broke_cancelado en lead, inactivo en cliente
    let estadoAvanzado: string | null = null;
    if (payment.lead_id && (payment.estado === "pagado" || payment.estado === "refund")) {
      const { data: leadRow } = await sb
        .from("leads")
        .select("estado, ticket_total")
        .eq("id", payment.lead_id)
        .maybeSingle();

      const { data: pagosLead } = await sb
        .from("payments")
        .select("monto_usd, estado")
        .eq("lead_id", payment.lead_id);
      const totalPagado = (pagosLead || [])
        .filter((p) => p.estado === "pagado")
        .reduce((s, p) => s + Number(p.monto_usd || 0), 0);
      const totalRefund = (pagosLead || [])
        .filter((p) => p.estado === "refund")
        .reduce((s, p) => s + Number(p.monto_usd || 0), 0);
      const neto = totalPagado - totalRefund;
      const ticket = Number(leadRow?.ticket_total || 0);

      if (leadRow) {
        let targetEstado: string | null = null;
        if (neto <= 0 && totalRefund > 0) {
          // Refund total → broke_cancelado
          targetEstado = "broke_cancelado";
        } else if (payment.estado === "pagado") {
          const ESTADOS_FINAL = ["cerrado", "adentro_seguimiento"];
          if (!ESTADOS_FINAL.includes(leadRow.estado)) {
            targetEstado = ticket > 0 && neto >= ticket ? "cerrado" : "reserva";
          }
        }
        if (targetEstado && leadRow.estado !== targetEstado) {
          await sb.from("leads").update({ estado: targetEstado }).eq("id", payment.lead_id);
          estadoAvanzado = targetEstado;

          // Propagar al cliente si existe
          if (targetEstado === "broke_cancelado") {
            await sb
              .from("clients")
              .update({ estado: "inactivo" })
              .eq("lead_id", payment.lead_id);
          }
        }
      }
    }

    // Sync lead to Sheet ROMS
    if (payment.lead_id) await syncLeadToSheet(payment.lead_id);

    return NextResponse.json({
      ok: true,
      payment,
      reusedPending,
      cuotasGeneradas,
      estadoAvanzado,
    });
  } catch (err) {
    console.error("[POST /api/pagos]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const authResult = await requireSession();
  if ("error" in authResult) return authResult.error;
  const session = authResult.session;

  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

    const allowed = ["monto_usd", "monto_ars", "fecha_pago", "fecha_vencimiento", "estado", "metodo_pago", "receptor", "numero_cuota", "es_renovacion", "descuento_comision_closer_usd", "descuento_comision_setter_usd"];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in updates) patch[k] = updates[k];

    // Refund #2 — Si se está cambiando estado a refund o pagado y no había cobrador_id, setearlo
    if (patch.estado === "refund" || patch.estado === "pagado") {
      patch.cobrador_id = session.team_member_id;
    }

    const supabase = createServerClient();
    const { data, error } = await supabase.from("payments").update(patch).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Refund #1 — Si tras el cambio quedó refund total, mover lead a broke_cancelado
    let estadoAvanzado: string | null = null;
    if (data?.lead_id && (patch.estado === "refund" || patch.estado === "pagado")) {
      const { data: leadRow } = await supabase
        .from("leads")
        .select("estado, ticket_total")
        .eq("id", data.lead_id)
        .maybeSingle();
      const { data: pagosLead } = await supabase
        .from("payments")
        .select("monto_usd, estado")
        .eq("lead_id", data.lead_id);
      const totalPagado = (pagosLead || [])
        .filter((p) => p.estado === "pagado")
        .reduce((s, p) => s + Number(p.monto_usd || 0), 0);
      const totalRefund = (pagosLead || [])
        .filter((p) => p.estado === "refund")
        .reduce((s, p) => s + Number(p.monto_usd || 0), 0);
      const neto = totalPagado - totalRefund;

      if (leadRow && neto <= 0 && totalRefund > 0 && leadRow.estado !== "broke_cancelado") {
        await supabase.from("leads").update({ estado: "broke_cancelado" }).eq("id", data.lead_id);
        await supabase.from("clients").update({ estado: "inactivo" }).eq("lead_id", data.lead_id);
        estadoAvanzado = "broke_cancelado";
      }
    }

    if (data?.lead_id) await syncLeadToSheet(data.lead_id);
    return NextResponse.json({ ok: true, payment: data, estadoAvanzado });
  } catch (err) {
    console.error("[PATCH /api/pagos]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authResult = await requireSession();
  if ("error" in authResult) return authResult.error;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

    const supabase = createServerClient();
    // Fetch lead_id antes de borrar para resincar el Sheet después
    const { data: existing } = await supabase.from("payments").select("lead_id").eq("id", id).maybeSingle();
    const leadId = existing?.lead_id || null;

    const { error } = await supabase.from("payments").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Resync lead al Sheet para reflejar el nuevo estado (sin el pago borrado)
    let sheetSync: { ok: boolean; error?: string } | null = null;
    if (leadId) sheetSync = await syncLeadToSheet(leadId);

    return NextResponse.json({ ok: true, sheetSync });
  } catch (err) {
    console.error("[DELETE /api/pagos]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
