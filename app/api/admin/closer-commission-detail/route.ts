import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { computeValenCommission, SETTER_PCT } from "@/lib/commissions";

export const dynamic = "force-dynamic";
const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

function fmtUSD(n: number): string {
  return "$" + (Math.round(n * 100) / 100).toLocaleString("es-AR");
}

/**
 * Detalle de comisiones de un closer/setter específico en un mes.
 * ?s=<secret>&closer=<nombre>&mes=YYYY-MM
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const mes = url.searchParams.get("mes") || new Date().toISOString().slice(0, 7);
  const closerName = (url.searchParams.get("closer") || "").trim();
  if (!closerName) return NextResponse.json({ error: "closer param requerido" }, { status: 400 });

  const [y, m] = mes.split("-").map(Number);
  const start = `${mes}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${mes}-${String(lastDay).padStart(2, "0")}`;

  const sb = createServerClient();
  const { data: team } = await sb.from("team_members").select("id, nombre, is_closer, is_setter").eq("activo", true);
  const member = (team || []).find((t) => t.nombre.toLowerCase().includes(closerName.toLowerCase()));
  if (!member) return NextResponse.json({ error: `team_member '${closerName}' no encontrado` }, { status: 404 });

  const [{ data: leads }, { data: payments }, { data: campaigns }] = await Promise.all([
    sb.from("leads").select("id, nombre, closer_id, setter_id, utm_medium, programa_pitcheado").range(0, 9999),
    sb.from("payments")
      .select("id, lead_id, monto_usd, fecha_pago, estado, numero_cuota, receptor")
      .eq("estado", "pagado")
      .gte("fecha_pago", start)
      .lte("fecha_pago", end),
    sb.from("utm_campaigns").select("medium, setter_id"),
  ]);

  const leadById = new Map((leads ?? []).map((l) => [l.id, l]));
  const mediumToSetter = new Map<string, string>();
  for (const c of campaigns ?? []) if (c.setter_id && c.medium) mediumToSetter.set(String(c.medium).toLowerCase(), c.setter_id);

  // Pagos como closer (lead.closer_id = member)
  const closerPays: { paymentId: string; leadName: string; fecha: string; monto: number; programa: string | null; cuota: number; receptor: string | null }[] = [];
  let cashClosed = 0;
  for (const p of payments ?? []) {
    if (!p.lead_id) continue;
    const lead = leadById.get(p.lead_id);
    if (!lead || lead.closer_id !== member.id) continue;
    cashClosed += Number(p.monto_usd || 0);
    closerPays.push({
      paymentId: p.id,
      leadName: lead.nombre || "?",
      fecha: (p.fecha_pago || "").split("T")[0],
      monto: Number(p.monto_usd || 0),
      programa: lead.programa_pitcheado,
      cuota: p.numero_cuota,
      receptor: p.receptor,
    });
  }

  // Comisión efectiva por programa según tier
  const closerCalc = computeValenCommission(
    closerPays.map((p) => ({ monto_usd: p.monto, programa: p.programa })),
    cashClosed
  );

  // Por programa
  const porPrograma = {
    omnipresencia: { ventas: [] as typeof closerPays, total: 0, pct: closerCalc.pctEff.omni },
    multicuentas: { ventas: [] as typeof closerPays, total: 0, pct: closerCalc.pctEff.multi },
    consultoria: { ventas: [] as typeof closerPays, total: 0, pct: closerCalc.pctEff.consultoria },
    otros: { ventas: [] as typeof closerPays, total: 0, pct: 0 },
  };
  for (const p of closerPays) {
    const prog = (p.programa || "").toLowerCase();
    if (prog.includes("multi")) {
      porPrograma.multicuentas.ventas.push(p);
      porPrograma.multicuentas.total += p.monto;
    } else if (prog.includes("consult")) {
      porPrograma.consultoria.ventas.push(p);
      porPrograma.consultoria.total += p.monto;
    } else if (prog.includes("omni")) {
      porPrograma.omnipresencia.ventas.push(p);
      porPrograma.omnipresencia.total += p.monto;
    } else {
      porPrograma.otros.ventas.push(p);
      porPrograma.otros.total += p.monto;
    }
  }

  // Pagos como setter (lead.setter_id = member O via utm_medium)
  const setterPays: typeof closerPays = [];
  let cashAsSetter = 0;
  for (const p of payments ?? []) {
    if (!p.lead_id) continue;
    const lead = leadById.get(p.lead_id);
    if (!lead) continue;
    let isSetter = lead.setter_id === member.id;
    if (!isSetter && lead.utm_medium) {
      isSetter = mediumToSetter.get(lead.utm_medium.toLowerCase()) === member.id;
    }
    if (!isSetter) continue;
    cashAsSetter += Number(p.monto_usd || 0);
    setterPays.push({
      paymentId: p.id,
      leadName: lead.nombre || "?",
      fecha: (p.fecha_pago || "").split("T")[0],
      monto: Number(p.monto_usd || 0),
      programa: lead.programa_pitcheado,
      cuota: p.numero_cuota,
      receptor: p.receptor,
    });
  }
  const comisionSetter = cashAsSetter * SETTER_PCT;

  // Tier multiplier
  const multiplier = cashClosed <= 70000 ? 1.0 : cashClosed <= 100000 ? 1.15 : 1.3;

  // ── TEXTO ──
  const lines: string[] = [];
  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  lines.push(`💼 *COMISIONES ${member.nombre.toUpperCase()} - ${monthNames[m - 1]} ${y}*`);
  lines.push("");
  lines.push(`💰 Cash cobrado como closer: ${fmtUSD(cashClosed)}`);
  lines.push(`📊 Multiplicador tier: x${multiplier}`);
  lines.push(`   (${cashClosed <= 70000 ? "≤ 70k" : cashClosed <= 100000 ? "70k-100k" : "> 100k"})`);
  lines.push("");

  // CLOSER por programa
  lines.push(`━━━━━━━━━━━━━━`);
  lines.push(`🎯 *COMO CLOSER*`);
  lines.push("");

  function fmtProgramaBlock(label: string, base: number, data: { ventas: typeof closerPays; total: number; pct: number }) {
    if (data.ventas.length === 0) return;
    const comision = data.total * (data.pct / 100);
    lines.push(`📦 ${label} (base ${base}% × ${multiplier} = ${data.pct.toFixed(2)}%)`);
    for (const v of data.ventas) {
      lines.push(`   • ${v.leadName} (cuota #${v.cuota}): ${fmtUSD(v.monto)} → ${fmtUSD(v.monto * (data.pct / 100))}`);
    }
    lines.push(`   ▸ Subtotal ${label}: ${fmtUSD(data.total)} × ${data.pct.toFixed(2)}% = *${fmtUSD(comision)}*`);
    lines.push("");
  }

  fmtProgramaBlock("Omnipresencia", 7, porPrograma.omnipresencia);
  fmtProgramaBlock("Multicuentas", 5, porPrograma.multicuentas);
  fmtProgramaBlock("Consultoría", 7, porPrograma.consultoria);
  if (porPrograma.otros.ventas.length > 0) {
    lines.push(`📦 Otros / sin programa (no cuenta comisión)`);
    for (const v of porPrograma.otros.ventas) {
      lines.push(`   • ${v.leadName}: ${fmtUSD(v.monto)}`);
    }
    lines.push("");
  }

  const totalCloser = closerCalc.total;
  lines.push(`🏆 *Total comisión closer: ${fmtUSD(totalCloser)}*`);
  lines.push("");

  // SETTER
  if (setterPays.length > 0) {
    lines.push(`━━━━━━━━━━━━━━`);
    lines.push(`👥 *COMO SETTER (3% flat)*`);
    lines.push("");
    for (const v of setterPays) {
      lines.push(`   • ${v.leadName} (cuota #${v.cuota}): ${fmtUSD(v.monto)} × 3% = ${fmtUSD(v.monto * SETTER_PCT)}`);
    }
    lines.push("");
    lines.push(`   ▸ Cash atribuido como setter: ${fmtUSD(cashAsSetter)}`);
    lines.push(`🏆 *Total comisión setter: ${fmtUSD(comisionSetter)}*`);
    lines.push("");
  }

  // TOTAL
  lines.push(`━━━━━━━━━━━━━━`);
  lines.push(`💎 *TOTAL A PAGAR ${member.nombre.toUpperCase()}: ${fmtUSD(totalCloser + comisionSetter)}*`);
  if (setterPays.length > 0) {
    lines.push(`   = ${fmtUSD(totalCloser)} (closer) + ${fmtUSD(comisionSetter)} (setter)`);
  }
  lines.push(`━━━━━━━━━━━━━━`);

  return NextResponse.json({
    ok: true,
    member: member.nombre,
    mes,
    text: lines.join("\n"),
    cashClosed,
    multiplier,
    pctEff: closerCalc.pctEff,
    porPrograma,
    totalCloser,
    cashAsSetter,
    setterPays,
    comisionSetter,
    totalAPagar: totalCloser + comisionSetter,
  });
}
