import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

type Row = {
  nombre: string;
  abonado?: string | null;
  primer_video?: string | null;
  cant_grabaciones?: string | null;
  renovacion?: string | null;
  monto_pendiente?: number | null;
};

// Parsed from CLIENTES S.S..xlsx tab RENOVACIONES (filas con nombre)
const XLSX: Row[] = [
  { nombre: "Lean Albornoz", abonado: "PENDIENTE", primer_video: "2026-01-26", cant_grabaciones: "PENDIENTE", renovacion: "PENDIENTE", monto_pendiente: 21000 },
  { nombre: "Mati Zacconi", primer_video: "2026-01-14", cant_grabaciones: "1", renovacion: "PENDIENTE" },
  { nombre: "Lauty Cardozo", renovacion: "PENDIENTE", cant_grabaciones: "PENDIENTE" },
  { nombre: "Lucas Finanzas", abonado: "2025-11-23", primer_video: "2026-01-01", cant_grabaciones: "REMOTO", renovacion: "AL_DIA" },
  { nombre: "David Abogado" },
  { nombre: "Touch Gummy", abonado: "2025-07-07", primer_video: "2025-12-30", cant_grabaciones: "REMOTO", renovacion: "AL_DIA" },
  { nombre: "Jairo Vera" },
  { nombre: "Ale Chileno" },
  { nombre: "Nacho Torres" },
  { nombre: "Multiplycard", abonado: "2025-12-15", primer_video: "2025-12-12", cant_grabaciones: "REMOTO", renovacion: "AL_DIA" },
  { nombre: "Paolucci", abonado: "2025-12-17", primer_video: "2026-01-05", cant_grabaciones: "REMOTO", renovacion: "AL_DIA" },
  { nombre: "Daniela Gh", abonado: "A_CONFIRMAR", primer_video: "2026-01-28" },
  { nombre: "Daniel Poli", abonado: "2025-12-11", primer_video: "2025-12-19", cant_grabaciones: "PENDIENTE", renovacion: "PENDIENTE" },
  { nombre: "Pinsiroli", abonado: "2025-12-24", primer_video: "2025-12-28", cant_grabaciones: "REMOTO", renovacion: "AL_DIA" },
  { nombre: "Pangea", abonado: "2025-12-31", primer_video: "2026-01-23", cant_grabaciones: "PENDIENTE", renovacion: "AL_DIA" },
  { nombre: "Wealth Mastery", cant_grabaciones: "PENDIENTE", renovacion: "AL_DIA" },
  { nombre: "Aval Total", cant_grabaciones: "PENDIENTE", renovacion: "AL_DIA" },
  { nombre: "Fortunata", abonado: "A_CONFIRMAR", primer_video: "2026-01-12", cant_grabaciones: "PENDIENTE", renovacion: "AL_DIA" },
  { nombre: "Passaglia", abonado: "A_CONFIRMAR", primer_video: "2026-01-12", cant_grabaciones: "PENDIENTE", renovacion: "AL_DIA" },
  { nombre: "Luzu Tv", abonado: "A_CONFIRMAR", primer_video: "2026-01-17", cant_grabaciones: "PENDIENTE", renovacion: "AL_DIA" },
  { nombre: "Carola Moran", abonado: "A_CONFIRMAR", primer_video: "2026-01-20", cant_grabaciones: "PENDIENTE", renovacion: "AL_DIA" },
];

// Canales de Discord en "CLIENTES A RENOVAR/STANDBY" → según Mel ya NO son clientes
const DISCORD_INACTIVOS: string[] = [
  "jairo",
  "saba",
  "luis mongemalo",
  "facundo cabral",
  "lebrot",
  "leblon",
  "titto galvez",
  "oklan",
  "tutu",
  "matias nolasco",
  "pangea",
  "nolasco",
  "suono",
  "phi phi toys",
  "phi phi",
  "ferzazzu",
  "raqiastudio",
  "raqia",
];

const PROGRAMA_DAYS: Record<string, number> = {
  roms_7: 90, consultoria: 90, omnipresencia: 120, multicuentas: 120,
};

function norm(s: string) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function tokens(s: string): string[] {
  return norm(s).split(/\s+/).filter((w) => w.length > 2);
}

