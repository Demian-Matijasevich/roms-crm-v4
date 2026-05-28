import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import type { MetodoPago, PaymentEstado } from "@/lib/types";

/**
 * POST /api/admin/refund-bulk
 * Carga masiva de refunds historicos.
 *
 * Body:
 * {
 *   refunds: [
 *     { lead_name: "Juan Perez", monto_usd: 1200, fecha: "2026-03-15", motivo?: "chargeback", numero_cuota?: 1 }
 *   ]
 * }
 *
 * Para cada item:
 * - Busca lead por nombre (case-insensitive, contiene)
 * - Si encuentra exacto 1 match → crea payment estado=refund
 * - Setea cobrador_id = admin que esta cargando
 * - Si tras el refund el neto <= 0 → lead = broke_cancelado
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const session = auth.session;

  try {
    const body = await req.json();
    const refunds = Array.isArray(body?.refunds) ? body.refunds : [];
    if (refunds.length === 0) {
      return NextResponse.json({ error: "refunds[] vacio" }, { status: 400 });
    }

    const sb = createServerClient();
    const report: Array<{
      lead_name: string;
      status: "ok" | "not_found" | "ambiguous" | "error";
      payment_id?: string;
      lead_id?: string;
      matches?: number;
      error?: string;
      estadoAvanzado?: string | null;
    }> = [];

    for (const r of refunds) {
      const leadName = String(r?.lead_name || "").trim();
      const monto = Number(r?.monto_usd || 0);
      const fecha = String(r?.fecha || "").trim();
      const motivo = String(r?.motivo || "").trim();
      const numeroCuota = Number(r?.numero_cuota || 1);
      const metodoPago = (r?.metodo_pago as MetodoPago | undefined) || ("transferencia" as MetodoPago);

      if (!leadName || !monto || !fecha) {
        report.push({ lead_name: leadName || "(vacio)", status: "error", error: "Faltan lead_name, monto_usd o fecha" });
        continue;
      }

      const { data: leads } = await sb
        .from("leads")
        .select("id, nombre, estado, ticket_total")
        .ilike("nombre", `%${leadName}%`)
        .limit(5);

      const matches = leads?.length || 0;
      if (matches === 0) {
        report.push({ lead_name: leadName, status: "not_found", matches: 0 });
        continue;
      }
      if (matches > 1) {
        report.push({ lead_name: leadName, status: "ambiguous", matches });
        continue;
      }

      const lead = leads![0];
      const { data: payment, error: insErr } = await sb
        .from("payments")
        .insert({
          lead_id: lead.id,
          client_id: null,
          renewal_id: null,
          numero_cuota: numeroCuota,
          monto_usd: monto,
          monto_ars: 0,
          fecha_pago: fecha,
          fecha_vencimiento: null,
          estado: "refund" as PaymentEstado,
          metodo_pago: metodoPago,
          receptor: motivo ? `Refund - ${motivo}` : "Refund",
          cobrador_id: session.team_member_id,
          verificado: false,
          es_renovacion: false,
        })
        .select()
        .single();

      if (insErr) {
        report.push({ lead_name: leadName, status: "error", error: insErr.message });
        continue;
      }

      // Recalcular neto y actualizar estado del lead si corresponde
      const { data: pagosLead } = await sb
        .from("payments")
        .select("monto_usd, estado")
        .eq("lead_id", lead.id);
      const totalPagado = (pagosLead || []).filter((p) => p.estado === "pagado").reduce((s, p) => s + Number(p.monto_usd || 0), 0);
      const totalRefund = (pagosLead || []).filter((p) => p.estado === "refund").reduce((s, p) => s + Number(p.monto_usd || 0), 0);
      const neto = totalPagado - totalRefund;

      let estadoAvanzado: string | null = null;
      if (neto <= 0 && totalRefund > 0 && lead.estado !== "broke_cancelado") {
        await sb.from("leads").update({ estado: "broke_cancelado" }).eq("id", lead.id);
        await sb.from("clients").update({ estado: "inactivo" }).eq("lead_id", lead.id);
        estadoAvanzado = "broke_cancelado";
      }

      report.push({
        lead_name: leadName,
        status: "ok",
        payment_id: payment!.id,
        lead_id: lead.id,
        estadoAvanzado,
      });
    }

    const ok = report.filter((r) => r.status === "ok").length;
    const not_found = report.filter((r) => r.status === "not_found").length;
    const ambiguous = report.filter((r) => r.status === "ambiguous").length;
    const errored = report.filter((r) => r.status === "error").length;

    return NextResponse.json({
      ok: true,
      summary: { ok, not_found, ambiguous, error: errored, total: refunds.length },
      report,
    });
  } catch (err) {
    console.error("[POST /api/admin/refund-bulk]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
