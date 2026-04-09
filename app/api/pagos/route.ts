import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pagoSchema } from "@/lib/schemas";
import { createPayment, uploadComprobante } from "@/lib/queries/payments";
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

    return NextResponse.json({ ok: true, payment });
  } catch (err) {
    console.error("[POST /api/pagos]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
