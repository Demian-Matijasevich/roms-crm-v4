import { createServerClient } from "@/lib/supabase-server";
import type { TeamMember } from "@/lib/types";

export interface PaymentMethod {
  id: string;
  nombre: string;
  titular: string | null;
  tipo_moneda: "ars" | "usd";
  cbu: string | null;
  alias_cbu: string | null;
  banco: string | null;
  id_cuenta: string | null;
  observaciones: string | null;
}

export async function fetchTeamMembers(): Promise<TeamMember[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("team_members")
    .select("*")
    .order("nombre");

  if (error) throw error;
  return (data ?? []) as TeamMember[];
}

export async function updateTeamMember(
  id: string,
  updates: Partial<
    Pick<
      TeamMember,
      "nombre" | "rol" | "is_admin" | "is_closer" | "is_setter" | "is_cobranzas" | "is_seguimiento" | "pin" | "comision_pct" | "activo"
    >
  >
): Promise<TeamMember> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("team_members")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as TeamMember;
}

export async function fetchPaymentMethods(): Promise<PaymentMethod[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("payment_methods")
    .select("*")
    .order("nombre");

  if (error) throw error;
  return (data ?? []) as PaymentMethod[];
}

export async function createPaymentMethod(
  method: Omit<PaymentMethod, "id">
): Promise<PaymentMethod> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("payment_methods")
    .insert(method)
    .select()
    .single();

  if (error) throw error;
  return data as PaymentMethod;
}

export async function updatePaymentMethod(
  id: string,
  updates: Partial<Omit<PaymentMethod, "id">>
): Promise<PaymentMethod> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("payment_methods")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as PaymentMethod;
}
