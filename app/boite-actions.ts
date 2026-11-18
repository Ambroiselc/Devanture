"use server";
// Actions de la page « Boîte mail » : réglages d'Inès, relevé du courrier, validation des réponses,
// réponse écrite par Broise, et « marquer comme traité ».
// La RLS de Supabase vérifie que la personne est administratrice ; la base refuse aussi de valider
// une réponse vers une adresse de la liste d'opposition.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { objetReponse } from "@/agents/lib/boite";
import { getAccess, getBoiteSettings } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const UUID = /^[0-9a-f-]{36}$/i;

/** Demande à GitHub de lancer Inès (workflow agent-boite.yml). Renvoie false si impossible. */
async function reveillerInes(): Promise<boolean> {
  const token = process.env.GITHUB_ACTIONS_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY_DEVANTURE || "Ambroiselc/Devanture";
  if (!token) return false;
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/agent-boite.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      // Obligatoire pour GitHub ; sur Cloudflare, fetch n'en ajoute pas tout seul (sinon : refus 403).
      "User-Agent": "devanture-tableau-de-bord",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
    cache: "no-store",
  });
  if (!res.ok) console.error("GitHub a refusé le lancement d'Inès :", res.status, await res.text());
  return res.ok;
}

export async function saveBoiteSettings(formData: FormData) {
  if (!isSupabaseConfigured) redirect("/ines?info=demo&vers=reglages");
  const nom = String(formData.get("nom") ?? "").trim().slice(0, 40);
  const signature = String(formData.get("signature") ?? "").replace(/\r/g, "").trim().slice(0, 500);
  const consignes = String(formData.get("consignes") ?? "").trim().slice(0, 1500) || null;
  const maxAuto = Number.parseInt(String(formData.get("max_auto") ?? ""), 10);
  if (!nom || !signature || !Number.isFinite(maxAuto) || maxAuto < 0 || maxAuto > 50) redirect("/ines?erreur=invalide&vers=reglages");

  // Contacts de chauffe (3/11) : une adresse par ligne (ou séparées par des virgules), 30 au plus.
  const chauffe = [...new Set(String(formData.get("chauffe") ?? "").toLowerCase().split(/[\s,;]+/)
    .map((a) => a.trim()).filter((a) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(a)))].slice(0, 30);

  const supabase = await createClient();
  const reglages = {
    display_name: nom, enabled: formData.get("actif") === "on", signature, instructions: consignes,
    auto_reply_enabled: formData.get("auto") === "on", auto_reply_max_per_day: maxAuto,
  };
  let { error } = await supabase.from("agent_settings").update({ ...reglages, contacts_chauffe: chauffe }).eq("agent", "boite");
  // Migration 20261103000000_contacts_chauffe.sql pas encore appliquée : on enregistre le reste.
  if (error?.code === "42703" || /contacts_chauffe/.test(error?.message ?? "")) {
    ({ error } = await supabase.from("agent_settings").update(reglages).eq("agent", "boite"));
  }
  if (error) redirect("/ines?erreur=echec&vers=reglages");
  revalidatePath("/", "layout");
  redirect("/ines?info=enregistre&vers=reglages");
}

/** Bouton « Relever le courrier » : lance Inès tout de suite. */
export async function launchBoite() {
  if (!isSupabaseConfigured) redirect("/ines?info=demo");
  const access = await getAccess();
  if (!access?.isAdmin) redirect("/ines?erreur=acces");
  if (!process.env.GITHUB_ACTIONS_TOKEN) redirect("/ines?erreur=cle");
  const { settings, ready } = await getBoiteSettings();
  if (!ready) redirect("/ines?erreur=migration");
  if (!settings.enabled) redirect("/ines?erreur=pause");
  if (!(await reveillerInes())) redirect("/ines?erreur=github");
  revalidatePath("/", "layout");
  redirect(`/ines?info=lance&depuis=${Date.now()}`);
}

/**
 * Relecture d'une réponse préparée par Inès. Le bouton cliqué décide :
 * « valider » (enregistre et envoie au prochain passage, réveillé tout de suite), « enregistrer », « rejeter ».
 */
