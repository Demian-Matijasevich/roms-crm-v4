import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { computeTeamCommissions } from "@/lib/commissions";

export const dynamic = "force-dynamic";
const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

// Sueldo fijo + quien lo paga (default: Juanma)
const SUELDO_MEL_USD = 650;
const SUELDO_MEL_PAGADO_POR: string = "JUANMA";
// Quien paga las comisiones del equipo (default: Juanma)
const COMISIONES_PAGADAS_POR: string = "JUANMA";

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

  // ── COMISIONES DEL MES (a pagar) ──
  const { data: leadsForComm } = await sb
    .from("leads")
    .select("id, closer_id, setter_id, utm_medium, programa_pitcheado")
    .range(0, 9999);
  const { data: paymentsAll } = await sb
    .from("payments")
    .select("lead_id, monto_usd, fecha_pago, estado")
    .eq("estado", "pagado");
  const { data: team } = await sb
    .from("team_members")
    .select("id, nombre, is_closer, is_setter")
    .eq("activo", true);
  const { data: campaigns } = await sb.from("utm_campaigns").select("medium, setter_id");

  const comisRows = computeTeamCommissions({
    leads: (leadsForComm ?? []) as Array<{ id: string; closer_id: string | null; setter_id: string | null; utm_medium: string | null; programa_pitcheado: string | null }>,
    payments: (paymentsAll ?? []) as Array<{ lead_id: string | null; monto_usd: number; fecha_pago: string | null; estado: string }>,
    team: (team ?? []) as Array<{ id: string; nombre: string; is_closer: boolean; is_setter: boolean }>,
    campaigns: (campaigns ?? []) as Array<{ medium: string | null; setter_id: string | null }>,
    monthStart: start,
    monthEnd: end,
  });
  const totalComisiones = comisRows.reduce((s, r) => s + r.comision_total, 0);

  // ── SETTLE Juanma ↔ Fran ──
  // Lógica: cada socio recibe cash en SU billetera, de ahí paga sus gastos y aportes a equipo.
  // La utilidad NETA del negocio se reparte 50/50.
  // Si uno tiene más saldo del que le toca → le transfiere a otro la diferencia.
  const cashJuanma = cashByReceptor.get("JUANMA") || 0;
  const cashFran = cashByReceptor.get("FRAN") || 0;
  const cashOtros = cashTotal - cashJuanma - cashFran;

  const gastosJuanma = byPagadoPor.get("JUANMA") || 0;
  const gastosFran = byPagadoPor.get("FRAN") || 0;
  const gastosOtros = totalGastos - gastosJuanma - gastosFran;

  // Pagos al equipo (comisiones + sueldo Mel) — los paga uno de los socios
  const pagosEquipoJuanma = (COMISIONES_PAGADAS_POR === "JUANMA" ? totalComisiones : 0) + (SUELDO_MEL_PAGADO_POR === "JUANMA" ? SUELDO_MEL_USD : 0);
  const pagosEquipoFran = (COMISIONES_PAGADAS_POR === "FRAN" ? totalComisiones : 0) + (SUELDO_MEL_PAGADO_POR === "FRAN" ? SUELDO_MEL_USD : 0);

  // Saldo en billetera de cada socio (lo que efectivamente le quedó del mes)
  const saldoJuanma = cashJuanma - gastosJuanma - pagosEquipoJuanma;
  const saldoFran = cashFran - gastosFran - pagosEquipoFran;
  const utilidadNeta = saldoJuanma + saldoFran; // = lo que cada uno se queda al final
  const cuotaCadaUno = utilidadNeta / 2;

  // Transfer: el que tiene más le pasa al otro la diferencia
  let debe: { quien: string; aQuien: string; monto: number };
  if (saldoJuanma > cuotaCadaUno) {
    debe = { quien: "JUANMA", aQuien: "FRAN", monto: saldoJuanma - cuotaCadaUno };
  } else if (saldoFran > cuotaCadaUno) {
    debe = { quien: "FRAN", aQuien: "JUANMA", monto: saldoFran - cuotaCadaUno };
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
  lines.push(`📉 *Gastos operativos del mes:* ${fmtUSD(totalGastos)} (${gastos?.length || 0} items)`);
  lines.push(`   📂 Por categoría:`);
  const arrCat = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  for (const [k, v] of arrCat) lines.push(`      • ${k}: ${fmtUSD(v)}`);
  lines.push(`   👤 Por quién pagó:`);
  const arrPP = [...byPagadoPor.entries()].sort((a, b) => b[1] - a[1]);
  for (const [k, v] of arrPP) lines.push(`      • ${k}: ${fmtUSD(v)}`);
  lines.push("");

  // ── PAGOS DEL MES (a pagar este mes, aparte de gastos operativos) ──
  lines.push(`💼 *Pagos a equipo este mes (aparte de gastos):*`);
  lines.push(`   🎯 Comisiones equipo: ${fmtUSD(totalComisiones)}`);
  if (comisRows.length > 0) {
    for (const r of comisRows) {
      lines.push(`      • ${r.nombre.toUpperCase()}: ${fmtUSD(r.comision_total)} (closer ${fmtUSD(r.comision_closer)} + setter ${fmtUSD(r.comision_setter)})`);
    }
  }
  lines.push(`   💵 Sueldo Mel (fijo): ${fmtUSD(SUELDO_MEL_USD)}`);
  const totalPagosEquipo = totalComisiones + SUELDO_MEL_USD;
  lines.push(`   ▸ Total pagos equipo: ${fmtUSD(totalPagosEquipo)} (asume paga ${COMISIONES_PAGADAS_POR})`);
  lines.push("");

  // Resultado neto = cash - gastos operativos - comisiones - sueldo
  const totalEgresosCompletos = totalGastos + totalPagosEquipo;
  lines.push(`💎 *Resultado neto del mes:* ${fmtUSD(cashTotal - totalEgresosCompletos)}`);
  lines.push(`   = Cash ${fmtUSD(cashTotal)} − Gastos ${fmtUSD(totalGastos)} − Comisiones ${fmtUSD(totalComisiones)} − Sueldo Mel ${fmtUSD(SUELDO_MEL_USD)}`);
  lines.push("");

  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`💸 *SETTLE JUANMA ↔ FRAN (50/50)*`);
  lines.push(``);
  lines.push(`💰 Cash recibido por cada uno (su billetera):`);
  lines.push(`   Juanma: ${fmtUSD(cashJuanma)}`);
  lines.push(`   Fran:   ${fmtUSD(cashFran)}`);
  if (cashOtros > 0) lines.push(`   Otros receptores: ${fmtUSD(cashOtros)}`);
  lines.push(``);
  lines.push(`📤 Egresos pagados de cada billetera:`);
  lines.push(`   Juanma:`);
  lines.push(`      − Gastos operativos: ${fmtUSD(gastosJuanma)}`);
  if (pagosEquipoJuanma > 0) {
    if (COMISIONES_PAGADAS_POR === "JUANMA") lines.push(`      − Comisiones equipo: ${fmtUSD(totalComisiones)}`);
    if (SUELDO_MEL_PAGADO_POR === "JUANMA") lines.push(`      − Sueldo Mel: ${fmtUSD(SUELDO_MEL_USD)}`);
  }
  lines.push(`      = Saldo Juanma: ${fmtUSD(saldoJuanma)}`);
  lines.push(`   Fran:`);
  lines.push(`      − Gastos operativos: ${fmtUSD(gastosFran)}`);
  if (pagosEquipoFran > 0) {
    if (COMISIONES_PAGADAS_POR === "FRAN") lines.push(`      − Comisiones equipo: ${fmtUSD(totalComisiones)}`);
    if (SUELDO_MEL_PAGADO_POR === "FRAN") lines.push(`      − Sueldo Mel: ${fmtUSD(SUELDO_MEL_USD)}`);
  }
  lines.push(`      = Saldo Fran: ${fmtUSD(saldoFran)}`);
  lines.push(``);
  lines.push(`📊 Utilidad neta del mes: ${fmtUSD(utilidadNeta)}`);
  lines.push(`   Cuota cada uno (50%): ${fmtUSD(cuotaCadaUno)}`);
  lines.push(``);
  if (debe.monto > 0) {
    lines.push(`   👉 *${debe.quien} le tiene que pasar ${fmtUSD(debe.monto)} a ${debe.aQuien}*`);
    lines.push(`   (después del transfer cada uno queda con ${fmtUSD(cuotaCadaUno)})`);
  } else {
    lines.push(`   ✅ Están parejos.`);
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
      totalComisiones,
      sueldoMel: SUELDO_MEL_USD,
      cashJuanma,
      cashFran,
      cashOtros,
      saldoJuanma,
      saldoFran,
      utilidadNeta,
      cuotaCadaUno,
      cashTotal,
      facturacion,
    },
    comisiones: comisRows,
    settle: debe,
  });
}
