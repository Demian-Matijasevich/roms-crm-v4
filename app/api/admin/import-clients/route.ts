import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

const SECRET = process.env.ICLOSED_WEBHOOK_SECRET || "roms-iclosed-2026";

// Client list from the PDF "Clientes ROMS- Servicio.pdf"
const CLIENTS: Array<{ nombre: string; programa: string }> = [
  { nombre: "Matias Zacconi", programa: "omnipresencia" },
  { nombre: "Lautaro Cardozo", programa: "omnipresencia" },
  { nombre: "Lucas Finanzas", programa: "multicuentas" },
  { nombre: "David Abogado", programa: "omnipresencia" },
  { nombre: "Lean Albornoz", programa: "omnipresencia" },
  { nombre: "Alejandro Chileno", programa: "omnipresencia" },
  { nombre: "Rodrigo de loredo", programa: "multicuentas" },
  { nombre: "Touch Gummy", programa: "omnipresencia" },
  { nombre: "Multiplycard", programa: "omnipresencia" },
  { nombre: "Joaquin Paolucci", programa: "omnipresencia" },
  { nombre: "Carola Moran", programa: "omnipresencia" },
  { nombre: "Gabriela Wealth Mastery", programa: "omnipresencia" },
  { nombre: "Santiago Pinsiroli", programa: "multicuentas" },
  { nombre: "Aval Total", programa: "omnipresencia" },
  { nombre: "Luzu Tv", programa: "multicuentas" },
  { nombre: "Nacho Torres", programa: "multicuentas" },
  { nombre: "Daniela de lucia", programa: "multicuentas" },
  { nombre: "Daniel Passerini", programa: "multicuentas" },
  { nombre: "Manuel Passaglia", programa: "multicuentas" },
  { nombre: "Emilia Lopez", programa: "omnipresencia" },
  { nombre: "Fortunata", programa: "omnipresencia" },
  { nombre: "Amnesia in Ámsterdam", programa: "omnipresencia" },
  { nombre: "Leblon", programa: "multicuentas" },
  { nombre: "Made in china", programa: "omnipresencia" },
  { nombre: "Pullaro", programa: "multicuentas" },
  { nombre: "Mr Bet", programa: "multicuentas" },
  { nombre: "Spreen", programa: "multicuentas" },
  { nombre: "Forastieri", programa: "omnipresencia" },
  { nombre: "Valentina Banchero", programa: "omnipresencia" },
  { nombre: "Matias Randazzo", programa: "multicuentas" },
  { nombre: "Tondinilaw", programa: "multicuentas" },
  { nombre: "Andres Castrili", programa: "omnipresencia" },
  { nombre: "Rafael Porras", programa: "consultoria" },
  { nombre: "La milagresa", programa: "omnipresencia" },
  { nombre: "Tony Zagan", programa: "multicuentas" },
  { nombre: "Mauricio Fernandez", programa: "multicuentas" },
];

function norm(s: string) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

// Known bad short-name matches (business names that'd match random people)
const NEVER_MATCH = new Set(["mr bet", "luzu tv", "made in china", "aval total", "la milagresa"]);

async function findLeadMatch(sb: ReturnType<typeof createServerClient>, name: string) {
  const nm = norm(name);
  if (NEVER_MATCH.has(nm)) return null;
  const needle = nm.split(" ").filter((w) => w.length > 2);
  if (needle.length === 0) return null;
  // Require at least 2 matching tokens OR a single distinctive token (>5 chars) for single-word client names
  const { data: leads } = await sb.from("leads").select("id, nombre, email, estado").range(0, 4999);
  if (!leads) return null;
  const candidates = leads.map((l) => {
    const ln = norm(l.nombre || "");
    const matches = needle.filter((w) => ln.includes(w)).length;
    return { lead: l, matches, ln };
  }).filter((c) => {
    if (c.matches !== needle.length) return false;
    // Extra safety: if client name has 1 word, require the lead to fully contain it as a token
    if (needle.length === 1 && needle[0].length < 6) return false;
    return true;
  });
  candidates.sort((a, b) => {
    const ap = (a.lead.estado === "cerrado" || a.lead.estado === "adentro_seguimiento") ? 1 : 0;
    const bp = (b.lead.estado === "cerrado" || b.lead.estado === "adentro_seguimiento") ? 1 : 0;
    return bp - ap;
  });
  return candidates[0]?.lead || null;
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sb = createServerClient();
  // Inspect clients table
  const { data: sample, error: sampleErr } = await sb.from("clients").select("*").limit(1);
  if (sampleErr) return NextResponse.json({ error: `clients table: ${sampleErr.message}` }, { status: 500 });

  const schemaKeys = sample?.[0] ? Object.keys(sample[0]) : [];

  const results: unknown[] = [];
  let created = 0, updated = 0, linked = 0, skipped = 0, errors = 0;

  for (const c of CLIENTS) {
    try {
      // Find lead match
      const match = await findLeadMatch(sb, c.nombre);

      // Check if client already exists by nombre (fuzzy) or by lead_id
      let existing: { id: string } | null = null;
      const needle = norm(c.nombre);
      const { data: all } = await sb.from("clients").select("id, nombre, lead_id").range(0, 4999);
      existing = (all || []).find((cl) =>
        norm(cl.nombre || "") === needle ||
        (match?.id && cl.lead_id === match.id)
      ) as { id: string } | null;

      const base: Record<string, unknown> = {
        nombre: c.nombre,
        programa: c.programa,
        estado: "activo",
      };
      if (match?.id && schemaKeys.includes("lead_id")) base.lead_id = match.id;
      if (match?.email && schemaKeys.includes("email")) base.email = match.email;

      if (existing) {
        await sb.from("clients").update(base).eq("id", existing.id);
        updated++;
        if (match?.id) linked++;
        results.push({ action: "updated", nombre: c.nombre, matched_lead: match?.nombre || null, matched_lead_id: match?.id || null });
      } else {
        const { error } = await sb.from("clients").insert(base);
        if (error) { errors++; results.push({ error: error.message, nombre: c.nombre }); continue; }
        created++;
        if (match?.id) linked++;
        results.push({ action: "created", nombre: c.nombre, matched_lead: match?.nombre || null, matched_lead_id: match?.id || null });
      }
    } catch (err) {
      errors++;
      results.push({ error: err instanceof Error ? err.message : String(err), nombre: c.nombre });
    }
  }

  return NextResponse.json({
    total: CLIENTS.length,
    created,
    updated,
    linked_to_lead: linked,
    skipped,
    errors,
    schema_keys: schemaKeys,
    results,
  });
}

// GET returns current clients (for debugging)
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get("s") !== SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const sb = createServerClient();
  const { data } = await sb.from("clients").select("*").order("nombre");
  return NextResponse.json({ count: data?.length || 0, clients: data });
}
