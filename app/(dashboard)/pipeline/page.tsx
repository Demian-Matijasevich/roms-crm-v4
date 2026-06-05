import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { fetchLeads, fetchLeadsByCloser, fetchTeamMembers } from "@/lib/queries/leads";
import { fetchPayments } from "@/lib/queries/payments";
import { getUsdRate } from "@/lib/queries/settings";
import { getVista } from "@/lib/vista";
import { createServerClient } from "@/lib/supabase-server";
import PipelineClient from "./PipelineClient";

export const dynamic = "force-dynamic";

export type LeadKanbanSummary = {
  comments_count: number;
  checklist_done: number;
  checklist_total: number;
  attachments_count: number;
  labels: { id: string; nombre: string; color: string; scope: string }[];
};

export type LeadLabel = { id: string; nombre: string; color: string; scope: string };

export default async function PipelinePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = session.is_admin;
  const vista = await getVista();
  const isPolitica = vista === "politica";

  const [allLeads, payments, team, usdRate] = await Promise.all([
    isAdmin ? fetchLeads() : fetchLeadsByCloser(session.team_member_id),
    fetchPayments(),
    fetchTeamMembers(),
    getUsdRate(),
  ]);

  const closers = team.filter((t) => t.is_closer);
  const setters = team.filter((t) => t.is_setter);

  // Filtrar leads por vista
  const filteredByVista = vista === "todos"
    ? allLeads
    : allLeads.filter((l) => (l as unknown as { nicho?: string }).nicho === vista);

  // Build a payments lookup by lead_id
  const paymentsByLead: Record<string, typeof payments> = {};
  for (const p of payments) {
    if (p.lead_id) {
      if (!paymentsByLead[p.lead_id]) paymentsByLead[p.lead_id] = [];
      paymentsByLead[p.lead_id].push(p);
    }
  }

  // Resumen Trello-like (comments, checklist, attachments, labels) por lead.
  // Lo cargamos en paralelo en queries livianas: una por dimensión.
  const leadIds = filteredByVista.map((l) => l.id);
  const summaryByLead: Record<string, LeadKanbanSummary> = {};
  let allLabels: LeadLabel[] = [];

  if (leadIds.length > 0) {
    const sb = createServerClient();
    const [commentsRes, checklistRes, attsRes, linksRes, labelsRes] = await Promise.all([
      sb.from("lead_comments").select("lead_id").in("lead_id", leadIds),
      sb.from("lead_checklist").select("lead_id, done").in("lead_id", leadIds),
      sb.from("lead_attachments").select("lead_id").in("lead_id", leadIds),
      sb
        .from("lead_label_links")
        .select("lead_id, label:lead_labels!inner(id, nombre, color, scope)")
        .in("lead_id", leadIds),
      sb.from("lead_labels").select("id, nombre, color, scope").order("nombre"),
    ]);

    // init
    for (const id of leadIds) {
      summaryByLead[id] = {
        comments_count: 0,
        checklist_done: 0,
        checklist_total: 0,
        attachments_count: 0,
        labels: [],
      };
    }

    for (const row of commentsRes.data || []) {
      const s = summaryByLead[row.lead_id as string];
      if (s) s.comments_count += 1;
    }
    for (const row of checklistRes.data || []) {
      const s = summaryByLead[(row as { lead_id: string }).lead_id];
      if (s) {
        s.checklist_total += 1;
        if ((row as { done: boolean }).done) s.checklist_done += 1;
      }
    }
    for (const row of attsRes.data || []) {
      const s = summaryByLead[row.lead_id as string];
      if (s) s.attachments_count += 1;
    }
    type LinkRow = { lead_id: string; label: LeadLabel };
    for (const row of (linksRes.data || []) as unknown as LinkRow[]) {
      const s = summaryByLead[row.lead_id];
      if (s && row.label) s.labels.push(row.label);
    }
    allLabels = (labelsRes.data || []) as LeadLabel[];
  }

  return (
    <PipelineClient
      leads={filteredByVista}
      paymentsByLead={paymentsByLead}
      closers={closers}
      setters={setters}
      usdRate={usdRate}
      session={session}
      isAdmin={isAdmin}
      isPolitica={isPolitica}
      summaryByLead={summaryByLead}
      allLabels={allLabels}
    />
  );
}
