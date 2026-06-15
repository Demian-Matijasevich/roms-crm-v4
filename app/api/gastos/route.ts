import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getUsdRate } from "@/lib/queries/settings";

async function getRateForMonth(mes: string): Promise<number> {
  const sb = createServerClient();
  const { data } = await sb.from("usd_rate_history").select("rate").eq("mes", mes).maybeSingle();
  if (data?.rate && Number(data.rate) > 0) return Number(data.rate);
  // Fallback al rate global de settings
  return getUsdRate();
}

export async function GET() {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("gastos")
    .select("*")
    .order("fecha", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ gastos: data ?? [] });
}

export async function POST(req: NextRequest) {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  try {
    const body = await req.json();
    const { fecha, concepto, categoria, monto_usd, monto_ars, billetera, pagado_a, pagado_por, estado, nicho } = body;

    if (!fecha || !concepto) {
      return NextResponse.json({ error: "fecha y concepto son requeridos" }, { status: 400 });
    }
    if (!categoria) {
      return NextResponse.json({ error: "categoría es requerida" }, { status: 400 });
    }
    if (!billetera) {
      return NextResponse.json({ error: "caja de pago (billetera) es requerida" }, { status: 400 });
    }

    // Auto-conversión: si cargó solo ARS, calcular USD con el rate del mes del gasto
    const mes = String(fecha).slice(0, 7); // YYYY-MM
    const rateAplicado = await getRateForMonth(mes);
    let mUsd = Number(monto_usd) || 0;
    const mArs = Number(monto_ars) || 0;
    if (mUsd === 0 && mArs > 0 && rateAplicado > 0) {
      mUsd = +(mArs / rateAplicado).toFixed(2);
    }

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("gastos")
      .insert({
        fecha,
        concepto,
        categoria,
        monto_usd: mUsd,
        monto_ars: mArs,
        billetera,
        pagado_a: pagado_a || null,
        pagado_por: pagado_por || null,
        estado: estado || "pagado",
        nicho: nicho === "politica" ? "politica" : "general",
        usd_rate_aplicado: rateAplicado,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, gasto: data });
  } catch (err) {
    console.error("[POST /api/gastos]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

    const allowed = ["fecha", "concepto", "categoria", "monto_usd", "monto_ars", "billetera", "pagado_a", "pagado_por", "estado", "usd_rate_aplicado", "nicho"];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in updates) patch[k] = updates[k];

    // Si cambió fecha o monto_ars y no hay monto_usd manual, recalcular USD con rate del mes
    if (("fecha" in updates || "monto_ars" in updates) && !("monto_usd" in updates)) {
      const supabaseRead = createServerClient();
      const { data: existing } = await supabaseRead.from("gastos").select("fecha, monto_ars, monto_usd").eq("id", id).maybeSingle();
      if (existing) {
        const fecha = (patch.fecha as string) || existing.fecha;
        const monto_ars = (patch.monto_ars as number) ?? existing.monto_ars ?? 0;
        if (fecha && monto_ars > 0) {
          const mes = String(fecha).slice(0, 7);
          const rate = await getRateForMonth(mes);
          if (rate > 0) {
            patch.monto_usd = +(monto_ars / rate).toFixed(2);
            patch.usd_rate_aplicado = rate;
          }
        }
      }
    }

    const supabase = createServerClient();
    const { data, error } = await supabase.from("gastos").update(patch).eq("id", id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, gasto: data });
  } catch (err) {
    console.error("[PATCH /api/gastos]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

    const supabase = createServerClient();
    const { error } = await supabase.from("gastos").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/gastos]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
