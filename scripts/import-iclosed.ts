import { config } from "dotenv";
import { resolve, join } from "path";
config({ path: resolve(__dirname, "..", ".env.local") });

import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(SB_URL, SB_KEY);

// Team member mapping from iClosed names → Supabase team_members.nombre
const CLOSER_MAP: Record<string, string> = {
  "valentino granata": "Valentino",
  "agustin olivero": "Agustín",
  "agustín olivero": "Agustín",
  "juan martin wohl": "Juan Martín",
  "juan martín wohl": "Juan Martín",
  "federico fernandez": "Fede",
  "federico fernández": "Fede",
  "fede fernandez": "Fede",
  "fede fernández": "Fede",
};

function mapEstado(callOutcome: string | null, callStatus: string | null): string {
  const outcome = (callOutcome || "").trim().toUpperCase();
  const status = (callStatus || "").trim().toLowerCase();

  if (outcome === "SALE") return "cerrado";
  if (outcome === "NO_SALE" || outcome === "NO SALE") return "no_cierre";
  if (status === "cancelled" || status === "canceled") return "cancelada";
  if (status === "no show" || status === "no_show" || status === "noshow") return "no_show";
  if (status === "scheduled") return "pendiente";
  if (status === "complete" || status === "completed") return "pendiente";
  return "pendiente";
}

function mapFuente(utmSource: string | null): string | null {
  if (!utmSource) return null;
  const s = utmSource.toLowerCase();
  if (s.includes("instagram") || s.includes("ig")) return "instagram";
  if (s.includes("youtube") || s.includes("yt")) return "youtube";
  if (s.includes("whatsapp") || s.includes("wa")) return "whatsapp";
  if (s.includes("dm")) return "dm_directo";
  return "otro";
}

function parseExcelDate(value: any): string | null {
  if (!value) return null;
  // Excel serial number
  if (typeof value === "number") {
    const date = new Date((value - 25569) * 86400 * 1000);
    return date.toISOString();
  }
  // Already a string
  if (typeof value === "string") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

async function main() {
  const filePath = join(process.env.HOME || process.env.USERPROFILE || "", "Downloads", "iclosed", "Global Data - calls - 10-Apr 15_56.xlsx");

  console.log(`Reading: ${filePath}`);
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
  console.log(`Total rows in Excel: ${rows.length}`);

  // Print first row keys for debugging
  if (rows.length > 0) {
    console.log("Columns:", Object.keys(rows[0]).join(", "));
    console.log("Sample row:", JSON.stringify(rows[0], null, 2));
  }

  // Get team members
  const { data: teamMembers } = await supabase.from("team_members").select("id,nombre");
  const teamMap: Record<string, string> = {};
  for (const t of teamMembers || []) {
    if (t.nombre) teamMap[t.nombre.toLowerCase()] = t.id;
  }
  console.log("Team members:", Object.keys(teamMap).join(", "));

  // Get existing leads by email for dedup
  const { data: existingLeads } = await supabase.from("leads").select("id,email").not("email", "is", null);
  const emailToId: Record<string, string> = {};
  for (const l of existingLeads || []) {
    if (l.email) emailToId[l.email.toLowerCase().trim()] = l.id;
  }
  console.log(`Existing leads with email: ${Object.keys(emailToId).length}`);

  let created = 0, updated = 0, errors = 0, skipped = 0;

  for (const row of rows) {
    const email = (row["Contact"] || "").trim().toLowerCase();
    const firstName = (row["First Name"] || "").trim();
    const lastName = (row["Last Name"] || "").trim();
    const nombre = `${firstName} ${lastName}`.trim();

    if (!email || !nombre || nombre.length < 2) {
      skipped++;
      continue;
    }

    // Map closer
    const closerRaw = (row["Call Closer Owner"] || "").trim().toLowerCase();
    let closerId: string | null = null;
    if (closerRaw) {
      const mappedName = CLOSER_MAP[closerRaw];
      if (mappedName) {
        closerId = teamMap[mappedName.toLowerCase()] || null;
      }
      // Fallback: try partial match
      if (!closerId) {
        for (const [key, id] of Object.entries(teamMap)) {
          if (closerRaw.includes(key) || key.includes(closerRaw.split(" ")[0])) {
            closerId = id;
            break;
          }
        }
      }
    }

    const callOutcome = row["Call_outcome"] || row["Call outcome"] || null;
    const callStatus = row["Call Status"] || null;
    const estado = mapEstado(callOutcome, callStatus);

    const utmSource = row["UTM Source"] || null;
    const utmMedium = row["UTM Medium"] || null;
    const utmContent = row["UTM Content"] || null;
    const fuente = mapFuente(utmSource);

    const callLocation = row["Call Location"] || "";
    const linkLlamada = callLocation.includes("meet.google") || callLocation.includes("zoom") ? callLocation : null;

    const lead: Record<string, any> = {
      nombre,
      email,
      fecha_agendado: parseExcelDate(row["Call Creation Date"]),
      fecha_llamada: parseExcelDate(row["Call Start Date"]),
      closer_id: closerId,
      estado,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_content: utmContent,
      link_llamada: linkLlamada,
    };

    // Only set fuente if we have a valid enum value
    if (fuente && ["historias", "lead_magnet", "youtube", "instagram", "dm_directo", "historia_cta", "historia_hr", "comentario_manychat", "encuesta", "why_now", "win", "fup", "whatsapp", "otro"].includes(fuente)) {
      lead.fuente = fuente;
    }

    const existingId = emailToId[email];

    try {
      if (existingId) {
        // Update existing lead — don't overwrite estado if already "cerrado"
        const { data: current } = await supabase.from("leads").select("estado").eq("id", existingId).single();
        if (current?.estado === "cerrado" && estado !== "cerrado") {
          delete lead.estado; // Don't downgrade a closed lead
        }
        const { error } = await supabase.from("leads").update(lead).eq("id", existingId);
        if (error) {
          console.error(`Error updating ${email}:`, error.message);
          errors++;
        } else {
          updated++;
        }
      } else {
        const { data: newLead, error } = await supabase.from("leads").insert(lead).select("id").single();
        if (error) {
          console.error(`Error creating ${email}:`, error.message);
          errors++;
        } else {
          emailToId[email] = newLead.id;
          created++;
        }
      }
    } catch (e: any) {
      console.error(`Exception for ${email}:`, e.message);
      errors++;
    }
  }

  console.log("\n=== iClosed Import Complete ===");
  console.log(`Total rows: ${rows.length}`);
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);

  // Final count
  const { count } = await supabase.from("leads").select("*", { count: "exact", head: true });
  console.log(`\nTotal leads in DB: ${count}`);
}

main().catch(console.error).finally(() => process.exit(0));
