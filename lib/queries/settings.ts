import { createServerClient } from "@/lib/supabase-server";

const SYSTEM_NAME = "__SYSTEM_CONFIG__";

export async function getSettings(): Promise<Record<string, unknown>> {
  const sb = createServerClient();
  const { data } = await sb.from("team_members").select("observaciones").eq("nombre", SYSTEM_NAME).maybeSingle();
  if (!data?.observaciones) return {};
  try { return JSON.parse(data.observaciones); } catch { return {}; }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const sb = createServerClient();
  const current = await getSettings();
  current[key] = value;
  await sb.from("team_members").update({ observaciones: JSON.stringify(current) }).eq("nombre", SYSTEM_NAME);
}

export async function getUsdRate(): Promise<number> {
  const s = await getSettings();
  const n = Number(s.usd_ars_rate);
  return Number.isFinite(n) && n > 0 ? n : 1250;
}
