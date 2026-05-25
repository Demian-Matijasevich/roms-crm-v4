import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase-server";
import { getFiscalStart, getFiscalEnd, toDateString } from "@/lib/date-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYSTEM_PROMPT = `Sos un asistente del CRM ROMS. Respondé SIEMPRE en español argentino, directo y corto. Usá SOLO los datos del CONTEXTO que te paso. Si no tenés la data exacta, decilo claramente — no inventes números. Formato: párrafo corto + tabla markdown cuando ayude.`;

export async function POST(req: NextRequest) {
  const auth = await requireSession();
  if ("error" in auth) return auth.error;

  const PROXY_URL = process.env.AI_PROXY_URL;
  const PROXY_TOKEN = process.env.AI_PROXY_TOKEN;
  if (!PROXY_URL || !PROXY_TOKEN) {
    return NextResponse.json(
      {
        error: "AI no configurado",
        message: "Configurá AI_PROXY_URL y AI_PROXY_TOKEN en Vercel (apuntando al microservicio del VPS).",
      },
      { status: 503 }
    );
  }

  try {
    const { question } = await req.json();
    if (!question || typeof question !== "string" || !question.trim()) {
      return NextResponse.json({ error: "question requerida" }, { status: 400 });
    }

    const context = await buildContext();
    const fullPrompt = `CONTEXTO (estado actual del CRM):\n${context}\n\n---\nPREGUNTA DEL USUARIO (${auth.session.nombre}):\n${question.trim()}`;

    const res = await fetch(`${PROXY_URL.replace(/\/$/, "")}/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PROXY_TOKEN}`,
      },
      body: JSON.stringify({
        prompt: fullPrompt,
        system: SYSTEM_PROMPT,
        timeout_ms: 90000,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: "AI proxy error", details: json },
        { status: res.status }
      );
    }
    return NextResponse.json({ ok: true, answer: json.answer, ms: json.ms });
  } catch (err) {
    console.error("[POST /api/ai/ask]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

async function buildContext(): Promise<string> {
  const sb = createServerClient();
  const fiscalStart = toDateString(getFiscalStart());
  const fiscalEnd = toDateString(getFiscalEnd());
  const today = toDateString(new Date());

  // ───── Métricas del mes fiscal en curso ─────
  const [paymentsRes, leadsCerradosRes, refundsRes, prospectosRes, vencidasRes] =
    await Promise.all([
      sb.from("payments")
        .select("monto_usd, fecha_pago, numero_cuota, estado, lead_id, receptor")
        .gte("fecha_pago", fiscalStart)
        .lte("fecha_pago", fiscalEnd)
        .eq("estado", "pagado"),
      sb.from("leads")
        .select("id, nombre, programa_pitcheado, ticket_total, fecha_llamada, estado, closer:team_members!leads_closer_id_fkey(nombre)")
        .gte("fecha_llamada", fiscalStart)
        .lte("fecha_llamada", fiscalEnd + "T23:59:59")
        .in("estado", ["cerrado", "reserva", "adentro_seguimiento"])
        .order("ticket_total", { ascending: false })
        .limit(30),
      sb.from("payments")
        .select("monto_usd, fecha_pago, lead:leads!payments_lead_id_fkey(nombre)")
        .eq("estado", "refund")
        .gte("fecha_pago", fiscalStart)
        .lte("fecha_pago", fiscalEnd),
      sb.from("prospectos")
        .select("estado")
        .order("created_at", { ascending: false }),
      sb.from("payments")
        .select("monto_usd, fecha_vencimiento, lead:leads!payments_lead_id_fkey(nombre)")
        .eq("estado", "pendiente")
        .lt("fecha_vencimiento", today)
        .order("fecha_vencimiento", { ascending: true })
        .limit(20),
    ]);

  // Cash collected
  const cash = (paymentsRes.data ?? []).reduce((s, p) => s + Number(p.monto_usd || 0), 0);
  const cashPorReceptor: Record<string, number> = {};
  for (const p of paymentsRes.data ?? []) {
    const r = p.receptor || "—";
    cashPorReceptor[r] = (cashPorReceptor[r] || 0) + Number(p.monto_usd || 0);
  }

  // Ventas firmadas (suma de ticket_total de leads cerrados en el mes)
  const ventasTotal = (leadsCerradosRes.data ?? []).reduce((s, l) => s + Number(l.ticket_total || 0), 0);
  const ventasPorPrograma: Record<string, { count: number; total: number }> = {};
  for (const l of leadsCerradosRes.data ?? []) {
    const p = (l.programa_pitcheado as string) || "sin_programa";
    if (!ventasPorPrograma[p]) ventasPorPrograma[p] = { count: 0, total: 0 };
    ventasPorPrograma[p].count++;
    ventasPorPrograma[p].total += Number(l.ticket_total || 0);
  }

  // Refunds
  const refundsTotal = (refundsRes.data ?? []).reduce((s, r) => s + Number(r.monto_usd || 0), 0);
  const refundsList = (refundsRes.data ?? []).slice(0, 10).map((r) => {
    const nombre = (r as { lead?: { nombre?: string } | null }).lead?.nombre || "?";
    return `${nombre}: $${Math.round(Number(r.monto_usd || 0))} (${r.fecha_pago})`;
  });

  // Cobranzas vencidas
  const vencidasTotal = (vencidasRes.data ?? []).reduce((s, p) => s + Number(p.monto_usd || 0), 0);
  const vencidasList = (vencidasRes.data ?? []).slice(0, 10).map((p) => {
    const nombre = (p as { lead?: { nombre?: string } | null }).lead?.nombre || "?";
    const dias = Math.floor((new Date(today).getTime() - new Date((p.fecha_vencimiento as string) + "T00:00:00").getTime()) / 86400000);
    return `${nombre}: $${Math.round(Number(p.monto_usd || 0))} (${dias}d atrasado)`;
  });

  // Prospectos por estado
  const prospectosCount: Record<string, number> = {};
  for (const p of prospectosRes.data ?? []) prospectosCount[p.estado] = (prospectosCount[p.estado] || 0) + 1;
  const prospectosTotal = (prospectosRes.data ?? []).length;

  // Top 10 ventas del mes
  const topVentas = (leadsCerradosRes.data ?? []).slice(0, 10).map((l) => {
    const closer = (l as { closer?: { nombre?: string } | null }).closer?.nombre || "—";
    return `${l.nombre} · ${l.programa_pitcheado || "?"} · $${Math.round(Number(l.ticket_total || 0))} · closer ${closer}`;
  });

  return [
    `Mes fiscal: ${fiscalStart} → ${fiscalEnd} (hoy ${today})`,
    "",
    `## Cash collected`,
    `Total: $${Math.round(cash).toLocaleString("en-US")}`,
    `Por receptor: ${Object.entries(cashPorReceptor).map(([k, v]) => `${k}=$${Math.round(v).toLocaleString("en-US")}`).join(", ") || "—"}`,
    "",
    `## Ventas firmadas (ticket de leads cerrados/reserva del mes)`,
    `Total: $${Math.round(ventasTotal).toLocaleString("en-US")} · ${(leadsCerradosRes.data ?? []).length} leads`,
    `Por programa: ${Object.entries(ventasPorPrograma).map(([k, v]) => `${k}=${v.count} ($${Math.round(v.total).toLocaleString("en-US")})`).join(", ") || "—"}`,
    "",
    `## Refunds del mes`,
    `Total: $${Math.round(refundsTotal).toLocaleString("en-US")} · ${(refundsRes.data ?? []).length} refunds`,
    refundsList.length ? `Detalle:\n  - ${refundsList.join("\n  - ")}` : "Sin refunds este mes",
    "",
    `## Cobranzas vencidas`,
    `Total: $${Math.round(vencidasTotal).toLocaleString("en-US")} en ${(vencidasRes.data ?? []).length} pagos`,
    vencidasList.length ? `Top atrasados:\n  - ${vencidasList.join("\n  - ")}` : "Ninguna vencida",
    "",
    `## Prospectos (pipeline pre-lead)`,
    `Total: ${prospectosTotal} · ${Object.entries(prospectosCount).map(([k, v]) => `${k}=${v}`).join(", ") || "—"}`,
    "",
    `## Top 10 ventas del mes`,
    topVentas.length ? topVentas.map((v, i) => `${i + 1}. ${v}`).join("\n") : "Sin ventas este mes",
  ].join("\n");
}
