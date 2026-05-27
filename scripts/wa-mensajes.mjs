import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const envFile = readFileSync(".env.production.tmp", "utf8");
const env = Object.fromEntries(
  envFile
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const [k, ...v] = l.split("=");
      return [k.trim(), v.join("=").trim().replace(/^"/, "").replace(/"$/, "").replace(/\\n$/, "")];
    })
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const fmt = (n) => "$" + Number(n || 0).toLocaleString("es-AR");
const fechaCorta = (d) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}`;
};

function weekOf(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDate();
  const weekNum = Math.ceil(day / 7);
  return {
    key: String(weekNum),
    label: `Semana ${weekNum}`,
  };
}

function groupByWeek(rows, dateField) {
  const map = new Map();
  rows.forEach((r) => {
    const dStr = r[dateField];
    if (!dStr) return;
    const w = weekOf(dStr);
    if (!map.has(w.key)) map.set(w.key, { label: w.label, items: [] });
    map.get(w.key).items.push(r);
  });
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => v);
}

function renderMsg(titulo, weeks, dateField) {
  if (!weeks.length) return `*${titulo}*\n\n(sin registros)\n`;
  let out = `*${titulo}*\n`;
  let totalGral = 0;
  let countGral = 0;
  weeks.forEach((w) => {
    out += `\n📅 _${w.label}_\n`;
    let totalSem = 0;
    w.items
      .sort((a, b) => (a[dateField] || "").localeCompare(b[dateField] || ""))
      .forEach((r) => {
        const monto = Number(r.monto_usd || 0);
        totalSem += monto;
        const nombre = r.leads?.nombre || r.clients?.nombre || "(s/n)";
        const cuota = `c${r.numero_cuota}`;
        out += `• ${fechaCorta(r[dateField])} — ${nombre} ${cuota} ${fmt(monto)}\n`;
      });
    out += `_Subtotal: ${fmt(totalSem)} (${w.items.length})_\n`;
    totalGral += totalSem;
    countGral += w.items.length;
  });
  out += `\n*TOTAL: ${fmt(totalGral)} — ${countGral} cuotas*\n`;
  return out;
}

async function main() {
  const SELECT = "id, lead_id, numero_cuota, monto_usd, fecha_pago, fecha_vencimiento, estado, created_at, leads(nombre), clients(nombre)";

  const dupIds = [
    "066ee384-fd50-45da-aa11-253595a8b752",
    "6ef4cbb7-7d9a-4fb1-bca6-de539d24a857",
  ];

  // 1. INGRESARON EN CUOTAS EN ABRIL — c1 con fecha_pago en abril, y existe c2+
  const { data: c1Abr } = await sb
    .from("payments")
    .select(SELECT)
    .eq("numero_cuota", 1)
    .gte("fecha_pago", "2026-04-01")
    .lte("fecha_pago", "2026-04-30")
    .not("lead_id", "is", null);

  const c1AbrConCuotas = [];
  for (const c of c1Abr || []) {
    if (dupIds.includes(c.id)) continue;
    const { count } = await sb
      .from("payments")
      .select("*", { count: "exact", head: true })
      .eq("lead_id", c.lead_id)
      .gt("numero_cuota", 1);
    if (count > 0) c1AbrConCuotas.push(c);
  }
  const msg1 = renderMsg(
    "INGRESARON EN CUOTAS EN ABRIL 2026",
    groupByWeek(c1AbrConCuotas, "fecha_pago"),
    "fecha_pago"
  );

  // 2. DEBIERON PAGAR EN MAYO — fecha_vencimiento en mayo 2026, todas las cuotas
  const { data: venceMay } = await sb
    .from("payments")
    .select(SELECT)
    .gte("fecha_vencimiento", "2026-05-01")
    .lte("fecha_vencimiento", "2026-05-31");

  const venceMayClean = (venceMay || []).filter((r) => !dupIds.includes(r.id));
  const msg2 = renderMsg(
    "DEBÍAN PAGAR EN MAYO 2026 (vencimiento)",
    groupByWeek(venceMayClean, "fecha_vencimiento"),
    "fecha_vencimiento"
  );

  // 3. INGRESARON EN CUOTAS EN MAYO — c1 con fecha_pago en mayo, y existe c2+
  const { data: c1May } = await sb
    .from("payments")
    .select(SELECT)
    .eq("numero_cuota", 1)
    .gte("fecha_pago", "2026-05-01")
    .lte("fecha_pago", "2026-05-31")
    .not("lead_id", "is", null);

  const c1MayConCuotas = [];
  for (const c of c1May || []) {
    if (dupIds.includes(c.id)) continue;
    const { count } = await sb
      .from("payments")
      .select("*", { count: "exact", head: true })
      .eq("lead_id", c.lead_id)
      .gt("numero_cuota", 1);
    if (count > 0) c1MayConCuotas.push(c);
  }
  const msg3 = renderMsg(
    "INGRESARON EN CUOTAS EN MAYO 2026",
    groupByWeek(c1MayConCuotas, "fecha_pago"),
    "fecha_pago"
  );

  // 4. DEBEN PAGAR EN JUNIO — fecha_vencimiento en junio 2026
  const { data: venceJun } = await sb
    .from("payments")
    .select(SELECT)
    .gte("fecha_vencimiento", "2026-06-01")
    .lte("fecha_vencimiento", "2026-06-30");

  const venceJunClean = (venceJun || []).filter((r) => !dupIds.includes(r.id));
  const msg4 = renderMsg(
    "DEBEN PAGAR EN JUNIO 2026 (vencimiento)",
    groupByWeek(venceJunClean, "fecha_vencimiento"),
    "fecha_vencimiento"
  );

  const SEP = "\n\n" + "═".repeat(40) + "\n\n";
  console.log(msg1 + SEP + msg2 + SEP + msg3 + SEP + msg4);
}

main().catch((e) => {
  console.error("ERROR:", e);
  process.exit(1);
});