// Map XLSX row to CRM fields
function mapRow(r: Row) {
  // estado_contacto + estado from renovacion
  const ren = r.renovacion;
  let estado_contacto = "por_contactar";
  let estado = "activo";
  if (ren === "AL_DIA") estado_contacto = "respondio_renueva";
  else if (ren === "PENDIENTE") estado_contacto = "por_contactar";

  // fecha_onboarding: prefer abonado date, else primer_video
  let fecha_onb: string | null = null;
  if (r.abonado && /^\d{4}-\d{2}-\d{2}$/.test(r.abonado)) fecha_onb = r.abonado;
  else if (r.primer_video && /^\d{4}-\d{2}-\d{2}$/.test(r.primer_video)) fecha_onb = r.primer_video;

  return {
    estado,
    estado_contacto,
    fecha_onboarding: fecha_onb,
    deudor_usd: r.monto_pendiente ?? 0,
    notas_seguimiento: [
      r.abonado && !/^\d{4}-\d{2}-\d{2}$/.test(r.abonado) ? `abonado: ${r.abonado}` : null,
      r.cant_grabaciones ? `grabaciones: ${r.cant_grabaciones}` : null,
      r.renovacion ? `renov: ${r.renovacion}` : null,
    ].filter(Boolean).join(" · ") || null,
  };
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const dry = url.searchParams.get("dry") === "1";

  const sb = createServerClient();
  const { data: clients } = await sb.from("clients").select("id, nombre, lead_id, programa");
  const { data: leads } = await sb.from("leads").select("id, nombre, email, programa_pitcheado, fecha_llamada, estado").range(0, 4999);

  let updated = 0, created = 0, matched_existing = 0, leadLinked = 0;
  let renewalsCreated = 0;
  const report: unknown[] = [];

  // Pre-fetch existing renewals to avoid duplicates
  const { data: existingRenewals } = await sb.from("renewal_history").select("client_id, estado").eq("estado", "pago");
  const renewedClientIds = new Set((existingRenewals || []).map((r) => r.client_id));

  async function maybeCreateRenewal(clientId: string, r: Row) {
    if (r.renovacion !== "AL_DIA") return;
    if (renewedClientIds.has(clientId)) return;
    const fecha = (r.abonado && /^\d{4}-\d{2}-\d{2}$/.test(r.abonado)) ? r.abonado
      : (r.primer_video && /^\d{4}-\d{2}-\d{2}$/.test(r.primer_video) ? r.primer_video : new Date().toISOString().slice(0, 10));
    if (dry) {
      report.push({ nombre: r.nombre, action: "would_create_renewal", client_id: clientId, fecha });
      renewalsCreated++;
      renewedClientIds.add(clientId);
      return;
    }
    const { error } = await sb.from("renewal_history").insert({
      client_id: clientId,
      estado: "pago",
      tipo_renovacion: "resell",
      fecha_renovacion: fecha,
      monto_total: 0,
    });
    if (!error) {
      renewalsCreated++;
      renewedClientIds.add(clientId);
    } else {
      report.push({ nombre: r.nombre, action: "renewal_failed", error: error.message });
    }
  }

  for (const r of XLSX) {
    const tks = tokens(r.nombre);
    const mapped = mapRow(r);

    // Try match existing client by token overlap (need all xlsx tokens included)
    const cMatch = (clients || []).find((c) => {
      const cn = norm(c.nombre || "");
      return tks.every((t) => cn.includes(t));
    });

    // Try match lead by token overlap
    const lMatch = !cMatch ? (leads || []).find((l) => {
      const ln = norm(l.nombre || "");
      return tks.every((t) => ln.includes(t));
    }) : null;

    if (cMatch) {
      matched_existing++;
      if (!dry) {
        const { error } = await sb.from("clients").update(mapped).eq("id", cMatch.id);
        if (!error) updated++;
        else report.push({ nombre: r.nombre, action: "update_failed", error: error.message });
      } else {
        report.push({ nombre: r.nombre, action: "would_update", client_id: cMatch.id });
      }
      await maybeCreateRenewal(cMatch.id, r);
    } else {
      // Build new client from lead match (if any) + xlsx data
      const programa = lMatch?.programa_pitcheado || null;
      const totalDias = PROGRAMA_DAYS[programa || ""] || 90;
      const insertData: Record<string, unknown> = {
        nombre: r.nombre,
        programa,
        total_dias_programa: totalDias,
        lead_id: lMatch?.id ?? null,
        llamadas_base: 3,
        health_score: 70,
        estado_seguimiento: "no_necesita",
        pesadilla: false,
        exito: false,
        discord: false,
        skool: false,
        win_discord: false,
        en_wa_esa: false,
        en_ig_grupo: false,
        ...mapped,
      };
      // fecha_onboarding fallback to lead.fecha_llamada if still null
      if (!insertData.fecha_onboarding && lMatch?.fecha_llamada) {
        insertData.fecha_onboarding = String(lMatch.fecha_llamada).split("T")[0];
      }
      if (lMatch) leadLinked++;
      if (!dry) {
        const { data: newCli, error } = await sb.from("clients").insert(insertData).select("id").single();
        if (!error && newCli) {
          created++;
          await maybeCreateRenewal(newCli.id, r);
        }
        else if (error) report.push({ nombre: r.nombre, action: "insert_failed", error: error.message });
      } else {
        report.push({ nombre: r.nombre, action: "would_insert", lead_id: lMatch?.id ?? null });
        // Renewal will be created in real run after insert; skip in dry
      }
    }
  }

  // ── Mark Discord standby clients as inactivo/churned ──
  let markedInactive = 0;
  const inactiveReport: unknown[] = [];
  // Re-fetch updated clients list (may have new inserts)
  const { data: clientsAfter } = await sb.from("clients").select("id, nombre, estado, estado_contacto");
  for (const needle of DISCORD_INACTIVOS) {
    const tks = tokens(needle);
    if (tks.length === 0) continue;
    const matches = (clientsAfter || []).filter((c) => {
      const cn = norm(c.nombre || "");
      return tks.every((t) => cn.includes(t));
    });
    for (const m of matches) {
      if (m.estado === "inactivo" && m.estado_contacto === "no_renueva") continue;
      if (dry) {
        inactiveReport.push({ needle, matched: m.nombre, action: "would_mark_inactive" });
        markedInactive++;
        continue;
      }
      const { error } = await sb.from("clients").update({
        estado: "inactivo",
        estado_contacto: "no_renueva",
      }).eq("id", m.id);
      if (!error) {
        markedInactive++;
        inactiveReport.push({ needle, matched: m.nombre });
      } else {
        inactiveReport.push({ needle, matched: m.nombre, error: error.message });
      }
    }
  }

  // ── Insert missing Discord standby clients as histórico inactivos ──
  const STANDBY_DISCORD: Array<{ nombre: string; programa: string | null }> = [
    { nombre: "Saba", programa: null },
    { nombre: "Luis Mongemalo", programa: null },
    { nombre: "Facundo Cabral", programa: null },
    { nombre: "Oklan", programa: null },
    { nombre: "Tutu", programa: null },
    { nombre: "Suono", programa: null },
    { nombre: "Phi Phi Toys", programa: null },
    { nombre: "Ferzazzu", programa: null },
    { nombre: "Raqia Studio", programa: null },
  ];
  let historicoCreated = 0;
  const historicoReport: unknown[] = [];
  const { data: clientsAfter2 } = await sb.from("clients").select("id, nombre");
  for (const sc of STANDBY_DISCORD) {
    const tks = tokens(sc.nombre);
    const exists = (clientsAfter2 || []).some((c) => {
      const cn = norm(c.nombre || "");
      return tks.every((t) => cn.includes(t));
    });
    if (exists) {
      historicoReport.push({ nombre: sc.nombre, action: "skipped_exists" });
      continue;
    }
    const insertData = {
      nombre: sc.nombre,
      programa: sc.programa,
      total_dias_programa: 90,
      lead_id: null,
      llamadas_base: 3,
      health_score: 0,
      estado: "inactivo",
      estado_contacto: "no_renueva",
      estado_seguimiento: "no_necesita",
      pesadilla: false,
      exito: false,
      discord: true,
      skool: false,
      win_discord: false,
      en_wa_esa: false,
      en_ig_grupo: false,
      deudor_usd: 0,
      notas_seguimiento: "[HIST_DISCORD] Cliente histórico (canal en Discord standby) — ya no está activo según Mel",
      fecha_onboarding: null,
    };
    if (dry) {
      historicoReport.push({ nombre: sc.nombre, action: "would_create_historico" });
      historicoCreated++;
      continue;
    }
    const { error } = await sb.from("clients").insert(insertData);
    if (!error) {
      historicoCreated++;
      historicoReport.push({ nombre: sc.nombre, action: "created_historico" });
    } else {
      historicoReport.push({ nombre: sc.nombre, error: error.message });
    }
  }

  return NextResponse.json({
    ok: true,
    dry_run: dry,
    total_xlsx_rows: XLSX.length,
    historicoCreated,
    historicoReport,
    markedInactive,
    inactiveReport: inactiveReport.slice(0, 50),
    matched_existing,
    updated,
    created,
    leadLinked,
    renewalsCreated,
    report: report.slice(0, 50),
  });
}
