import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getUsdRate } from "@/lib/queries/settings";
import { checkRateLimit, autoIdempotencyKey } from "@/lib/rate-limit";

const socioEnum = z.enum(["JUANMA", "FRAN"]);

const descuentoSchema = z
  .object({
    socio: socioEnum,
    concepto: z.string().min(3, "concepto muy corto").max(500, "concepto muy largo"),
    monto_usd: z.number().finite().nonnegative().max(10_000_000).optional(),
    monto_ars: z.number().finite().nonnegative().max(10_000_000_000).optional(),
    fecha: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "fecha inválida (YYYY-MM-DD)")
      .refine((s) => {
        const d = new Date(s);
        return !isNaN(d.getTime()) && s >= "2020-01-01" && s <= "2100-01-01";
      }, "fecha fuera de rango")
      .optional(),
    // Mes al que se devenga el descuento (YYYY-MM). Opcional: si no viene,
    // se deriva de `fecha`. NUNCA se infiere del concepto.
    devengado_mes: z
      .string()
      .regex(/^\d{4}-\d{2}$/, "devengado_mes inválido (YYYY-MM)")
      .refine((s) => s >= "2020-01" && s <= "2100-12", "devengado_mes fuera de rango")
      .optional(),
  })
  .refine((d) => (d.monto_usd ?? 0) > 0 || (d.monto_ars ?? 0) > 0, {
    message: "monto_usd o monto_ars requerido (>0)",
    path: ["monto_usd"],
  });

async function getRateForMonth(mes: string): Promise<number> {
  const sb = createServerClient();
  const { data } = await sb
    .from("usd_rate_history")
    .select("rate")
    .eq("mes", mes)
    .maybeSingle();
  if (data?.rate && Number(data.rate) > 0) return Number(data.rate);
  return getUsdRate();
}

function nombreSocio(s: "JUANMA" | "FRAN"): string {
  return s === "JUANMA" ? "Juanma" : "Fran";
}

async function resolveBilletera(
  supabase: ReturnType<typeof createServerClient>,
  preferida: string,
  fallbackMoneda: "usd" | "ars",
): Promise<string> {
  const { data } = await supabase
    .from("gastos_cajas")
    .select("nombre")
    .eq("nombre", preferida)
    .eq("activo", true)
    .maybeSingle();
  if (data?.nombre) return data.nombre;
  return fallbackMoneda === "ars" ? "cash_ars" : "cash_usd";
}

export async function POST(req: NextRequest) {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  // Rate limit: 10 req/min por sesión (in-memory, alcanza para admin).
  const sessionId = String(result.session.team_member_id);
  const rl = checkRateLimit(`caja-descuento-personal:${sessionId}`);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Demasiadas requests, probá en un rato" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  // Idempotency key: header opcional; si no viene se auto-genera un dedupe de 1.5s.
  const idemHeader = req.headers.get("Idempotency-Key")?.trim();
  const idempotencyKey =
    idemHeader && idemHeader.length > 0 && idemHeader.length <= 200
      ? idemHeader
      : autoIdempotencyKey("caja-descuento-personal", sessionId);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = descuentoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Body inválido", detalles: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { socio, concepto, monto_usd, monto_ars, fecha, devengado_mes } = parsed.data;
  const fechaFinal = fecha ?? new Date().toISOString().slice(0, 10);
  const mes = fechaFinal.slice(0, 7);
  const devengadoMesFinal = devengado_mes ?? mes;

  try {
    const rateAplicado = await getRateForMonth(mes);
    let mUsd = Number(monto_usd) || 0;
    const mArs = Number(monto_ars) || 0;
    if (mUsd === 0 && mArs > 0 && rateAplicado > 0) {
      mUsd = +(mArs / rateAplicado).toFixed(2);
    }

    const socioNombre = nombreSocio(socio);
    const conceptoFinal = `Descuento personal ${socioNombre}: ${concepto}`;

    const supabase = createServerClient();
    const billetera = await resolveBilletera(supabase, "sin_caja", mUsd > 0 ? "usd" : "ars");

    const { data, error } = await supabase
      .from("gastos")
      .insert({
        fecha: fechaFinal,
        concepto: conceptoFinal,
        categoria: "personal socio",
        monto_usd: mUsd,
        monto_ars: mArs,
        billetera,
        pagado_a: `${socioNombre} (personal)`,
        pagado_por: socioNombre,
        estado: "pagado",
        nicho: "general",
        usd_rate_aplicado: rateAplicado,
        devengado_mes: devengadoMesFinal,
        wa_msg_id: idempotencyKey,
      })
      .select("id")
      .single();

    if (error) {
      // 23505 = unique_violation → ya existe un gasto con este Idempotency-Key
      if ((error as { code?: string }).code === "23505") {
        return NextResponse.json({ error: "already_processed" }, { status: 409 });
      }
      console.error("[POST /api/caja/descuento-personal] pg error", error);
      return NextResponse.json({ error: "Error al registrar" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data?.id });
  } catch (err) {
    console.error("[POST /api/caja/descuento-personal]", err);
    return NextResponse.json({ error: "Error al registrar" }, { status: 500 });
  }
}
