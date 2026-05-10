import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

function fmtUSD(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR");
}

/**
 * Reporte mensual completo (admin) — incluye:
 *   - Gastos detallados del mes
 *   - Settle Juanma ↔ Fran (cuánto le pasa uno al otro)
 *   - Totales operativos del mes
 *
 * Query: ?s=<secret>&mes=YYYY-MM (default mes actual)
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const mes = url.searchParams.get("mes") || new Date().toISOString().slice(0, 7);
  const [y, m] = mes.split("-").map(Number);
  const start = `${mes}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${mes}-${String(lastDay).padStart(2, "0")}`;

  const sb = createServerClient();

  // ── GASTOS ──
  const { data: gastos } = await sb
    .from("gastos")
    .select("id, fecha, concepto, categoria, billetera, monto_usd, monto_ars, pagado_por, pagado_a, estado, usd_rate_aplicado")
    .gte("fecha", start)
    .lte("fecha", end)
    .order("fecha");

  const totalGastos = (gastos || []).reduce((s, g) => s + Number(g.monto_usd || 0), 0);
  const norm = (s: string | null | undefined) => (s || "—").trim();

  // Por categoría
  const byCat = new Map<string, number>();
  for (const g of gastos || []) {
    const k = norm(g.categoria).toLowerCase();
    byCat.set(k, (byCat.get(k) || 0) + Number(g.monto_usd || 0));
  }

  // Por caja
  const byCaja = new Map<string, number>();
  for (const g of gastos || []) {
    const k = norm(g.billetera).toLowerCase();
    byCaja.set(k, (byCaja.get(k) || 0) + Number(g.monto_usd || 0));
  }

  // Por quién pagó (normalizado uppercase)
  const byPagadoPor = new Map<string, number>();
  for (const g of gastos || []) {
    const raw = norm(g.pagado_por);
    const k = raw === "—" ? "SIN_ASIGNAR" : raw.toUpperCase();
    byPagadoPor.set(k, (byPagadoPor.get(k) || 0) + Number(g.monto_usd || 0));
  }

  // ── SETTLE Juanma ↔ Fran ──
  // Asumo split 50/50 sobre gastos del mes.
  const gastosJuanma = byPagadoPor.get("JUANMA") || 0;
  const gastosFran = byPagadoPor.get("FRAN") || 0;
  const gastosOtros = totalGastos - gastosJuanma - gastosFran;
  const totalCompartido = gastosJuanma + gastosFran; // sólo lo que pagaron los socios
  const cuotaCadaUno = totalCompartido / 2;
  // Si Juanma puso más que cuotaCadaUno → Fran le debe (Juanma puso de más)
  // Si Fran puso más → Juanma le debe
  let debe: { quien: string; aQuien: string; monto: number };
  if (gastosJuanma > cuotaCadaUno) {
    debe = { quien: "FRAN", aQuien: "JUANMA", monto: gastosJuanma - cuotaCadaUno };
  } else if (gastosFran > cuotaCadaUno) {
    debe = { quien: "JUANMA", aQuien: "FRAN", monto: gastosFran - cuotaCadaUno };
  } else {
    debe = { quien: "—", aQuien: "—", monto: 0 };
  }

  // ── PAYMENTS / CASH del mes (para totales) ──
  const { data: payments } = await sb
    .from("payments")
    .select("id, lead_id, monto_usd, fecha_pago, estado, numero_cuota, receptor, es_renovacion")
    .eq("estado", "pagado")
    .gte("fecha_pago", start)
    .lte("fecha_pago", end);
  const cashTotal = (payments || []).reduce((s, p) => s + Number(p.monto_usd || 0), 0);

  // Cash por receptor (normalizado)
  const cashByReceptor = new Map<string, number>();
  for (const p of payments || []) {
    const raw = norm(p.receptor);
    const k = raw === "—" ? "—" : raw.toUpperCase();
    cashByReceptor.set(k, (cashByReceptor.get(k) || 0) + Number(p.monto_usd || 0));
  }

  // Facturación = ticket de leads cuya cuota#1 fue pagada en el mes
  const cuota1Pays = (payments || []).filter((p) => p.numero_cuota === 1 && !p.es_renovacion);
  const leadsCuota1 = [...new Set(cuota1Pays.map((p) => p.lead_id).filter(Boolean) as string[])];
  let facturacion = 0;
  if (leadsCuota1.length > 0) {
    const { data: lprog } = await sb
      .from("leads")
      .select("id, ticket_total")
      .in("id", leadsCuota1);
    facturacion = (lprog || []).reduce((s, l) => s + Number(l.ticket_total || 0), 0);
  }

  // ── TEXTO (formato WhatsApp) ──
  const lines: string[] = [];
  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  lines.push(`📊 *REPORTE MES ${monthNames[m - 1].toUpperCase()} ${y}*`);
  lines.push(`📅 Periodo: ${start} → ${end}`);
  lines.push("");
  lines.push(`💼 *Facturación (ventas concretadas):* ${fmtUSD(facturacion)} (${leadsCuota1.length} ventas)`);
  lines.push(`💵 *Cash cobrado:* ${fmtUSD(cashTotal)} (${payments?.length || 0} pagos)`);
  if (cashByReceptor.size > 0) {
    const arr = [...cashByReceptor.entries()].sort((a, b) => b[1] - a[1]);
    for (const [k, v] of arr) lines.push(`   • ${k}: ${fmtUSD(v)}`);
  }
  lines.push("");
  lines.push(`📉 *Gastos del mes:* ${fmtUSD(totalGastos)} (${gastos?.length || 0} items)`);
  lines.push(`   📂 Por categoría:`);
  const arrCat = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  for (const [k, v] of arrCat) lines.push(`      • ${k}: ${fmtUSD(v)}`);
  lines.push(`   👤 Por quién pagó:`);
  const arrPP = [...byPagadoPor.entries()].sort((a, b) => b[1] - a[1]);
  for (const [k, v] of arrPP) lines.push(`      • ${k}: ${fmtUSD(v)}`);
  lines.push("");
  lines.push(`💎 *Resultado neto cash:* ${fmtUSD(cashTotal - totalGastos)} (cash - gastos)`);
  lines.push("");
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`💸 *SETTLE JUANMA ↔ FRAN (50/50)*`);
  lines.push(`   Juanma pagó: ${fmtUSD(gastosJuanma)}`);
  lines.push(`   Fran pagó:   ${fmtUSD(gastosFran)}`);
  if (gastosOtros > 0) lines.push(`   Otros (no socios): ${fmtUSD(gastosOtros)}`);
  lines.push(`   Total compartido (Juanma+Fran): ${fmtUSD(totalCompartido)}`);
  lines.push(`   Cuota cada uno (50%): ${fmtUSD(cuotaCadaUno)}`);
  lines.push(``);
  if (debe.monto > 0) {
    lines.push(`   👉 *${debe.quien} le tiene que pasar ${fmtUSD(debe.monto)} a ${debe.aQuien}*`);
  } else {
    lines.push(`   ✅ Están parejos, no hay nada que transferir.`);
  }
  lines.push(`━━━━━━━━━━━━━━━━━━━━`);

  return NextResponse.json({
    ok: true,
    mes,
    text: lines.join("\n"),
    gastos: gastos || [],
    totales: {
      gastosTotal: totalGastos,
      gastosJuanma,
      gastosFran,
      gastosOtros,
      totalCompartido,
      cuotaCadaUno,
      cashTotal,
      facturacion,
    },
    settle: debe,
  });
}
