import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // 1. Verify Igna in Supabase
  const { data: igna } = await sb
    .from("team_members")
    .select("id, nombre, etiqueta, is_setter, rol, activo, pin")
    .ilike("nombre", "igna")
    .single();
  console.log("1) Igna en team_members:", igna);

  // 2. Verify UTM campaigns
  const { data: campaigns } = await sb
    .from("utm_campaigns")
    .select("id, url, source, medium, content, setter:team_members!setter_id(nombre)")
    .eq("setter_id", igna?.id);
  console.log("\n2) UTM campaigns de Igna:");
  for (const c of campaigns || []) {
    console.log(`   ${c.source}/${c.medium}/${c.content} → ${c.url.substring(0, 80)}...`);
  }

  // 3. Check existing leads with utm_medium to see pattern
  const { data: leadsUtm } = await sb
    .from("leads")
    .select("nombre, utm_source, utm_medium, utm_content, setter_id, setter:team_members!setter_id(nombre)")
    .not("utm_medium", "is", null)
    .order("created_at", { ascending: false })
    .limit(15);
  console.log("\n3) Últimos leads con utm_medium (¿se mapea a setter?):");
  for (const l of leadsUtm || []) {
    const setterName = (l.setter as any)?.nombre || "NULL";
    console.log(`   utm_medium=${l.utm_medium}  → setter_id=${l.setter_id ? setterName : "NULL"}  | ${l.nombre}`);
  }

  // 4. Check Sheet — find header column for "Setter" and look at recent rows with UTMs
  const auth = new google.auth.GoogleAuth({
    keyFile: "C:\\Users\\matyc\\projects\\roms-crm\\webapp\\credentials.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const SPREADSHEET_ID = "14l6eg-JfY5M00NRSmOT-38f5eRsC0xsOqZl9bsggDv4";

  const hdr = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "'📞 Registro Calls'!A1:AZ1",
  });
  const headers = hdr.data.values?.[0] || [];
  const setterCol = headers.findIndex((h) => h?.toString().toLowerCase().trim() === "setter");
  const fuenteCol = headers.findIndex((h) => h?.toString().toLowerCase().trim().includes("fuente"));
  console.log(`\n4) Sheet header: Setter en col index ${setterCol} (${String.fromCharCode(65 + setterCol)})`);
  console.log(`   Fuente en col index ${fuenteCol} (${String.fromCharCode(65 + fuenteCol)})`);

  // Get last 10 rows from Sheet (around row 1040-1048)
  const rng = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "'📞 Registro Calls'!A1035:AZ1048",
  });
  console.log("\n5) Últimas filas del Sheet (nombre | setter | fuente):");
  for (const row of rng.data.values || []) {
    const nombre = row[0] || "—";
    const setter = row[setterCol] || "—";
    const fuente = row[fuenteCol] || "—";
    if (nombre !== "—") console.log(`   ${nombre.padEnd(30)} | setter: ${String(setter).padEnd(15)} | fuente: ${fuente}`);
  }
}

main().catch(console.error);
