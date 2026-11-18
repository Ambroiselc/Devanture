// Ouvertures de maquettes avec leur durée (5/11, migration 20261105010000_visites_maquettes.sql) :
// lues pour les quelques maquettes affichées (vue d'ensemble, page Valérie), jamais toute la table.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface VisiteMaquette { debut: string; duree_s: number; appareil: string | null }

/** Visites par maquette (les plus récentes d'abord), ou une table vide si la migration n'est pas encore appliquée. */
export async function visitesDe(supabase: SupabaseClient, ids: string[]): Promise<Map<string, VisiteMaquette[]>> {
  const parSite = new Map<string, VisiteMaquette[]>();
  if (!ids.length) return parSite;
  const { data, error } = await supabase.from("maquette_visites").select("website_id, debut, duree_s, appareil")
    .in("website_id", ids).order("debut", { ascending: false }).limit(200);
  if (error) return parSite;
  for (const v of (data ?? []) as (VisiteMaquette & { website_id: string })[]) {
    parSite.set(v.website_id, [...(parSite.get(v.website_id) ?? []), { debut: v.debut, duree_s: v.duree_s, appareil: v.appareil }]);
  }
  return parSite;
}

// 9/11 : pour chaque maquette ouverte, le fournisseur de la boîte de l'artisan (Gmail, Orange, Microsoft 365…) et
// l'identifiant de son premier e-mail (lien vers la boîte mail). Lu seulement pour les maquettes affichées.
const PUBLICS: [RegExp, string][] = [
  [/^(gmail|googlemail)\.com$/, "Gmail"], [/^(orange|wanadoo)\.fr$/, "Orange"], [/^(free|aliceadsl)\.fr$/, "Free"],
  [/^(sfr|neuf)\.fr$|^cegetel\.net$|^club-internet\.fr$/, "SFR"], [/^bbox\.fr$/, "Bouygues"], [/^laposte\.net$/, "La Poste"],
  [/^(hotmail|outlook|live|msn)\./, "Outlook / Hotmail"], [/^(yahoo|ymail)\./, "Yahoo"], [/^(icloud|me|mac)\.com$/, "iCloud"],
];
const PAR_MX: [RegExp, string][] = [
  [/google\.com\.?$|googlemail\.com\.?$/, "Google Workspace"], [/outlook\.com\.?$/, "Microsoft 365"],
  [/ovh\.net\.?$/, "OVH"], [/ionos\.|1and1\./, "Ionos"], [/orange\.fr\.?$/, "Orange Pro"],
  [/gandi\.net\.?$/, "Gandi"], [/o2switch\.net\.?$/, "o2switch"],
];

/** Fournisseur d'une adresse : domaines publics reconnus d'emblée, sinon serveur MX (DNS sur HTTPS, gardé 1 jour). */
export async function fournisseurMail(email: string | null): Promise<string | null> {
  const d = email?.split("@")[1]?.toLowerCase().trim();
  if (!d) return null;
  for (const [re, nom] of PUBLICS) if (re.test(d)) return nom;
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(d)}&type=MX`, {
      headers: { accept: "application/dns-json" }, next: { revalidate: 86_400 }, signal: AbortSignal.timeout(3000),
    });
    const j = (await r.json()) as { Answer?: { data: string }[] };
    const mx = (j.Answer ?? []).map((a) => a.data.split(" ")).sort((a, b) => Number(a[0]) - Number(b[0]))[0]?.[1]?.toLowerCase() ?? "";
    if (!mx) return "domaine propre";
    return `${PAR_MX.find(([re]) => re.test(mx))?.[1] ?? "autre hébergeur"} (domaine propre)`;
  } catch {
    return null;
  }
}

export interface DetailOuverture { fournisseur: string | null; emailId: string | null }

/** Fournisseur et premier e-mail envoyé, par prospect (quelques prospects seulement). */
export async function detailsOuvertures(supabase: SupabaseClient, prospects: { id: string; email: string | null }[]):
  Promise<Map<string, DetailOuverture>> {
  const res = new Map<string, DetailOuverture>();
  if (!prospects.length) return res;
  const [{ data }, fournisseurs] = await Promise.all([
    supabase.from("emails").select("id, prospect_id, sent_at").in("prospect_id", prospects.map((p) => p.id))
      .is("relance_de", null).not("sent_at", "is", null).order("sent_at", { ascending: true }).limit(100),
    Promise.all(prospects.map((p) => fournisseurMail(p.email))),
  ]);
  prospects.forEach((p, i) => {
    const e = (data ?? []).find((x) => x.prospect_id === p.id);
    res.set(p.id, { fournisseur: fournisseurs[i], emailId: (e?.id as string | undefined) ?? null });
  });
  return res;
}

/** Une maquette ouverte telle que l'affichent la vue d'ensemble et la page Valérie. */
export interface Ouverte {
  name: string; city: string | null; vues: number; premiere: string | null; derniere: string; visites: VisiteMaquette[];
  slug?: string | null; fournisseur?: string | null; emailId?: string | null;
}
