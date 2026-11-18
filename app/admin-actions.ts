"use server";
// Actions du tableau de bord qui modifient la base (liste d'opposition, budget).
// La RLS de Supabase vérifie de son côté que la personne est bien administratrice.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { OppositionReason } from "@/lib/types";

const reasons: OppositionReason[] = ["desinscription", "refus", "plainte", "adresse_invalide", "manuel"];

/** Ajoute une adresse (ou un domaine entier) à la liste d'opposition. */
export async function addOpposition(formData: FormData) {
  if (!isSupabaseConfigured) redirect("/opposition?info=demo");

  const raw = String(formData.get("cible") ?? "").trim().toLowerCase();
  const reasonInput = String(formData.get("raison") ?? "");
  const reason = reasons.includes(reasonInput as OppositionReason) ? reasonInput : "manuel";
  const businessName = String(formData.get("commerce") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  // « nom@domaine.fr » = une adresse ; « domaine.fr » ou « @domaine.fr » = tout le domaine.
  const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw);
  const domain = raw.replace(/^@/, "");
  const isDomain = !isEmail && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain);
  if (!isEmail && !isDomain) redirect("/opposition?erreur=format");

  const supabase = await createClient();
  const { error } = await supabase.from("opposition_list").insert({
    email: isEmail ? raw : null,
    domain: isDomain ? domain : null,
    business_name: businessName,
    reason,
    notes,
  });
  if (error) redirect(`/opposition?erreur=${error.code === "23505" ? "doublon" : "echec"}`);

  revalidatePath("/", "layout");
  redirect("/opposition?info=ajoute");
}

/** Change le budget mensuel des agents IA. */
export async function updateAiBudget(formData: FormData) {
  if (!isSupabaseConfigured) redirect("/?budget=demo&vers=budget");

  const budget = Number(String(formData.get("budget") ?? "").replace(",", "."));
  if (!Number.isFinite(budget) || budget < 0 || budget > 10000) redirect("/?budget=invalide&vers=budget");

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({ ai_monthly_budget_eur: Math.round(budget * 100) / 100 })
    .eq("id", true);
  if (error) redirect("/?budget=echec&vers=budget");

  revalidatePath("/", "layout");
  redirect("/?budget=ok&vers=budget");
}
