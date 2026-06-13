/**
 * Resync masivo desde iClosed API → ROMS CRM
 *
 * Lee /v1/eventCalls (todas las páginas), matchea con leads del CRM por email,
 * y asigna closer_id correcto. Crea los leads que faltan.
 *
 * Uso:
 *   node scripts/iclosed-resync.mjs --dry-run   (solo reporta, no toca BD)
 *   node scripts/iclosed-resync.mjs --apply     (aplica cambios)
 */
import { createClient } from "@supabase/supabase-js";

const ICLOSED_TOKEN = "iclosed_aa34998e737c94c3228aa07a7c591bc0";
const ICLOSED_BASE = "https://public.api.iclosed.io/v1";
const SUPABASE_URL = "https://ureszjvnqgqozbedngxy.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVyZXN6anZucWdxb3piZWRuZ3h5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTczOTU4MiwiZXhwIjoyMDkxMzE1NTgyfQ.0JqXWTEWhO3kCdnDD16OKRXYhfCJLU1RAw_wSCWxoaA";

const APPLY = process.argv.includes("--apply");
const DRY = !APPLY;

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// Mapeo iClosed userId → team_members.id (closer en CRM)
// Sacado de GET /v1/users + Supabase team_members
const ICLOSED_TO_TEAM = {
  31524: "3f3d78a8-7061-4e70-a085-043119344d7f", // Agustin Olivero
  31525: "3e56c8d0-1eb9-45d1-9fb2-5f36caee431f", // Federico Kohen → Fede
  32163: "209839f4-5aca-4e74-a596-e2300f605bae", // juan martin blanco (cuenta 2)
  31526: "209839f4-5aca-4e74-a596-e2300f605bae", // Juan Martin Blanco (cuenta 1)
  35139: "b1d54eb6-9698-4a91-973a-cdd097b8b876", // Matias Coria → Mati
  31522: "48a85840-ce3b-46c6-bfdc-92f26b8eeb2a", // Roms → Juanma
  31527: "1fa97581-745d-4097-bf2d-84a0650ccd63", // Valentino Granata
  // Sin mapeo (no son closers nuestros o no relevantes):
  // 31815 Matias Ortuño (superadmin externo)
  // 33619 Tomas Yafe Mola
};

async function fetchAllCalls() {
  const all = [];
  let page = 0; // iClosed pagina 0-indexed; page=0 son las MÁS RECIENTES
  while (true) {
    const r = await fetch(`${ICLOSED_BASE}/eventCalls?limit=100&page=${page}`, {
      headers: { Authorization: `Bearer ${ICLOSED_TOKEN}`, Accept: "application/json" },
    });
    if (!r.ok) throw new Error(`iClosed page ${page}: HTTP ${r.status}`);
    const j = await r.json();
    const calls = j?.data?.eventCalls || [];
    all.push(...calls);
    console.log(`  page ${page}: ${calls.length} calls (total acum ${all.length}/${j?.data?.count})`);
    if (calls.length < 100) break;
    page++;
    if (page > 15) break; // safety
  }
  return all;
}

function normPhone(p) {
  if (!p) return null;
  return String(p).replace(/\D/g, "").replace(/^0+/, "");
}

function normEmail(e) {
  return String(e || "").trim().toLowerCase();
}

