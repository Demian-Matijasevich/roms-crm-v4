import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import { getFiscalStart, getFiscalEnd, toDateString, getToday } from "@/lib/date-utils";
import type { TeamMember, Payment, Lead } from "@/lib/types";

const API_SECRET = process.env.CRON_SECRET || process.env.JWT_SECRET || "";

interface DigestEntry {
  team_member_id: string;
  nombre: string;
  email: string | null;
  rol: string;
  resumen: string;
  datos: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  // Auth via header (for n8n/cron calls)
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token || token !== API_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const supabase = createServerClient();
    const today = getToday();
    const todayStr = toDateString(today);
    const yesterdayDate = new Date(today);
    yesterdayDate.setDate(today.getDate() - 1);
    const yesterdayStr = toDateString(yesterdayDate);
    const fiscalStartStr = toDateString(getFiscalStart());
    const fiscalEndStr = toDateString(getFiscalEnd());

    // Fetch all active team members
    const { data: members } = await supabase
      .from("team_members")
      .select("*")
      .eq("activo", true);

    if (!members) {
      return NextResponse.json({ error: "No se encontraron miembros" }, { status: 500 });
    }

    // Fetch data in parallel
    const [
      overdueRes,
      dueTodayRes,
      yesterdayPaidRes,
      pipelineRes,
      todayCallsRes,
      fiscalPaidRes,
    ] = await Promise.all([
      // Overdue payments
      supabase
        .from("payments")
        .select("id, monto_usd, cobrador_id, fecha_vencimiento")
        .eq("estado", "pendiente")
        .lt("fecha_vencimiento", todayStr),
      // Due today
      supabase
        .from("payments")
        .select("id, monto_usd, cobrador_id, fecha_vencimiento")
        .eq("estado", "pendiente")
        .eq("fecha_vencimiento", todayStr),
      // Paid yesterday
      supabase
        .from("payments")
        .select("id, monto_usd")
        .eq("estado", "pagado")
        .eq("fecha_pago", yesterdayStr),
      // Pipeline leads
      supabase
        .from("leads")
        .select("id, nombre, estado, closer_id, ticket_total, fecha_llamada")
        .in("estado", ["pendiente", "seguimiento", "reserva"]),
      // Today's calls
      supabase
        .from("leads")
        .select("id, nombre, closer_id, fecha_llamada")
        .eq("fecha_llamada", todayStr),
      // Fiscal month paid total
      supabase
        .from("payments")
        .select("monto_usd")
        .eq("estado", "pagado")
        .gte("fecha_pago", fiscalStartStr)
        .lte("fecha_pago", fiscalEndStr),
    ]);

    const overdue = (overdueRes.data ?? []) as Pick<Payment, "id" | "monto_usd" | "cobrador_id" | "fecha_vencimiento">[];
    const dueToday = (dueTodayRes.data ?? []) as Pick<Payment, "id" | "monto_usd" | "cobrador_id" | "fecha_vencimiento">[];
    const yesterdayPaid = (yesterdayPaidRes.data ?? []) as Pick<Payment, "id" | "monto_usd">[];
    const pipeline = (pipelineRes.data ?? []) as Pick<Lead, "id" | "nombre" | "estado" | "closer_id" | "ticket_total" | "fecha_llamada">[];
    const todayCalls = (todayCallsRes.data ?? []) as Pick<Lead, "id" | "nombre" | "closer_id" | "fecha_llamada">[];
    const fiscalPaid = (fiscalPaidRes.data ?? []) as Pick<Payment, "monto_usd">[];

    const overdueTotal = overdue.reduce((s, p) => s + (p.monto_usd ?? 0), 0);
    const dueTodayTotal = dueToday.reduce((s, p) => s + (p.monto_usd ?? 0), 0);
    const yesterdayTotal = yesterdayPaid.reduce((s, p) => s + (p.monto_usd ?? 0), 0);
    const fiscalTotal = fiscalPaid.reduce((s, p) => s + (p.monto_usd ?? 0), 0);
    const pipelineTotal = pipeline.reduce((s, l) => s + (l.ticket_total ?? 0), 0);

    const digests: DigestEntry[] = [];

    for (const m of members as TeamMember[]) {
      // Closers
      if (m.is_closer) {
        const myCallsToday = todayCalls.filter((l) => l.closer_id === m.id);
        const myPipeline = pipeline.filter((l) => l.closer_id === m.id);

        const resumen = [
          `Hoy tenes ${myCallsToday.length} llamada${myCallsToday.length !== 1 ? "s" : ""} programada${myCallsToday.length !== 1 ? "s" : ""}.`,
          myPipeline.length > 0
            ? `Tu pipeline tiene ${myPipeline.length} lead${myPipeline.length !== 1 ? "s" : ""} activos.`
            : null,
        ]
          .filter(Boolean)
          .join(" ");

        digests.push({
          team_member_id: m.id,
          nombre: m.nombre,
          email: m.email,
          rol: "closer",
          resumen,
          datos: {
            llamadas_hoy: myCallsToday.length,
            llamadas_nombres: myCallsToday.map((l) => l.nombre),
            pipeline_count: myPipeline.length,
          },
        });
      }

      // Cobranzas (Mel)
      if (m.is_cobranzas) {
        const resumen = [
          `Hay ${overdue.length} cuota${overdue.length !== 1 ? "s" : ""} vencida${overdue.length !== 1 ? "s" : ""} por $${overdueTotal.toLocaleString()}.`,
          dueToday.length > 0
            ? `${dueToday.length} vence${dueToday.length !== 1 ? "n" : ""} hoy por $${dueTodayTotal.toLocaleString()}.`
            : "Ninguna vence hoy.",
        ].join(" ");

        digests.push({
          team_member_id: m.id,
          nombre: m.nombre,
          email: m.email,
          rol: "cobranzas",
          resumen,
          datos: {
            cuotas_vencidas: overdue.length,
            monto_vencidas: overdueTotal,
            cuotas_hoy: dueToday.length,
            monto_hoy: dueTodayTotal,
          },
        });
      }

      // Admin (non-cobranzas admin or all admins get admin digest)
      if (m.is_admin) {
        const resumen = [
          `Ayer se cobro $${yesterdayTotal.toLocaleString()}.`,
          `Este mes van $${fiscalTotal.toLocaleString()} cobrados.`,
          `Pipeline tiene ${pipeline.length} leads por $${pipelineTotal.toLocaleString()}.`,
        ].join(" ");

        // Only add if not already added as cobranzas (avoid duplicate for Mel — she gets both)
        const alreadyAdded = digests.find((d) => d.team_member_id === m.id && d.rol === "admin");
        if (!alreadyAdded) {
          digests.push({
            team_member_id: m.id,
            nombre: m.nombre,
            email: m.email,
            rol: "admin",
            resumen,
            datos: {
              cobrado_ayer: yesterdayTotal,
              cobrado_mes: fiscalTotal,
              pipeline_leads: pipeline.length,
              pipeline_total: pipelineTotal,
            },
          });
        }
      }
    }

    return NextResponse.json({
      fecha: todayStr,
      digests,
      meta: {
        total_digests: digests.length,
        overdue_count: overdue.length,
        overdue_total: overdueTotal,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
