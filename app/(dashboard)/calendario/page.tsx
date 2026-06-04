import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";
import { getToday, toDateString } from "@/lib/date-utils";
import { getNichoFilter } from "@/lib/vista";
import { getNichoLeadIds } from "@/lib/queries/leads";
import CalendarioClient from "./CalendarioClient";
import type { CalendarLead, CalendarPayment, CalendarRenewal } from "./CalendarioClient";

export const dynamic = "force-dynamic";

export default async function CalendarioPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const supabase = createServerClient();
  const nicho = await getNichoFilter();
  const leadIdsNicho = await getNichoLeadIds();

  // Fetch data for the current month range (we'll fetch 3 months to allow navigation)
  const now = getToday();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);

  const startStr = `${rangeStart.getFullYear()}-${String(rangeStart.getMonth() + 1).padStart(2, "0")}-01`;
  const endStr = `${rangeEnd.getFullYear()}-${String(rangeEnd.getMonth() + 1).padStart(2, "0")}-${String(rangeEnd.getDate()).padStart(2, "0")}`;

  // Role-based filtering: non-admins only see their own leads (by closer_id or setter_id)
  const isAdmin = session.is_admin;
  const myId = session.team_member_id;

  // Build the leads query with optional role filter
  // Uso fecha_agendado como principal (ahí cae tanto pending como tomada). fecha_llamada solo se llena cuando la call ocurre.
  let leadsQuery = supabase
    .from("leads")
    .select("id, nombre, fecha_agendado, fecha_llamada, estado, instagram, telefono, programa_pitcheado, link_llamada, ticket_total, closer_id, setter_id, closer:team_members!leads_closer_id_fkey(nombre), setter:team_members!leads_setter_id_fkey(nombre)")
    .or(`and(fecha_agendado.gte.${startStr}T00:00:00,fecha_agendado.lte.${endStr}T23:59:59),and(fecha_llamada.gte.${startStr}T00:00:00,fecha_llamada.lte.${endStr}T23:59:59)`);
  if (nicho) leadsQuery = leadsQuery.eq("nicho", nicho);
  if (!isAdmin) {
    leadsQuery = leadsQuery.or(`closer_id.eq.${myId},setter_id.eq.${myId}`);
  }

  let pendingQuery = supabase
    .from("payments")
    .select("id, client_id, lead_id, numero_cuota, monto_usd, fecha_vencimiento, estado, lead:leads!payments_lead_id_fkey(nombre, instagram, telefono, closer_id, setter_id), client:clients!payments_client_id_fkey(nombre, telefono)")
    .gte("fecha_vencimiento", startStr)
    .lte("fecha_vencimiento", endStr)
    .eq("estado", "pendiente");

  let paidQuery = supabase
    .from("payments")
    .select("id, lead_id, client_id, numero_cuota, monto_usd, fecha_pago, lead:leads!payments_lead_id_fkey(nombre, instagram, telefono, closer_id, setter_id), client:clients!payments_client_id_fkey(nombre, telefono)")
    .gte("fecha_pago", startStr)
    .lte("fecha_pago", endStr)
    .eq("estado", "pagado")
    .range(0, 4999);

  let clientsQuery = supabase
    .from("clients")
    .select("id, lead_id, nombre, programa, fecha_onboarding, total_dias_programa, estado_contacto, health_score, telefono")
    .eq("estado", "activo")
    .not("fecha_onboarding", "is", null);
  if (leadIdsNicho) {
    const ids = Array.from(leadIdsNicho);
    if (ids.length === 0) {
      clientsQuery = clientsQuery.eq("lead_id", "00000000-0000-0000-0000-000000000000");
    } else {
      clientsQuery = clientsQuery.in("lead_id", ids);
    }
  }

  const [leadsRes, paymentsRes, paidPaymentsRes, renewalsRes] = await Promise.all([
    leadsQuery,
    pendingQuery,
    paidQuery,
    clientsQuery,
  ]);

  // Aplicar filtro nicho a payments por lead_id (post-fetch)
  const filterByNicho = (rows: unknown[]): unknown[] => {
    if (!leadIdsNicho) return rows;
    return (rows as Array<{ lead_id?: string | null }>).filter((p) => p.lead_id && leadIdsNicho.has(p.lead_id));
  };

  // Filter payments client-side by lead's closer/setter (server-side OR on joined tables is tricky)
  const filterPayment = (p: { lead?: { closer_id?: string | null; setter_id?: string | null } | null }) => {
    if (isAdmin) return true;
    const lead = p.lead;
    if (!lead) return false;
    return lead.closer_id === myId || lead.setter_id === myId;
  };

  // Process renewals from clients data (replicate v_renewal_queue logic)
  const today = getToday();
  const todayStr = toDateString(today);
  // Renewals solo para admin — closers/setters no las ven
  const renewals: CalendarRenewal[] = !isAdmin ? [] : (renewalsRes.data ?? [])
    .map((c: Record<string, unknown>) => {
      const onb = new Date(c.fecha_onboarding as string);
      const venc = new Date(onb.getTime() + (c.total_dias_programa as number) * 86400000);
      const vencStr = `${venc.getFullYear()}-${String(venc.getMonth() + 1).padStart(2, "0")}-${String(venc.getDate()).padStart(2, "0")}`;
      const diffMs = venc.getTime() - new Date(todayStr).getTime();
      const diasRestantes = Math.ceil(diffMs / 86400000);
      const semaforo = diasRestantes < 0 ? "vencido" : diasRestantes <= 7 ? "urgente" : diasRestantes <= 15 ? "proximo" : "ok";
      return {
        id: c.id as string,
        nombre: c.nombre as string,
        programa: c.programa as string,
        fecha_onboarding: c.fecha_onboarding as string,
        total_dias_programa: c.total_dias_programa as number,
        fecha_vencimiento: vencStr,
        dias_restantes: diasRestantes,
        estado_contacto: c.estado_contacto as string,
        health_score: c.health_score as number,
        semaforo,
        telefono: (c.telefono as string) || null,
      };
    })
    .filter((r: CalendarRenewal) => r.fecha_vencimiento >= startStr && r.fecha_vencimiento <= endStr);

  // Map leads to CalendarLead — fallback a fecha_agendado si fecha_llamada es null
  const leads: CalendarLead[] = (leadsRes.data ?? []).map((l: Record<string, unknown>) => ({
    id: l.id as string,
    nombre: l.nombre as string,
    fecha_llamada: ((l.fecha_llamada as string) || (l.fecha_agendado as string) || "").split("T")[0],
    estado: l.estado as string,
    instagram: (l.instagram as string) || null,
    telefono: (l.telefono as string) || null,
    programa_pitcheado: (l.programa_pitcheado as string) || null,
    link_llamada: (l.link_llamada as string) || null,
    closer_nombre: (l.closer as Record<string, unknown>)?.nombre as string || null,
    setter_nombre: (l.setter as Record<string, unknown>)?.nombre as string || null,
    ticket_total: (l.ticket_total as number) || 0,
  }));

  // Map payments to CalendarPayment (with role filter + nicho filter)
  const payments: CalendarPayment[] = (filterByNicho(paymentsRes.data ?? []) as Record<string, unknown>[]).filter(filterPayment as (p: unknown) => boolean).map((p: Record<string, unknown>) => {
    const lead = p.lead as Record<string, unknown> | null;
    const client = p.client as Record<string, unknown> | null;
    return {
      id: p.id as string,
      client_id: (p.client_id as string) || null,
      lead_id: (p.lead_id as string) || null,
      numero_cuota: p.numero_cuota as number,
      monto_usd: p.monto_usd as number,
      fecha_vencimiento: p.fecha_vencimiento as string,
      estado: p.estado as string,
      nombre: (lead?.nombre as string) || (client?.nombre as string) || null,
      instagram: (lead?.instagram as string) || null,
      telefono: (lead?.telefono as string) || (client?.telefono as string) || null,
    };
  });

  const paidPayments = (filterByNicho(paidPaymentsRes.data ?? []) as Record<string, unknown>[]).filter(filterPayment as (p: unknown) => boolean).map((p: Record<string, unknown>) => {
    const lead = p.lead as Record<string, unknown> | null;
    const client = p.client as Record<string, unknown> | null;
    return {
      id: p.id as string,
      lead_id: (p.lead_id as string) || null,
      client_id: (p.client_id as string) || null,
      numero_cuota: p.numero_cuota as number,
      monto_usd: p.monto_usd as number,
      fecha_pago: ((p.fecha_pago as string) || "").split("T")[0],
      nombre: (lead?.nombre as string) || (client?.nombre as string) || null,
      instagram: (lead?.instagram as string) || null,
      telefono: (lead?.telefono as string) || (client?.telefono as string) || null,
    };
  });

  return (
    <div className="space-y-6">
      <CalendarioClient
        leads={leads}
        payments={payments}
        paidPayments={paidPayments}
        renewals={renewals}
      />
    </div>
  );
}