async function main() {
  console.log(`\n🔄 iClosed resync — modo: ${APPLY ? "APPLY (escribe)" : "DRY-RUN (solo reporta)"}\n`);

  // 1. Pull todas las calls
  console.log("⬇️  Bajando eventCalls de iClosed…");
  const calls = await fetchAllCalls();
  console.log(`✓ Total calls bajadas: ${calls.length}\n`);

  // 2. Agrupar por inviteeEmail (último por dateTime gana)
  const byEmail = new Map();
  for (const c of calls) {
    const email = normEmail(c.inviteeEmail);
    if (!email) continue;
    const prev = byEmail.get(email);
    if (!prev || (c.dateTimeUTC || "") > (prev.dateTimeUTC || "")) {
      byEmail.set(email, c);
    }
  }
  console.log(`📧 Emails únicos: ${byEmail.size}\n`);

  // 3. Traer todos los leads del CRM (índice por email Y por teléfono)
  console.log("⬇️  Bajando leads del CRM…");
  const leadsByEmail = new Map();
  const leadsByPhone = new Map();
  {
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await sb.from("leads").select("id, email, telefono, nombre, closer_id").range(from, from + PAGE - 1);
      if (error) throw error;
      for (const l of data || []) {
        if (l.email) leadsByEmail.set(normEmail(l.email), l);
        const p = normPhone(l.telefono);
        if (p && p.length >= 8) leadsByPhone.set(p, l);
      }
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
  }
  console.log(`✓ Leads en CRM: ${leadsByEmail.size} por email, ${leadsByPhone.size} por teléfono\n`);

  // 4. Reconciliar
  // Reglas del cliente:
  //   - NO reasignar (cambiar closer existente) — el closer puede haberlo movido manualmente
  //   - Solo asignar (NULL → closer) si fecha_agendado >= 2026-05-01 (mes pasado)
  //   - Crear los faltantes, dedupando contra email Y teléfono
  const CUTOFF = "2026-05-01";
  const stats = {
    sin_user_iclosed: 0,
    sin_mapeo: 0,
    ya_correcto: 0,
    a_asignar: 0,
    skip_reasignar: 0,
    skip_viejo: 0,
    a_crear: 0,
    skip_existe_por_tel: 0,
    update_ops: [],
    create_ops: [],
  };

  for (const [email, call] of byEmail) {
    const user = call.user;
    if (!user) { stats.sin_user_iclosed++; continue; }
    const teamId = ICLOSED_TO_TEAM[user.id];
    if (!teamId) { stats.sin_mapeo++; continue; }

    const phone = normPhone(call.phoneNumber);
    let lead = leadsByEmail.get(email);
    // si no matchea por email, intentar por teléfono (mismo lead con email distinto)
    if (!lead && phone && phone.length >= 8) lead = leadsByPhone.get(phone);

    if (lead) {
      if (lead.closer_id === teamId) {
        stats.ya_correcto++;
      } else if (lead.closer_id) {
        // ya tiene closer asignado — NO reasignar (puede ser cambio manual)
        stats.skip_reasignar++;
      } else {
        // closer_id NULL — solo asignar si la fecha es de mayo en adelante
        const fecha = (call.dateTimeUTC || "").slice(0, 10);
        if (fecha && fecha >= CUTOFF) {
          stats.a_asignar++;
          stats.update_ops.push({
            id: lead.id, email, nombre: lead.nombre, to: teamId,
            host: `${user.firstName} ${user.lastName}`, fecha
          });
        } else {
          stats.skip_viejo++;
        }
      }
    } else {
      // No existe — verificar con teléfono otra vez (defensive) y crear
      if (phone && phone.length >= 8 && leadsByPhone.has(phone)) {
        stats.skip_existe_por_tel++;
        continue;
      }
      // solo crear si la call es del mes pasado en adelante (no resucitar viejas)
      const fecha = (call.dateTimeUTC || "").slice(0, 10);
      if (fecha && fecha < CUTOFF) { stats.skip_viejo++; continue; }
      stats.a_crear++;
      stats.create_ops.push({
        email,
        nombre: call.inviteeName?.trim() || null,
        telefono: call.phoneNumber || null,
        fecha_agendado: call.dateTimeUTC,
        closer_id: teamId,
        host: `${user.firstName} ${user.lastName}`,
        utm: (call.utm || []).reduce((acc, x) => { if (x.utmKey?.startsWith("utm_")) acc[x.utmKey] = x.utmValue; return acc; }, {}),
      });
    }
  }

  console.log("📊 Resumen:");
  console.log(`  • Calls sin user (iClosed):     ${stats.sin_user_iclosed}`);
  console.log(`  • Calls con user sin mapeo:     ${stats.sin_mapeo}`);
  console.log(`  • Ya asignados correctos:       ${stats.ya_correcto}`);
  console.log(`  • A asignar (closer NULL ≥mayo): ${stats.a_asignar}  ✏️`);
  console.log(`  • Skip reasignar (ya tiene):    ${stats.skip_reasignar}  ⏭️`);
  console.log(`  • Skip por viejo (<mayo):       ${stats.skip_viejo}  ⏭️`);
  console.log(`  • Skip existe por teléfono:     ${stats.skip_existe_por_tel}  ⏭️`);
  console.log(`  • A crear (no en CRM):          ${stats.a_crear}  ➕`);

  // Breakdown por closer
  const byCloser = {};
  for (const op of [...stats.update_ops, ...stats.create_ops]) {
    byCloser[op.host] = (byCloser[op.host] || 0) + 1;
  }
  console.log("\n👥 Cambios por host:");
  for (const [h, n] of Object.entries(byCloser).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${h}: ${n}`);
  }

  // Buscar Juan Difoury específico
  console.log("\n🔍 Juan Difoury:");
  for (const op of stats.create_ops) {
    if (op.nombre?.toLowerCase().includes("difou")) console.log(`  CREATE → ${op.email} | ${op.host} | ${op.fecha_agendado}`);
  }
  for (const op of stats.update_ops) {
    if (op.nombre?.toLowerCase().includes("difou")) console.log(`  UPDATE → ${op.email} | ${op.host}`);
  }

  if (DRY) {
    console.log("\n💡 Dry-run. Para aplicar: node scripts/iclosed-resync.mjs --apply\n");
    return;
  }

  console.log("\n🚀 Aplicando cambios…");

  // UPDATEs en chunks
  let updOk = 0, updErr = 0;
  for (const op of stats.update_ops) {
    const { error } = await sb.from("leads").update({ closer_id: op.to }).eq("id", op.id);
    if (error) { updErr++; console.error(`  err UPDATE ${op.email}: ${error.message}`); }
    else updOk++;
  }
  console.log(`  Updates: ${updOk} ok / ${updErr} err`);

  // CREATES
  let crOk = 0, crErr = 0;
  for (const op of stats.create_ops) {
    const payload = {
      nombre: op.nombre,
      email: op.email,
      telefono: op.telefono,
      fecha_agendado: op.fecha_agendado,
      closer_id: op.closer_id,
      estado: "pendiente",
      nicho: "general",
      fuente: (op.utm.utm_source || "").toLowerCase() === "inbound" ? "instagram" : "otro",
      utm_source: op.utm.utm_source || null,
      utm_medium: op.utm.utm_medium || null,
      utm_content: op.utm.utm_content || null,
      notas_internas: `[iClosed resync ${new Date().toISOString().slice(0, 10)}]`,
    };
    const { error } = await sb.from("leads").insert(payload);
    if (error) { crErr++; console.error(`  err CREATE ${op.email}: ${error.message}`); }
    else crOk++;
  }
  console.log(`  Creates: ${crOk} ok / ${crErr} err`);

  console.log("\n✓ Done.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
