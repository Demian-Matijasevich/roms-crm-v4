import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { markPaidSchema } from "@/lib/schemas";
import { markPaymentPaid, markTaskDone } from "@/lib/queries/cobranzas";
import { createAgentLogEntry } from "@/lib/queries/agent-tasks";

export async function POST(request: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const parsed = markPaidSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos invalidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const { payment_id, task_id, ...paymentData } = parsed.data;
    let payment = null;

    // Mark payment as paid if we have a payment_id
    if (payment_id) {
      payment = await markPaymentPaid(payment_id, {
        monto_usd: paymentData.monto_usd,
        monto_ars: paymentData.monto_ars,
        metodo_pago: paymentData.metodo_pago,
        receptor: paymentData.receptor,
        cobrador_id: paymentData.cobrador_id,
        comprobante_url: paymentData.comprobante_url,
      });
    }

    // Mark associated task as done if we have a task_id
    if (task_id) {
      await markTaskDone(task_id, `Pago registrado: $${paymentData.monto_usd} via ${paymentData.metodo_pago}`);

      // Log the action
      await createAgentLogEntry({
        task_id,
        accion: `Pago marcado como pagado por ${auth.session.nombre}`,
        mensaje_enviado: null,
        respuesta_recibida: null,
        resultado: `$${paymentData.monto_usd} USD via ${paymentData.metodo_pago} a ${paymentData.receptor}`,
      });
    }

    return NextResponse.json({ success: true, payment });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
