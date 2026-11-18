"use server";
// Actions de la page « Valérie » : réglages, lancement, et relecture des e-mails (valider, corriger, rejeter).
// Rien n'est envoyé ici : « Validé » veut dire « prêt à partir » quand l'envoi sera branché.
// La RLS de Supabase vérifie de son côté que la personne est bien administratrice ;
// la base refuse aussi de valider un e-mail vers une adresse de la liste d'opposition.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccess, getValerieSettings, loadDashboardData } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const LIEN_DEMO = "{{lien_demo}}";
const UUID = /^[0-9a-f-]{36}$/i;

export async function saveValerieSettings(formData: FormData) {
  if (!isSupabaseConfigured) redirect("/valerie?info=demo&vers=reglages");

  const nom = String(formData.get("nom") ?? "").trim().slice(0, 40);
  const limite = Number.parseInt(String(formData.get("limite") ?? ""), 10);
  const signature = String(formData.get("signature") ?? "").replace(/\r/g, "").trim().slice(0, 500);
  const consignes = String(formData.get("consignes") ?? "").trim().slice(0, 1500) || null;
  const maxJour = Number.parseInt(String(formData.get("max_jour") ?? "50"), 10);
  if (!Number.isFinite(maxJour) || maxJour < 1 || maxJour > 300) redirect("/valerie?erreur=invalide&vers=reglages");
  if (!nom || !signature || !Number.isFinite(limite) || limite < 1 || limite > 30) redirect("/valerie?erreur=invalide&vers=reglages");

  const supabase = await createClient();
  const { error } = await supabase
    .from("agent_settings")
    .update({
      display_name: nom, enabled: formData.get("actif") === "on", default_limit: limite, signature, instructions: consignes,
      send_enabled: formData.get("envoi") === "on", send_max_per_day: maxJour,
    })
    .eq("agent", "email");
  if (error) redirect("/valerie?erreur=echec&vers=reglages");

  revalidatePath("/", "layout");
  redirect("/valerie?info=enregistre&vers=reglages");
}

/** Lance Valérie : workflow GitHub « agent-emails.yml » (même clé GitHub que Loïc et Sid). */
export async function launchValerie(formData: FormData) {
  if (!isSupabaseConfigured) redirect("/valerie?info=demo");
  const access = await getAccess();
  if (!access?.isAdmin) redirect("/valerie?erreur=acces");

  const token = process.env.GITHUB_ACTIONS_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY_DEVANTURE || "Ambroiselc/Devanture";
  if (!token) redirect("/valerie?erreur=cle");

  const { settings, ready } = await getValerieSettings();
  if (!ready) redirect("/valerie?erreur=migration");
  if (!settings.enabled) redirect("/valerie?erreur=pause");

  const limite = Number.parseInt(String(formData.get("limite") ?? ""), 10);
  if (!Number.isFinite(limite) || limite < 1 || limite > 30) redirect("/valerie?erreur=invalide");

  const result = await loadDashboardData();
  if (result.mode === "supabase" && result.data.tasks.some((t) => t.agent === "email" && t.status === "en_cours")) {
    redirect("/valerie?erreur=occupe");
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/agent-emails.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      // Obligatoire pour GitHub ; sur Cloudflare, fetch n'en ajoute pas tout seul (sinon : refus 403).
      "User-Agent": "devanture-tableau-de-bord",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs: { limite: String(limite) } }),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("GitHub a refusé le lancement :", res.status, await res.text());
    redirect("/valerie?erreur=github");
  }

  revalidatePath("/", "layout");
  redirect(`/valerie?info=lance&depuis=${Date.now()}`);
}

/**
 * Relecture d'un e-mail. Le bouton cliqué décide :
 * « valider » (enregistre les corrections et passe en « Validé »), « enregistrer » (corrections seulement),
 * « rejeter » (supprime le brouillon : Valérie pourra en rédiger un autre).
 */
export async function reviewEmail(formData: FormData) {
  if (!isSupabaseConfigured) redirect("/valerie?info=demo");
  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "");
  if (!UUID.test(id)) redirect("/valerie?erreur=invalide");

  const supabase = await createClient();
  const ancre = `&vers=email-${id}`;

  if (action === "rejeter") {
    const { error } = await supabase.from("emails").delete().eq("id", id).in("status", ["brouillon", "a_valider", "valide"]);
    if (error) redirect(`/valerie?erreur=echec`);
    revalidatePath("/", "layout");
    redirect("/valerie?info=rejete");
  }

  const subject = String(formData.get("subject") ?? "").replace(/\s+/g, " ").trim().slice(0, 150);
  const body = String(formData.get("body") ?? "").replace(/\r/g, "").trim().slice(0, 5000);
  if (!subject || body.length < 40) redirect(`/valerie?erreur=vide${ancre}`);
  if (!body.includes(LIEN_DEMO)) redirect(`/valerie?erreur=lien${ancre}`);

  const valider = action === "valider";
  const { error } = await supabase
    .from("emails")
    .update({ subject, body, ...(valider ? { status: "valide" } : {}) })
    .eq("id", id)
    .in("status", ["brouillon", "a_valider", "valide"]);
  if (error) {
    redirect(`/valerie?erreur=${/opposition/i.test(error.message) ? "oppose" : "echec"}${ancre}`);
  }

  revalidatePath("/", "layout");
  redirect(`/valerie?info=${valider ? "valide" : "corrige"}${valider ? "" : ancre}`);
}

/**
 * Validation groupée : valide tous les e-mails « à valider », sauf ceux cochés « garder en relecture ».
 * Un par un : la base refuse un e-mail vers une adresse de la liste d'opposition, sans bloquer les autres.
 */
export async function validateAllExcept(formData: FormData) {
  if (!isSupabaseConfigured) redirect("/valerie?info=demo");
  const garder = new Set(formData.getAll("garder").map(String).filter((id) => UUID.test(id)));
  const supabase = await createClient();
  const { data, error } = await supabase.from("emails").select("id").eq("status", "a_valider");
  if (error) redirect("/valerie?erreur=echec");

  let valides = 0;
  let refuses = 0;
  for (const { id } of data ?? []) {
    if (garder.has(id)) continue;
    const { error: e } = await supabase.from("emails").update({ status: "valide" }).eq("id", id).eq("status", "a_valider");
    if (e) refuses++;
    else valides++;
  }
  revalidatePath("/", "layout");
  redirect(`/valerie?info=groupe&valides=${valides}&refuses=${refuses}&gardes=${garder.size}`);
}

/** Repasse un e-mail validé en « à valider » (pour le relire encore). */
export async function unvalidateEmail(formData: FormData) {
  if (!isSupabaseConfigured) redirect("/valerie?info=demo");
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) redirect("/valerie?erreur=invalide");
  const supabase = await createClient();
  const { error } = await supabase.from("emails").update({ status: "a_valider" }).eq("id", id).eq("status", "valide");
  if (error) redirect("/valerie?erreur=echec");
  revalidatePath("/", "layout");
  redirect(`/valerie?vers=email-${id}`);
}
