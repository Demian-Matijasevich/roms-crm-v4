import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireAdmin } from "@/lib/auth";
import { pagoSchema } from "@/lib/schemas";
import { createPayment, uploadComprobante } from "@/lib/queries/payments";
import { createServerClient } from "@/lib/supabase-server";
import { syncLeadToSheet } from "@/lib/sheet-sync";
import type { MetodoPago, PaymentEstado } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const result = await requireSession();
    if ("error" in result) return result.error;

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

    const paymentData = {
      lead_id: parsed.data.lead_id || null,
      client_id: parsed.data.client_id || null,
      renewal_id: null,
      numero_cuota: parsed.data.numero_cuota,
      monto_usd: parsed.data.monto_usd,
      monto_ars: parsed.data.monto_ars,
      fecha_pago: parsed.data.fecha_pago,
      fecha_vencimiento: null,
      estado: parsed.data.estado as PaymentEstado,
      metodo_pago: (parsed.data.metodo_pago as MetodoPago) || null,
      receptor: parsed.data.receptor || null,
      comprobante_url: (body.comprobante_url as string) || null,
      cobrador_id: null,
      verificado: false,
      es_renovacion: parsed.data.es_renovacion,
    };

    const payment = await createPayment(paymentData);
    if (!payment) {
      return NextResponse.json({ error: "Error al crear pago" }, { status: 500 });
    }

    // Sync lead to Sheet ROMS
    if (payment.lead_id) await syncLeadToSheet(payment.lead_id);

    return NextResponse.json({ ok: true, payment });
  } catch (err) {
    console.error("[POST /api/pagos]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const authResult = await requireAdmin();
  if ("error" in authResult) return authResult.error;

  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

    const allowed = ["monto_usd", "monto_ars", "fecha_pago", "fecha_vencimiento", "estado", "metodo_pago", "receptor", "numero_cuota", "es_renovacion"];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in updates) patch[k] = updates[k];

    const supabase = createServerClient();
    const { data, error } = await supabase.from("payments").update(patch).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data?.lead_id) await syncLeadToSheet(data.lead_id);
    return NextResponse.json({ ok: true, payment: data });
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
