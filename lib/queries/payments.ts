import { createServerClient } from "@/lib/supabase-server";
import type { Payment } from "@/lib/types";

/**
 * Fetch all payments ordered by created_at desc.
 */
export async function fetchPayments(): Promise<Payment[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[fetchPayments]", error.message);
    return [];
  }
  return (data ?? []) as Payment[];
}

/**
 * Fetch payments for a specific lead.
 */
export async function fetchPaymentsByLead(leadId: string): Promise<Payment[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("lead_id", leadId)
    .order("numero_cuota", { ascending: true });

  if (error) {
    console.error("[fetchPaymentsByLead]", error.message);
    return [];
  }
  return (data ?? []) as Payment[];
}

/**
 * Fetch payments for a specific client.
 */
export async function fetchPaymentsByClient(clientId: string): Promise<Payment[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("client_id", clientId)
    .order("numero_cuota", { ascending: true });

  if (error) {
    console.error("[fetchPaymentsByClient]", error.message);
    return [];
  }
  return (data ?? []) as Payment[];
}

/**
 * Create a new payment. Returns the created payment.
 */
export async function createPayment(
  payment: Omit<Payment, "id" | "created_at">
): Promise<Payment | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("payments")
    .insert(payment)
    .select()
    .single();

  if (error) {
    console.error("[createPayment]", error.message);
    return null;
  }
  return data as Payment;
}

/**
 * Upload a comprobante file to Supabase Storage.
 * Returns the public URL.
 */
export async function uploadComprobante(
  file: File,
  leadId: string
): Promise<string | null> {
  const supabase = createServerClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `comprobantes/${leadId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("comprobantes")
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    console.error("[uploadComprobante]", error.message);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from("comprobantes")
    .getPublicUrl(path);

  return urlData.publicUrl;
}
