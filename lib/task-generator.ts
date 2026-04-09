import { createServerClient } from "@/lib/supabase-server";
import { hasActiveTask, createAgentTask } from "@/lib/queries/agent-tasks";
import type {
  AgentTaskTipo,
  RenewalQueueRow,
  SessionAvailability,
} from "@/lib/types";

interface GenerationResult {
  created: number;
  skipped: number;
  errors: string[];
  details: { tipo: AgentTaskTipo; client_nombre: string; created: boolean }[];
}

export async function generateTasks(): Promise<GenerationResult> {
  const supabase = createServerClient();
  const result: GenerationResult = {
    created: 0,
    skipped: 0,
    errors: [],
    details: [],
  };

  // =============================================
  // 1. Cuotas pendientes que vencen en <= 3 dias
  // =============================================
  try {
    const today = new Date();
    const in3Days = new Date(today);
    in3Days.setDate(in3Days.getDate() + 3);

    const { data: pendingPayments } = await supabase
      .from("payments")
      .select(`
        id, monto_usd, fecha_vencimiento, numero_cuota,
        client:clients(id, nombre, telefono, programa, canal_contacto, estado_contacto),
        lead:leads(id, nombre, telefono, instagram)
      `)
      .eq("estado", "pendiente")
      .lte("fecha_vencimiento", in3Days.toISOString().split("T")[0])
      .order("fecha_vencimiento", { ascending: true });

    for (const p of pendingPayments ?? []) {
      const clientId = (p as any).client?.id;
      if (!clientId) continue;

      const exists = await hasActiveTask(clientId, "cobrar_cuota");
      const clientData = (p as any).client;
      const vencDate = new Date(p.fecha_vencimiento!);
      const diasVencido = Math.floor(
        (vencDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );
      const prioridad = diasVencido < 0 ? 1 : diasVencido <= 0 ? 2 : 3;

      if (exists) {
        result.skipped++;
        result.details.push({
          tipo: "cobrar_cuota",
          client_nombre: clientData.nombre,
          created: false,
        });
        continue;
      }

      await createAgentTask({
        tipo: "cobrar_cuota",
        client_id: clientId,
        lead_id: null,
        payment_id: p.id,
        prioridad,
        estado: "pending",
        asignado_a: "agent",
        human_assignee_id: null,
        canal: clientData.canal_contacto === "instagram_dm" ? "dm_instagram" : "whatsapp",
        contexto: {
          client_nombre: clientData.nombre,
          client_telefono: clientData.telefono,
          programa: clientData.programa,
          monto_usd: p.monto_usd,
          numero_cuota: p.numero_cuota,
          fecha_vencimiento: p.fecha_vencimiento,
          dias_vencido: diasVencido,
          estado_contacto: clientData.estado_contacto,
          mensaje_sugerido: diasVencido < 0
            ? `Hola ${clientData.nombre}! Tu cuota #${p.numero_cuota} por $${p.monto_usd} USD vencio hace ${Math.abs(diasVencido)} dias. Necesitamos regularizar el pago para continuar con la mentoria. Te paso los datos?`
            : `Hola ${clientData.nombre}! Te recuerdo que tu cuota #${p.numero_cuota} por $${p.monto_usd} USD vence ${diasVencido === 0 ? "hoy" : `en ${diasVencido} dias`}. Te paso los datos de pago?`,
        },
        scheduled_at: new Date().toISOString(),
        resultado: null,
        notas: null,
      });

      result.created++;
      result.details.push({
        tipo: "cobrar_cuota",
        client_nombre: clientData.nombre,
        created: true,
      });
    }
  } catch (err: any) {
    result.errors.push(`cobrar_cuota: ${err.message}`);
  }

  // =============================================
  // 2. Renovaciones proximas (from v_renewal_queue)
  // =============================================
  try {
    const { data: renewals } = await supabase
      .from("v_renewal_queue")
      .select("*")
      .in("semaforo", ["vencido", "urgente", "proximo"]);

    for (const r of (renewals ?? []) as RenewalQueueRow[]) {
      const exists = await hasActiveTask(r.id, "renovacion");
      const prioridad =
        r.semaforo === "vencido" ? 1 : r.semaforo === "urgente" ? 2 : 3;

      if (exists) {
        result.skipped++;
        result.details.push({
          tipo: "renovacion",
          client_nombre: r.nombre,
          created: false,
        });
        continue;
      }

      // Fetch full client for contexto
      const { data: fullClient } = await supabase
        .from("clients")
        .select("telefono, canal_contacto, estado_contacto, health_score")
        .eq("id", r.id)
        .single();

      await createAgentTask({
        tipo: "renovacion",
        client_id: r.id,
        lead_id: null,
        payment_id: null,
        prioridad,
        estado: "pending",
        asignado_a: "agent",
        human_assignee_id: null,
        canal: fullClient?.canal_contacto === "instagram_dm" ? "dm_instagram" : "whatsapp",
        contexto: {
          client_nombre: r.nombre,
          client_telefono: fullClient?.telefono,
          programa: r.programa,
          fecha_vencimiento: r.fecha_vencimiento,
          dias_restantes: r.dias_restantes,
          semaforo: r.semaforo,
          health_score: r.health_score,
          estado_contacto: fullClient?.estado_contacto,
          mensaje_sugerido: r.dias_restantes < 0
            ? `Hola ${r.nombre}! Tu mentoria de ${r.programa} ya finalizo. Queriamos saber como te fue y si te interesa renovar para seguir avanzando. Tenes un momento para hablar?`
            : `Hola ${r.nombre}! Tu mentoria de ${r.programa} finaliza en ${r.dias_restantes} dias. Queriamos contactarte para hablar sobre la renovacion y las opciones disponibles.`,
        },
        scheduled_at: new Date().toISOString(),
        resultado: null,
        notas: null,
      });

      result.created++;
      result.details.push({
        tipo: "renovacion",
        client_nombre: r.nombre,
        created: true,
      });
    }
  } catch (err: any) {
    result.errors.push(`renovacion: ${err.message}`);
  }

  // =============================================
  // 3. Seguimiento: activos sin seguimiento 7+ dias
  // =============================================
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: needsFollowUp } = await supabase
      .from("clients")
      .select("id, nombre, telefono, programa, canal_contacto, estado_contacto, fecha_ultimo_seguimiento, health_score")
      .eq("estado", "activo")
      .eq("estado_seguimiento", "para_seguimiento")
      .lt("fecha_ultimo_seguimiento", sevenDaysAgo.toISOString().split("T")[0]);

    for (const c of needsFollowUp ?? []) {
      const exists = await hasActiveTask(c.id, "seguimiento");
      if (exists) {
        result.skipped++;
        result.details.push({
          tipo: "seguimiento",
          client_nombre: c.nombre,
          created: false,
        });
        continue;
      }

      const daysSince = c.fecha_ultimo_seguimiento
        ? Math.floor(
            (new Date().getTime() - new Date(c.fecha_ultimo_seguimiento).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : 999;

      await createAgentTask({
        tipo: "seguimiento",
        client_id: c.id,
        lead_id: null,
        payment_id: null,
        prioridad: daysSince > 14 ? 2 : 3,
        estado: "pending",
        asignado_a: "human",
        human_assignee_id: null,
        canal: (c as any).canal_contacto === "instagram_dm" ? "dm_instagram" : "whatsapp",
        contexto: {
          client_nombre: c.nombre,
          client_telefono: (c as any).telefono,
          programa: (c as any).programa,
          dias_sin_seguimiento: daysSince,
          health_score: (c as any).health_score,
          estado_contacto: (c as any).estado_contacto,
          mensaje_sugerido: `Hola ${c.nombre}! Hace ${daysSince} dias que no hablamos. Como vas con la mentoria? Necesitas algo?`,
        },
        scheduled_at: new Date().toISOString(),
        resultado: null,
        notas: null,
      });

      result.created++;
      result.details.push({
        tipo: "seguimiento",
        client_nombre: c.nombre,
        created: true,
      });
    }
  } catch (err: any) {
    result.errors.push(`seguimiento: ${err.message}`);
  }

  // =============================================
  // 4. Upsell: sesiones agotadas (v_session_availability)
  // =============================================
  try {
    const { data: exhausted } = await supabase
      .from("v_session_availability")
      .select("*")
      .eq("semaforo", "agotadas");

    for (const s of (exhausted ?? []) as SessionAvailability[]) {
      const exists = await hasActiveTask(s.client_id, "oportunidad_upsell");
      if (exists) {
        result.skipped++;
        result.details.push({
          tipo: "oportunidad_upsell",
          client_nombre: s.nombre,
          created: false,
        });
        continue;
      }

      const { data: fullClient } = await supabase
        .from("clients")
        .select("telefono, canal_contacto, estado_contacto, health_score")
        .eq("id", s.client_id)
        .single();

      await createAgentTask({
        tipo: "oportunidad_upsell",
        client_id: s.client_id,
        lead_id: null,
        payment_id: null,
        prioridad: 4,
        estado: "pending",
        asignado_a: "human",
        human_assignee_id: null,
        canal: fullClient?.canal_contacto === "instagram_dm" ? "dm_instagram" : "whatsapp",
        contexto: {
          client_nombre: s.nombre,
          client_telefono: fullClient?.telefono,
          programa: s.programa,
          sesiones_consumidas: s.sesiones_consumidas,
          llamadas_base: s.llamadas_base,
          rating_promedio: s.rating_promedio,
          health_score: fullClient?.health_score,
          mensaje_sugerido: `${s.nombre} agoto sus ${s.llamadas_base} sesiones 1a1. Rating promedio: ${s.rating_promedio ?? "N/A"}. Evaluar upsell a VIP o sesiones adicionales.`,
        },
        scheduled_at: new Date().toISOString(),
        resultado: null,
        notas: null,
      });

      result.created++;
      result.details.push({
        tipo: "oportunidad_upsell",
        client_nombre: s.nombre,
        created: true,
      });
    }
  } catch (err: any) {
    result.errors.push(`oportunidad_upsell: ${err.message}`);
  }

  // =============================================
  // 5. Bienvenida: leads cerrados sin onboarding
  // =============================================
  try {
    const { data: closedLeads } = await supabase
      .from("leads")
      .select("id, nombre, telefono, instagram, programa_pitcheado, ticket_total")
      .eq("estado", "cerrado");

    for (const lead of closedLeads ?? []) {
      // Check if onboarding exists
      const { count } = await supabase
        .from("onboarding")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", lead.id);

      if ((count ?? 0) > 0) {
        result.skipped++;
        continue;
      }

      // Check if active task exists (use lead_id check since there's no client yet)
      const { count: taskCount } = await supabase
        .from("agent_tasks")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", lead.id)
        .eq("tipo", "bienvenida")
        .not("estado", "in", '("done","failed")');

      if ((taskCount ?? 0) > 0) {
        result.skipped++;
        result.details.push({
          tipo: "bienvenida",
          client_nombre: lead.nombre,
          created: false,
        });
        continue;
      }

      await createAgentTask({
        tipo: "bienvenida",
        client_id: null,
        lead_id: lead.id,
        payment_id: null,
        prioridad: 1,
        estado: "pending",
        asignado_a: "human",
        human_assignee_id: null,
        canal: "whatsapp",
        contexto: {
          lead_nombre: lead.nombre,
          lead_telefono: lead.telefono,
          lead_instagram: lead.instagram,
          programa: lead.programa_pitcheado,
          ticket_total: lead.ticket_total,
          mensaje_sugerido: `Bienvenido ${lead.nombre}! Muchas gracias por confiar en nosotros. El proximo paso es completar tu formulario de onboarding para que podamos configurar todo y arrancar con tu mentoria lo antes posible.`,
        },
        scheduled_at: new Date().toISOString(),
        resultado: null,
        notas: null,
      });

      result.created++;
      result.details.push({
        tipo: "bienvenida",
        client_nombre: lead.nombre,
        created: true,
      });
    }
  } catch (err: any) {
    result.errors.push(`bienvenida: ${err.message}`);
  }

  // =============================================
  // 6. Seguimiento urgente: rating <= 5 en 1a1
  // =============================================
  try {
    const { data: lowRated } = await supabase
      .from("tracker_sessions")
      .select("id, client_id, rating, numero_sesion, client:clients(id, nombre, telefono, programa, canal_contacto, health_score)")
      .lte("rating", 5)
      .not("rating", "is", null)
      .eq("estado", "done");

    for (const session of lowRated ?? []) {
      const clientId = (session as any).client?.id;
      if (!clientId) continue;

      const exists = await hasActiveTask(clientId, "seguimiento_urgente");
      if (exists) {
        result.skipped++;
        result.details.push({
          tipo: "seguimiento_urgente",
          client_nombre: (session as any).client.nombre,
          created: false,
        });
        continue;
      }

      const clientData = (session as any).client;
      await createAgentTask({
        tipo: "seguimiento_urgente",
        client_id: clientId,
        lead_id: null,
        payment_id: null,
        prioridad: 1,
        estado: "pending",
        asignado_a: "human",
        human_assignee_id: null,
        canal: clientData.canal_contacto === "instagram_dm" ? "dm_instagram" : "whatsapp",
        contexto: {
          client_nombre: clientData.nombre,
          client_telefono: clientData.telefono,
          programa: clientData.programa,
          rating: session.rating,
          numero_sesion: session.numero_sesion,
          health_score: clientData.health_score,
          motivo: `Rating ${session.rating}/10 en sesion #${session.numero_sesion}`,
          mensaje_sugerido: `URGENTE: ${clientData.nombre} dio rating ${session.rating}/10 en su sesion #${session.numero_sesion}. Contactar inmediatamente para entender que paso y ofrecer solucion.`,
        },
        scheduled_at: new Date().toISOString(),
        resultado: null,
        notas: null,
      });

      result.created++;
      result.details.push({
        tipo: "seguimiento_urgente",
        client_nombre: clientData.nombre,
        created: true,
      });
    }
  } catch (err: any) {
    result.errors.push(`seguimiento_urgente (rating): ${err.message}`);
  }

  // =============================================
  // 7. Seguimiento urgente: health_score < 50
  // =============================================
  try {
    const { data: lowHealth } = await supabase
      .from("clients")
      .select("id, nombre, telefono, programa, canal_contacto, health_score")
      .eq("estado", "activo")
      .lt("health_score", 50);

    for (const c of lowHealth ?? []) {
      const exists = await hasActiveTask(c.id, "seguimiento_urgente");
      if (exists) {
        result.skipped++;
        result.details.push({
          tipo: "seguimiento_urgente",
          client_nombre: c.nombre,
          created: false,
        });
        continue;
      }

      await createAgentTask({
        tipo: "seguimiento_urgente",
        client_id: c.id,
        lead_id: null,
        payment_id: null,
        prioridad: 1,
        estado: "pending",
        asignado_a: "human",
        human_assignee_id: null,
        canal: (c as any).canal_contacto === "instagram_dm" ? "dm_instagram" : "whatsapp",
        contexto: {
          client_nombre: c.nombre,
          client_telefono: (c as any).telefono,
          programa: (c as any).programa,
          health_score: c.health_score,
          motivo: `Health score critico: ${c.health_score}/100`,
          mensaje_sugerido: `ATENCION: ${c.nombre} tiene health score ${c.health_score}/100. Riesgo alto de churn. Contactar para entender situacion y re-enganchar.`,
        },
        scheduled_at: new Date().toISOString(),
        resultado: null,
        notas: null,
      });

      result.created++;
      result.details.push({
        tipo: "seguimiento_urgente",
        client_nombre: c.nombre,
        created: true,
      });
    }
  } catch (err: any) {
    result.errors.push(`seguimiento_urgente (health): ${err.message}`);
  }

  return result;
}
