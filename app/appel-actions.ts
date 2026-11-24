"use server";
// Résultat d'un appel (24/11, page « À appeler ») : une ligne « [Appel jj/mm hh:mm] résultat — note » ajoutée aux notes
// du prospect. « Intéressé » et « Pas intéressé » changent aussi son statut, ce qui arrête la relance automatique
// (la relance ne part qu'aux prospects « contacte »). « Pas intéressé » ne met PAS en liste d'opposition : il a refusé
// l'offre, il n'a pas demandé qu'on efface ses données (à faire à la main s'il le demande).
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAccess } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const RESULTATS: Record<string, { libelle: string; statut?: string }> = {
  interesse: { libelle: "Intéressé", statut: "interesse" },
  rappeler: { libelle: "À rappeler" },
  messagerie: { libelle: "Messagerie / pas de réponse" },
  pas_interesse: { libelle: "Pas intéressé", statut: "refuse" },
  mauvais_numero: { libelle: "Mauvais numéro" },
};

export async function noterAppel(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const retour = `/appeler/${id}`;
  if (!isSupabaseConfigured) redirect(`${retour}?info=demo`);
  const access = await getAccess();
  if (!access?.isAdmin) redirect(`${retour}?erreur=acces`);
  if (!/^[0-9a-f-]{36}$/.test(id)) redirect("/appeler");
  const r = RESULTATS[String(formData.get("resultat") ?? "")];
  if (!r) redirect(`${retour}?erreur=resultat`);
  const note = String(formData.get("note") ?? "").replace(/\s+/g, " ").trim().slice(0, 400);

  const supabase = await createClient();
  const { data: p, error } = await supabase.from("prospects").select("notes, status").eq("id", id).maybeSingle();
  if (error || !p) redirect(`${retour}?erreur=echec`);
  const quand = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    .format(new Date());
  const ligne = `[Appel ${quand}] ${r.libelle}${note ? ` — ${note}` : ""}`;
  const maj: { notes: string; status?: string } = { notes: [p.notes?.trim(), ligne].filter(Boolean).join("\n") };
  // Jamais de retour en arrière pour un client ; « refusé » ne remplace pas « intéressé » sans le vouloir (il faut le choisir).
  if (r.statut && p.status !== "client") maj.status = r.statut;
  const { error: e2 } = await supabase.from("prospects").update(maj).eq("id", id);
  if (e2) redirect(`${retour}?erreur=echec`);
  revalidatePath("/appeler");
  redirect(`${retour}?info=note`);
}
