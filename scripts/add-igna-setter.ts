import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // Check if already exists
  const { data: existing } = await sb
    .from("team_members")
    .select("id, nombre, is_setter")
    .ilike("nombre", "%igna%");
  console.log("Existing Igna:", existing);

  let ignaId: string;
  if (existing && existing.length > 0) {
    ignaId = existing[0].id;
    console.log(`Igna exists: ${ignaId}`);
  } else {
    // Find next free PIN
    const { data: pins } = await sb.from("team_members").select("pin");
    const used = new Set((pins || []).map((p) => p.pin).filter(Boolean));
    let pin = 1003;
    while (used.has(String(pin))) pin++;

    const { data: inserted, error } = await sb
      .from("team_members")
      .insert({
        nombre: "Igna",
        etiqueta: "igna",
        rol: "setter",
        is_setter: true,
        is_admin: false,
        is_closer: false,
        comision_pct: 0,
        pin: String(pin),
        activo: true,
      })
      .select()
      .single();
    if (error) throw error;
    ignaId = inserted.id;
    console.log(`Inserted Igna id=${ignaId} pin=${pin}`);
  }

  // Create UTM campaigns
  const inbound = "https://app.iclosed.io/e/romsconsultora/s-llamada-de-consultoria-i-roms-consultora?utm_source=inbound&utm_medium=IGNA&utm_content=IGNA";
  const outbound = "https://app.iclosed.io/e/romsconsultora/ot-llamada-de-consultoria-i-roms-consultora?utm_source=outbound&utm_medium=IGNA&utm_content=IGNA";

  const { data: sample } = await sb.from("utm_campaigns").select("*").limit(1);
  console.log("utm_campaigns sample columns:", sample?.[0] ? Object.keys(sample[0]) : "empty table");

  const campaigns = [
    {
      url: inbound,
      source: "inbound",
      medium: "IGNA",
      content: "IGNA",
      setter_id: ignaId,
    },
    {
      url: outbound,
      source: "outbound",
      medium: "IGNA",
      content: "IGNA",
      setter_id: ignaId,
    },
  ];

  for (const c of campaigns) {
    const { data, error } = await sb.from("utm_campaigns").insert(c).select().single();
    if (error) {
      console.error(`Error inserting ${c.source}:`, error);
    } else {
      console.log(`✓ Created ${c.source} campaign: ${data.id}`);
    }
  }
}

main().catch(console.error);
