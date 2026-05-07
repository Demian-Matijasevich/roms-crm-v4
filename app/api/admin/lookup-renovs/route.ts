import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

/**
 * Para cada renovación con monto=0, busca si hay payments asociados al mismo cliente.
 * Útil para saber si la renov fue registrada pero el cash quedó en payments.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sb = createServerClient();
  const { data: renovs } = await sb
    .from("renewal_history")
    .select("id, client_id, monto_total, estado, fecha_renovacion, tipo_renovacion, programa_nuevo, client:clients(id, nombre, lead_id)")
    .eq("estado", "pago")
    .or("monto_total.eq.0,monto_total.is.null");

  if (!renovs) return NextResponse.json({ error: "no renovs" }, { status: 500 });

  const out = [];
  for (const r of renovs as Array<{ id: string; client_id: string; monto_total: number; fecha_renovacion: string | null; tipo_renovacion: string | null; programa_nuevo: string | null; client: { id: string; nombre: string; lead_id: string | null } | null }>) {
    if (!r.client) {
      out.push({ renov_id: r.id, status: "sin_cliente" });
      continue;
    }

    // Buscar payments del cliente — directo por client_id O via lead_id
    const orFilter = r.client.lead_id
      ? `client_id.eq.${r.client_id},lead_id.eq.${r.client.lead_id}`
      : `client_id.eq.${r.client_id}`;
    const { data: pays } = await sb
      .from("payments")
      .select("id, monto_usd, fecha_pago, estado, numero_cuota, es_renovacion, lead_id, client_id, renewal_id")
      .or(orFilter)
      .order("fecha_pago", { ascending: false });

    const totalPagado = (pays || []).filter((p) => p.estado === "pagado").reduce((s, p) => s + (p.monto_usd || 0), 0);
    const tieneRenovPagos = (pays || []).some((p) => p.es_renovacion && p.estado === "pagado");
    const renovPagosTotal = (pays || []).filter((p) => p.es_renovacion && p.estado === "pagado").reduce((s, p) => s + (p.monto_usd || 0), 0);

    out.push({
      cliente: r.client.nombre,
      lead_id: r.client.lead_id,
      renov_id: r.id,
      renov_fecha: r.fecha_renovacion,
      renov_tipo: r.tipo_renovacion,
      renov_programa: r.programa_nuevo,
      renov_monto: r.monto_total,
      total_payments: pays?.length || 0,
      total_pagado_cliente: totalPagado,
      tiene_renov_pagos: tieneRenovPagos,
      renov_pagos_total: renovPagosTotal,
      payments_sample: (pays || []).slice(0, 5).map((p) => ({
        id: p.id,
        fecha: p.fecha_pago,
        monto: p.monto_usd,
        estado: p.estado,
        cuota: p.numero_cuota,
        es_renovacion: p.es_renovacion,
      })),
      diagnostico: tieneRenovPagos
        ? `✅ Tiene ${renovPagosTotal} en payments con es_renovacion=true. La renovación SÍ se cobró pero el monto no se cargó en renewal_history.`
        : totalPagado > 0
        ? `⚠️ Hay payments del cliente ($${totalPagado}) pero NINGUNO marcado como renovación. Posibles cuotas pasadas. Investigar.`
        : "❌ Sin payments de ningún tipo. Renovación registrada pero nunca se cobró nada.",
    });
  }

  return NextResponse.json({ ok: true, count: out.length, renovs: out });
}
