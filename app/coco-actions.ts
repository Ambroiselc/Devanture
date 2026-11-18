"use server";
// Actions de la page « Coco » (30/10) : pilote automatique (marche / pause), consignes, et les e-mails qu'elle a
// gardés pour Broise (valider quand même, ou rejeter). La correction d'un texte se fait sur la page Valérie.
// La RLS vérifie que la personne est administratrice ; la base refuse de valider un e-mail vers une adresse en opposition.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { METIERS } from "@/agents/lib/metiers";

const UUID = /^[0-9a-f-]{36}$/i;

export async function saveCocoSettings(formData: FormData) {
  if (!isSupabaseConfigured) redirect("/coco?info=demo");
  const consignes = String(formData.get("consignes") ?? "").trim().slice(0, 1500) || null;
  const supabase = await createClient();
  const { error } = await supabase.from("agent_settings")
    .update({ enabled: formData.get("pilote") === "on", instructions: consignes }).eq("agent", "coco");
  if (error) redirect("/coco?erreur=echec");
  revalidatePath("/", "layout");
  redirect("/coco?info=enregistre");
}

/**
 * Un e-mail gardé par Coco (30/10) : Broise choisit, et le problème part chez le bon agent.
 *   valider  → il part dans le quota, comme les autres ;
 *   reecrire → Valérie en rédige un autre, avec la remarque de Coco (notée « [Coco] … » dans les notes du prospect) ;
 *   refaire  → Sid refait la maquette (avec le bon métier si Broise l'a choisi), puis Valérie écrit un nouvel e-mail ;
 *   ecarter  → l'artisan n'est pas une cible : il est écarté, plus aucun e-mail ;
 *   rejeter  → l'e-mail est simplement supprimé (Valérie en rédigera un autre).
 */
export async function deciderEmailGarde(formData: FormData) {
  if (!isSupabaseConfigured) redirect("/coco?info=demo");
  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "");
  if (!UUID.test(id)) redirect("/coco?erreur=invalide");
  const supabase = await createClient();

  if (action === "valider") {
    const { error } = await supabase.from("emails").update({ status: "valide" }).eq("id", id).eq("status", "a_valider");
    if (error) redirect(`/coco?erreur=${/opposition/i.test(error.message) ? "oppose" : "echec"}`);
    revalidatePath("/", "layout");
    redirect("/coco?info=valide");
  }

  const { data: e } = await supabase.from("emails").select("prospect_id, coco_avis, prospects(notes)").eq("id", id).maybeSingle();
  if (!e) redirect("/coco?erreur=echec");
  const prospectId = e.prospect_id as string;

  if (action === "reecrire" && e.coco_avis) {
    const notes = ((e.prospects as unknown as { notes: string | null } | null)?.notes ?? "").trim();
    const ligne = `[Coco] ${String(e.coco_avis).replace(/\s+/g, " ").slice(0, 300)}`;
    await supabase.from("prospects").update({ notes: notes ? `${notes}\n${ligne}` : ligne }).eq("id", prospectId);
  }
  if (action === "refaire") {
    const metier = String(formData.get("metier") ?? "");
    const libelles = METIERS.map((m) => m.label);
    const { error } = await supabase.from("prospects")
      .update({ status: "qualifie", ...(libelles.includes(metier) ? { category: metier } : {}) }).eq("id", prospectId);
    if (error) redirect("/coco?erreur=echec");
    await supabase.from("websites").update({ status: "archive" }).eq("prospect_id", prospectId).eq("kind", "demo").neq("status", "archive");
  }
  if (action === "ecarter") {
    const { error } = await supabase.from("prospects").update({ status: "ecarte" }).eq("id", prospectId);
    if (error) redirect("/coco?erreur=echec");
  }
  const { error } = await supabase.from("emails").delete().eq("id", id).eq("status", "a_valider");
  if (error) redirect("/coco?erreur=echec");
  revalidatePath("/", "layout");
  redirect(`/coco?info=${["reecrire", "refaire", "ecarter"].includes(action) ? action : "rejete"}`);
}

/** Lance Coco tout de suite (workflow agent-coco.yml) : relecture de tous les e-mails en attente, puis bilan. */
export async function lancerCoco(formData: FormData) {
  if (!isSupabaseConfigured) redirect("/coco?info=demo");
  const access = await getAccess();
  if (!access?.isAdmin) redirect("/coco?erreur=acces");
  const token = process.env.GITHUB_ACTIONS_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY_DEVANTURE || "Ambroiselc/Devanture";
  if (!token) redirect("/coco?erreur=cle");

  const supabase = await createClient();
  const { data } = await supabase.from("tasks").select("id").eq("agent", "coco").eq("status", "en_cours").limit(1);
  if (data?.length) redirect("/coco?erreur=occupe");

  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/agent-coco.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "devanture-tableau-de-bord",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs: { relire: "300", revoir_gardes: formData.get("revoir") === "1" ? "true" : "false" } }),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("GitHub a refusé le lancement :", res.status, await res.text());
    redirect("/coco?erreur=github");
  }
  revalidatePath("/", "layout");
  redirect(`/coco?info=lance&depuis=${Date.now()}`);
}
