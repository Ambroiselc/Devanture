"use server";
// Actions de la page « Clients » : passer un prospect en client, puis faire avancer sa fiche.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccess } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { etapes, formules, paiements, type EtapeClient } from "@/lib/clients";
import { bienvenueComplete, OBJET_BIENVENUE } from "@/agents/lib/accueil";
import { infosLien } from "@/agents/lib/paiement";

async function verifier() {
  if (!isSupabaseConfigured) redirect("/clients?info=demo");
  const access = await getAccess();
  if (!access?.isAdmin) redirect("/clients?erreur=acces");
  return createClient();
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Fiche client + e-mail de bienvenue « à valider » dans la boîte mail (avec son lien d'accueil).
 * Même travail que la relève automatique des paiements (agents/paiements.ts), mais lancé à la main.
 */
async function nouveauClient(supabase: Supabase, prospect: string, formule: string, paiement: string, lancement: boolean,
  email?: string | null): Promise<{ id: string } | { erreur: string }> {
  // « 0 € de départ » : les 12 mois commencent à la commande (premier mois payé tout de suite, CGV du 29/10).
  const fin = new Date();
  fin.setFullYear(fin.getFullYear() + 1);
  const { data, error } = await supabase.from("clients").insert({
    prospect_id: prospect, formule, paiement, lancement,
    fin_engagement: paiement === "sans_frais" ? fin.toISOString().slice(0, 10) : null,
  }).select("id, jeton").single();
  if (error || !data) return { erreur: error?.code === "23505" ? "deja" : "echec" };

  const [{ data: p }, { data: reglages }] = await Promise.all([
    supabase.from("prospects").select("email").eq("id", prospect).single(),
    supabase.from("agent_settings").select("signature").eq("agent", "boite").maybeSingle(),
  ]);
  const destinataire = email || p?.email;
  if (destinataire && data.jeton) {
    const { data: m } = await supabase.from("mailbox_messages").insert({
      direction: "sortant", prospect_id: prospect, to_email: destinataire, subject: OBJET_BIENVENUE,
      body_text: bienvenueComplete(data.jeton, reglages?.signature), category: "client", status: "a_valider",
      review_reason: "Bienvenue du nouveau client : vérifie puis valide.", sent_by: "broise",
    }).select("id").single();
    if (m) await supabase.from("mailbox_messages").update({ thread_id: m.id }).eq("id", m.id);
  }
  return { id: data.id };
}

/** Un prospect a payé : on crée sa fiche client (la base le passe aussi en « client » côté prospects). */
export async function creerClient(formData: FormData) {
  const supabase = await verifier();
  const prospect = String(formData.get("prospect") ?? "");
  const formule = String(formData.get("formule") ?? "");
  const paiement = String(formData.get("paiement") ?? "");
  if (!prospect || !(formule in formules) || !(paiement in paiements)) redirect("/clients?erreur=invalide");

  const r = await nouveauClient(supabase, prospect, formule, paiement, formData.get("lancement") === "on");
  if ("erreur" in r) redirect(`/clients?erreur=${r.erreur}`);
  revalidatePath("/", "layout");
  redirect(`/clients?info=cree&vers=${r.id}`);
}

/** Paiement Stripe qu'on n'a pas su relier à un prospect : Broise choisit le prospect. */
export async function rattacherPaiement(formData: FormData) {
  const supabase = await verifier();
  const id = String(formData.get("paiement") ?? "");
  const prospect = String(formData.get("prospect") ?? "");
  if (!id || !prospect) redirect("/clients?erreur=invalide&vers=paiements");
  const { data: pay } = await supabase.from("paiements_stripe").select("cle, email, remise_cents").eq("id", id).single();
  const infos = infosLien(pay?.cle);
  if (!pay || !infos) redirect("/clients?erreur=invalide&vers=paiements");

  let clientId: string;
  const { data: existant } = await supabase.from("clients").select("id").eq("prospect_id", prospect).maybeSingle();
  if (existant) {
    clientId = existant.id;
    if (infos.type === "abonnement") await supabase.from("clients").update({ etape: "abonne" }).eq("id", clientId);
  } else if (infos.type === "commande") {
    const r = await nouveauClient(supabase, prospect, infos.formule, infos.paiement, infos.lancement || pay.remise_cents > 0, pay.email);
    if ("erreur" in r) redirect(`/clients?erreur=${r.erreur}&vers=paiements`);
    clientId = r.id;
  } else {
    redirect("/clients?erreur=abonnement&vers=paiements");
  }
  const { error } = await supabase.from("paiements_stripe").update({ client_id: clientId, statut: "rattache" }).eq("id", id);
  if (error) redirect("/clients?erreur=echec&vers=paiements");
  revalidatePath("/", "layout");
  redirect(`/clients?info=rattache&vers=${clientId}`);
}

/** Paiement à ne pas suivre (test, doublon remboursé…). */
export async function ignorerPaiement(formData: FormData) {
  const supabase = await verifier();
  const id = String(formData.get("paiement") ?? "");
  if (!id) redirect("/clients?erreur=invalide");
  await supabase.from("paiements_stripe").update({ statut: "ignore" }).eq("id", id);
  revalidatePath("/clients");
  redirect("/clients?info=ignore");
}

/** Change l'étape, le domaine ou les notes d'un client. */
export async function majClient(formData: FormData) {
  const supabase = await verifier();
  const id = String(formData.get("id") ?? "");
  const etape = String(formData.get("etape") ?? "") as EtapeClient;
  if (!id || !(etape in etapes)) redirect("/clients?erreur=invalide");
  const domaine = String(formData.get("domaine") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000);

  const champs: Record<string, unknown> = { etape, domaine: domaine || null, notes: notes || null };
  if (etape === "en_ligne" || etape === "abonne") {
    // Date de mise en ligne, notée une seule fois.
    const { data: actuel } = await supabase.from("clients").select("en_ligne_le").eq("id", id).single();
    if (actuel && !actuel.en_ligne_le) champs.en_ligne_le = new Date().toISOString().slice(0, 10);
  }
  const { error } = await supabase.from("clients").update(champs).eq("id", id);
  if (error) redirect(`/clients?erreur=echec&vers=${id}`);

  revalidatePath("/", "layout");
  redirect(`/clients?info=enregistre&vers=${id}`);
}

/**
 * Lance Pedro, l'agent des sites (workflow « agent-site.yml ») pour ce client :
 * « preparer » fait (ou refait) le site et son aperçu ; « en_ligne » le relie à son domaine.
 */
export async function lancerPedro(formData: FormData) {
  const supabase = await verifier();
  const id = String(formData.get("id") ?? "");
  const enLigne = formData.get("action") === "en_ligne";
  if (!/^[0-9a-f-]{36}$/.test(id)) redirect("/clients?erreur=invalide");
  const token = process.env.GITHUB_ACTIONS_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY_DEVANTURE || "Ambroiselc/Devanture";
  if (!token) redirect(`/clients?erreur=cle&vers=${id}`);

  if (enLigne) {
    const { data: c } = await supabase.from("clients").select("etape, domaine").eq("id", id).single();
    if (!c?.domaine) redirect(`/clients?erreur=domaine&vers=${id}`);
    if (!["valide", "domaine_achete", "en_ligne", "abonne"].includes(c.etape)) redirect(`/clients?erreur=pas_valide&vers=${id}`);
  }
  const { data: enCours } = await supabase.from("tasks").select("id").eq("agent", "site_production").eq("status", "en_cours")
    .gte("started_at", new Date(Date.now() - 30 * 60_000).toISOString()).limit(1);
  if (enCours?.length) redirect(`/clients?erreur=occupe&vers=${id}`);

  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/agent-site.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
      // Obligatoire pour GitHub ; sur Cloudflare, fetch n'en ajoute pas tout seul (sinon : refus 403).
      "User-Agent": "devanture-tableau-de-bord", "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs: { client: id, en_ligne: enLigne } }),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("GitHub a refusé le lancement de Pedro :", res.status, await res.text());
    redirect(`/clients?erreur=github&vers=${id}`);
  }
  revalidatePath("/", "layout");
  redirect(`/clients?info=${enLigne ? "pedro_en_ligne" : "pedro_lance"}&vers=${id}`);
}

/** Page Pedro : préparer d'un coup les sites de tous les clients dont le contenu est arrivé (comme le passage du matin). */
export async function lancerPedroAttente() {
  const supabase = await verifier();
  const token = process.env.GITHUB_ACTIONS_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY_DEVANTURE || "Ambroiselc/Devanture";
  if (!token) redirect("/pedro?erreur=cle");
  const { data: enCours } = await supabase.from("tasks").select("id").eq("agent", "site_production").eq("status", "en_cours")
    .gte("started_at", new Date(Date.now() - 30 * 60_000).toISOString()).limit(1);
  if (enCours?.length) redirect("/pedro?erreur=occupe");
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/agent-site.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "devanture-tableau-de-bord", "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs: { client: "", en_ligne: false } }),
    cache: "no-store",
  });
  if (!res.ok) {
    console.error("GitHub a refusé le lancement de Pedro :", res.status, await res.text());
    redirect("/pedro?erreur=github");
  }
  revalidatePath("/", "layout");
  redirect(`/pedro?info=lance&depuis=${Date.now()}`);
}
