"use server";
// Actions de la page « Loïc » : enregistrer ses réglages et le lancer.
// La RLS de Supabase vérifie de son côté que la personne est bien administratrice.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CODES_COMMUNES, METIERS } from "@/agents/lib/metiers";
import { getAccess, getLoicSettings, loadDashboardData } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const metierIds = METIERS.map((m) => m.id);

const entier = (formData: FormData, nom: string, min: number, max: number) => {
  const v = Number.parseInt(String(formData.get(nom) ?? ""), 10);
  return Number.isFinite(v) && v >= min && v <= max ? v : null;
};

/** Enregistre les réglages de Loïc (nom, pause, automatique, plafonds, seuils, consignes). */
export async function saveLoicSettings(formData: FormData) {
  if (!isSupabaseConfigured) redirect("/loic?info=demo&vers=reglages");

  const nom = String(formData.get("nom") ?? "").trim().slice(0, 40);
  const metiers = formData.getAll("metiers").map(String).filter((m) => metierIds.includes(m));
  const communes = formData.getAll("communes").map(String).filter((c) => CODES_COMMUNES.includes(c));
  const limite = entier(formData, "limite", 5, 100);
  const googleJour = entier(formData, "google_jour", 0, 200);
  const googleMois = entier(formData, "google_mois", 0, 900);
  const qualifie = entier(formData, "score_qualifie", 0, 100);
  const ecarte = entier(formData, "score_ecarte", 0, 100);
  const consignes = String(formData.get("consignes") ?? "").trim().slice(0, 1500) || null;

  if (!nom || limite === null || googleJour === null || googleMois === null || qualifie === null || ecarte === null) {
    redirect("/loic?erreur=invalide&vers=reglages");
  }
  if (limite !== null && limite % 5 !== 0) redirect("/loic?erreur=cinq&vers=reglages");
  if (ecarte > qualifie) redirect("/loic?erreur=seuils&vers=reglages");
  if (metiers.length === 0) redirect("/loic?erreur=metiers&vers=reglages");
  if (communes.length === 0) redirect("/loic?erreur=communes&vers=reglages");

  const supabase = await createClient();
  const { error } = await supabase
    .from("agent_settings")
    .update({
      display_name: nom,
      enabled: formData.get("actif") === "on",
      auto_enabled: formData.get("auto") === "on",
      metiers,
      // Toutes cochées = null (les communes ajoutées plus tard seront incluses d'office).
      communes: communes.length === CODES_COMMUNES.length ? null : communes,
      default_limit: limite,
      max_google_day: googleJour,
      max_google_month: googleMois,
      score_qualified: qualifie,
      score_discarded: ecarte,
      instructions: consignes,
    })
    .eq("agent", "prospection");
  if (error) redirect("/loic?erreur=echec&vers=reglages");

  revalidatePath("/", "layout");
  redirect("/loic?info=enregistre&vers=reglages");
}

/**
 * Lance Loïc tout de suite : demande à GitHub de démarrer le workflow « agent-prospection.yml ».
 * Il faut une clé GitHub (GITHUB_ACTIONS_TOKEN) limitée au dépôt Devanture, droit « Actions : lecture et écriture ».
 */
export async function launchLoic(formData: FormData) {
  if (!isSupabaseConfigured) redirect("/loic?info=demo");
  const access = await getAccess();
  if (!access?.isAdmin) redirect("/loic?erreur=acces");

  const token = process.env.GITHUB_ACTIONS_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY_DEVANTURE || "Ambroiselc/Devanture";
  if (!token) redirect("/loic?erreur=cle");

  const { settings } = await getLoicSettings();
  if (!settings.enabled) redirect("/loic?erreur=pause");

  const result = await loadDashboardData();
  if (result.mode === "supabase" && result.data.tasks.some((t) => t.agent === "prospection" && t.status === "en_cours")) {
    redirect("/loic?erreur=occupe");
  }

  // « Lancer » : un métier dans une commune. « Tournée » : Loïc choisit lui-même 5 métiers.
  const tournee = formData.get("mode") === "tournee";
  const rge = formData.get("mode") === "rge";
  const metier = String(formData.get("metier") ?? "");
  const commune = String(formData.get("commune") ?? "");
  const limite = entier(formData, "limite", 5, 100);
  if (!metierIds.includes(metier) || !CODES_COMMUNES.includes(commune) || limite === null) {
    redirect("/loic?erreur=invalide");
  }
  if (limite % 5 !== 0) redirect("/loic?erreur=cinq");

  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/agent-prospection.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      // Obligatoire pour GitHub ; sur Cloudflare, fetch n'en ajoute pas tout seul (sinon : refus 403).
      "User-Agent": "devanture-tableau-de-bord",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs: { metier, limite: String(limite), commune, tournee: String(tournee), rge: String(rge) } }),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("GitHub a refusé le lancement :", res.status, await res.text());
    redirect(`/loic?erreur=github&code=${res.status}`);
  }

  revalidatePath("/", "layout");
  redirect(`/loic?info=lance&depuis=${Date.now()}`);
}
