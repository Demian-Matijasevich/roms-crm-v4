import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase-server";
import OnboardingForm from "./OnboardingForm";
import type { Client } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Fetch active clients without onboarding date for the dropdown
  const supabase = createServerClient();
  const { data: clients } = await supabase
    .from("clients")
    .select("id, nombre, programa, lead_id")
    .is("fecha_onboarding", null)
    .eq("estado", "activo")
    .order("nombre");

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-white">Formulario de Onboarding</h1>
      <p className="text-[var(--muted)]">Completar datos del alumno al ingresar al programa.</p>
      <OnboardingForm
        clients={(clients ?? []) as Pick<Client, "id" | "nombre" | "programa" | "lead_id">[]}
      />
    </div>
  );
}