export async function reviewReply(formData: FormData) {
  if (!isSupabaseConfigured) redirect("/ines?info=demo");
  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "");
  if (!UUID.test(id)) redirect("/ines?erreur=invalide");
  const supabase = await createClient();
  const ancre = `&vers=reponse-${id}`;

  if (action === "rejeter") {
    const { error } = await supabase.from("mailbox_messages").update({ status: "rejete" })
      .eq("id", id).eq("direction", "sortant").in("status", ["a_valider", "valide", "erreur"]);
    if (error) redirect("/ines?erreur=echec");
    revalidatePath("/", "layout");
    redirect("/ines?info=rejete");
  }

  const subject = String(formData.get("subject") ?? "").replace(/\s+/g, " ").trim().slice(0, 150);
  const body = String(formData.get("body") ?? "").replace(/\r/g, "").trim().slice(0, 10_000);
  if (!subject || body.length < 10) redirect(`/ines?erreur=vide${ancre}`);

  const valider = action === "valider";
  if (valider && body.includes("[LIEN DE LA MAQUETTE]")) redirect(`/ines?erreur=lien${ancre}`);
  const { error } = await supabase.from("mailbox_messages")
    .update({ subject, body_text: body, ...(valider ? { status: "valide", sent_by: "broise", error_message: null } : {}) })
    .eq("id", id).eq("direction", "sortant").in("status", ["a_valider", "valide", "erreur"]);
  if (error) redirect(`/ines?erreur=${/opposition/i.test(error.message) ? "oppose" : "echec"}${ancre}`);

  const reveillee = valider && (await reveillerInes());
  revalidatePath("/", "layout");
  redirect(`/ines?info=${valider ? (reveillee ? "valide_part" : "valide") : "corrige"}${valider ? "" : ancre}`);
}

/** Réponse écrite par Broise à un message reçu (ou à une conversation). Part au prochain passage d'Inès. */
export async function writeReply(formData: FormData) {
  // Retour sur la conversation ouverte (« /boite?m=<id> »), sur la boîte ou sur la page d'Inès.
  const retour = String(formData.get("retour") ?? "");
  const base = /^\/(boite(\?m=[0-9a-f-]{36})?|ines)$/i.test(retour) ? retour : "/boite";
  const vers = (info: string) => `${base}${base.includes("?") ? "&" : "?"}${info}`;
  if (!isSupabaseConfigured) redirect(vers("info=demo"));
  const recuId = String(formData.get("recu_id") ?? "");
  if (!UUID.test(recuId)) redirect(vers("erreur=invalide"));
  const body = String(formData.get("body") ?? "").replace(/\r/g, "").trim().slice(0, 10_000);
  if (body.length < 10) redirect(vers("erreur=vide"));

  const supabase = await createClient();
  const { data: recu, error: e1 } = await supabase.from("mailbox_messages")
    .select("id, thread_id, prospect_id, email_id, from_email, subject, category")
    .eq("id", recuId).eq("direction", "entrant").maybeSingle();
  if (e1 || !recu?.from_email) redirect(vers("erreur=echec"));

  const { error } = await supabase.from("mailbox_messages").insert({
    direction: "sortant", thread_id: recu.thread_id ?? recu.id, prospect_id: recu.prospect_id, email_id: recu.email_id,
    reply_to_id: recu.id, to_email: recu.from_email, subject: objetReponse(recu.subject), body_text: body,
    status: "valide", sent_by: "broise", category: recu.category,
  });
  if (error) redirect(vers(`erreur=${/opposition/i.test(error.message) ? "oppose" : "echec"}`));
  await supabase.from("mailbox_messages").update({ status: "traite" }).eq("id", recu.id).eq("status", "a_traiter");

  const reveillee = await reveillerInes();
  revalidatePath("/", "layout");
  redirect(vers(`info=${reveillee ? "valide_part" : "valide"}`));
}

/** Range un message reçu sans y répondre. */
export async function markHandled(formData: FormData) {
  if (!isSupabaseConfigured) redirect("/ines?info=demo");
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) redirect("/ines?erreur=invalide");
  const supabase = await createClient();
  const { error } = await supabase.from("mailbox_messages").update({ status: "traite" })
    .eq("id", id).eq("direction", "entrant");
  if (error) redirect("/ines?erreur=echec");
  revalidatePath("/", "layout");
  redirect("/ines?info=range");
}
