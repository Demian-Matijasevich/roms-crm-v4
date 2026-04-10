import { config } from "dotenv";
import { resolve, join } from "path";
config({ path: resolve(__dirname, "..", ".env.local") });

import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SB_URL, SB_KEY);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

const TEAM_ALIASES: Record<string, string> = {
  valentino: "Valentino",
  valen: "Valentino",
  agustin: "Agustín",
  "agustín": "Agustín",
  "juan martin": "Juan Martín",
  "juan martín": "Juan Martín",
  fede: "Fede",
  federico: "Fede",
  guille: "Guille",
};

function resolveTeamId(raw: string | null, teamMap: Record<string, string>): string | null {
  if (!raw) return null;
  const n = normalize(raw);
  const alias = TEAM_ALIASES[n];
  if (alias) return teamMap[alias.toLowerCase()] || null;
  if (teamMap[n]) return teamMap[n];
  for (const [key, id] of Object.entries(teamMap)) {
    if (n.includes(key) || key.includes(n)) return id;
  }
  return null;
}

function parseExcelDate(value: any): string | null {
  if (!value) return null;
  if (typeof value === "number") {
    const d = new Date((value - 25569) * 86400 * 1000);
    return d.toISOString();
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function mapFuente(raw: string | null): string | null {
  if (!raw) return null;
  const s = normalize(raw);
  if (s.includes("instagram") || s === "ig") return "instagram";
  if (s.includes("youtube") || s === "yt") return "youtube";
  if (s.includes("whatsapp") || s.includes("wa")) return "whatsapp";
  if (s.includes("landing") || s.includes("web")) return "lead_magnet";
  if (s.includes("historia")) return "historias";
  if (s.includes("dm")) return "dm_directo";
  if (s.includes("referid")) return "otro";
  return "otro";
}

const VALID_FUENTES = new Set([
  "historias", "lead_magnet", "youtube", "instagram", "dm_directo",
  "historia_cta", "historia_hr", "comentario_manychat", "encuesta",
  "why_now", "win", "fup", "whatsapp", "otro",
]);

function fuzzyMatchLead(
  nombre: string,
  leadsByName: Record<string, { id: string; closer_id: string | null; fuente: string | null; lead_calificado: string | null; estado: string | null }>
): { id: string; closer_id: string | null; fuente: string | null; lead_calificado: string | null; estado: string | null } | null {
  const n = normalize(nombre);
  if (leadsByName[n]) return leadsByName[n];

  for (const [key, lead] of Object.entries(leadsByName)) {
    if (key.includes(n) || n.includes(key)) return lead;
  }

  const tokens = n.split(" ").filter((t) => t.length > 2);
  if (tokens.length >= 2) {
    for (const [key, lead] of Object.entries(leadsByName)) {
      const keyTokens = key.split(" ");
      const matches = tokens.filter((t) => keyTokens.some((kt) => kt.includes(t) || t.includes(kt)));
      if (matches.length >= 2) return lead;
    }
  }

  if (tokens.length >= 2) {
    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    for (const [key, lead] of Object.entries(leadsByName)) {
      if (key.includes(first) && key.includes(last)) return lead;
    }
  }

  return null;
}

async function main() {
  const filePath = join(
    process.env.HOME || process.env.USERPROFILE || "",
    "Downloads",
    "iclosed",
    "CRM VENTAS SECURE SCALE.xlsx"
  );

  console.log(`Reading: ${filePath}`);
  const workbook = XLSX.readFile(filePath);
  const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets["CRM Agendas"]);
  console.log(`CRM Agendas rows: ${rows.length}`);

  // ── Load team members ───────────────────────────────────────────
  const { data: teamMembers } = await supabase.from("team_members").select("id,nombre");
  const teamMap: Record<string, string> = {};
  for (const t of teamMembers || []) {
    if (t.nombre) teamMap[t.nombre.toLowerCase()] = t.id;
  }

  // ── Load leads ──────────────────────────────────────────────────
  const { data: allLeads } = await supabase
    .from("leads")
    .select("id,nombre,closer_id,fuente,lead_calificado,estado")
    .limit(3000);
  const leadsByName: Record<string, { id: string; closer_id: string | null; fuente: string | null; lead_calificado: string | null; estado: string | null }> = {};
  for (const l of allLeads || []) {
    if (l.nombre) leadsByName[normalize(l.nombre)] = l;
  }
  console.log(`Leads loaded: ${Object.keys(leadsByName).length}`);

  let enriched = 0,
    createdLeads = 0,
    skipped = 0,
    noChange = 0,
    errors = 0;

  for (const row of rows) {
    const nombre = (row["Nombre"] || "").trim();
    if (!nombre || nombre.length < 2) {
      skipped++;
      continue;
    }

    const match = fuzzyMatchLead(nombre, leadsByName);

    if (match) {
      // Enrich existing lead — only update null fields
      const updates: Record<string, any> = {};

      // closer_id
      if (!match.closer_id) {
        const closerId = resolveTeamId(row["Closer"], teamMap);
        if (closerId) updates.closer_id = closerId;
      }

      // fuente
      if (!match.fuente) {
        const fuente = mapFuente(row["Fuente"]);
        if (fuente && VALID_FUENTES.has(fuente)) updates.fuente = fuente;
      }

      // lead_calificado
      if (!match.lead_calificado) {
        const cal = (row["Calificado"] || "").toLowerCase();
        if (cal.includes("si") || cal.includes("calificado") && !cal.includes("no")) {
          updates.lead_calificado = "calificado";
        } else if (cal.includes("no")) {
          updates.lead_calificado = "no_calificado";
        }
      }

      // estado → cerrado if applicable
      const cierre = row["Cierre"];
      const situacion = (row["Situación"] || "").toLowerCase();
      if (match.estado !== "cerrado") {
        if (cierre === "SI" || cierre === 1 || situacion.includes("cerrado") || situacion.includes("cerró")) {
          updates.estado = "cerrado";
        }
      }

      if (Object.keys(updates).length === 0) {
        noChange++;
        continue;
      }

      try {
        const { error } = await supabase.from("leads").update(updates).eq("id", match.id);
        if (error) {
          console.error(`Error updating "${nombre}":`, error.message);
          errors++;
        } else {
          enriched++;
        }
      } catch (e: any) {
        console.error(`Exception for "${nombre}":`, e.message);
        errors++;
      }
    } else {
      // Create new lead
      const closerId = resolveTeamId(row["Closer"], teamMap);
      const fuente = mapFuente(row["Fuente"]);
      const cal = (row["Calificado"] || "").toLowerCase();
      let leadCalificado: string | null = null;
      if (cal.includes("si") || (cal.includes("calificado") && !cal.includes("no"))) {
        leadCalificado = "calificado";
      } else if (cal.includes("no")) {
        leadCalificado = "no_calificado";
      }

      const cierre = row["Cierre"];
      const situacion = (row["Situación"] || "").toLowerCase();
      let estado = "pendiente";
      if (cierre === "SI" || cierre === 1 || situacion.includes("cerrado") || situacion.includes("cerró")) {
        estado = "cerrado";
      } else if (situacion.includes("no show")) {
        estado = "no_show";
      } else if (situacion.includes("cancel")) {
        estado = "cancelada";
      } else if (situacion.includes("seguimiento")) {
        estado = "seguimiento";
      } else if (situacion.includes("no cierre") || situacion.includes("no cerr")) {
        estado = "no_cierre";
      }

      const telefono = row["Numero"] ? String(row["Numero"]).trim() : null;
      const fechaAgendado = parseExcelDate(row["Fecha de Agenda"]);
      const fechaLlamada = parseExcelDate(row["Fecha de Llamada"]);

      const lead: Record<string, any> = {
        nombre,
        estado,
        fecha_agendado: fechaAgendado,
        fecha_llamada: fechaLlamada,
      };
      if (closerId) lead.closer_id = closerId;
      if (fuente && VALID_FUENTES.has(fuente)) lead.fuente = fuente;
      if (leadCalificado) lead.lead_calificado = leadCalificado;
      if (telefono && telefono.length > 3) lead.telefono = telefono;

      try {
        const { data: newLead, error } = await supabase.from("leads").insert(lead).select("id").single();
        if (error) {
          console.error(`Error creating "${nombre}":`, error.message);
          errors++;
        } else {
          createdLeads++;
          // Add to map so we don't create duplicates within run
          leadsByName[normalize(nombre)] = {
            id: newLead.id,
            closer_id: closerId,
            fuente: fuente,
            lead_calificado: leadCalificado,
            estado,
          };
        }
      } catch (e: any) {
        console.error(`Exception creating "${nombre}":`, e.message);
        errors++;
      }
    }
  }

  console.log("\n=== CRM Agendas Enrichment Complete ===");
  console.log(`Enriched (updated null fields): ${enriched}`);
  console.log(`New leads created: ${createdLeads}`);
  console.log(`No changes needed: ${noChange}`);
  console.log(`Skipped (no name): ${skipped}`);
  console.log(`Errors: ${errors}`);

  const { count } = await supabase.from("leads").select("*", { count: "exact", head: true });
  console.log(`\nTotal leads in DB: ${count}`);
}

main().catch(console.error).finally(() => process.exit(0));
