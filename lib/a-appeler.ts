// « À appeler » (24/11, demande de Broise) : les artisans qui ont ouvert leur maquette, du plus « chaud » au plus froid,
// avec leur téléphone public (liste RGE), et la fiche d'appel personnalisée de chacun (/appeler/<id>).
// Constat du 24/11 : 35 maquettes ouvertes, certaines 3 fois, mais aucune réponse écrite. Un artisan répond rarement à
// un e-mail : on l'appelle. Les résultats d'appel sont ajoutés aux notes du prospect (lignes « [Appel jj/mm] … »).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { detailsOuvertures, visitesDe, type Envoi, type VisiteMaquette } from "./visites-maquettes";

export interface AAppeler {
  prospectId: string;
  websiteId: string;
  slug: string | null;
  nom: string;
  metier: string | null;
  ville: string | null;
  telephone: string | null;
  email: string | null;
  siteActuel: string | null;
  statut: string;
  notes: string | null;
  vues: number;
  premiere: string | null;
  derniere: string;
  visites: VisiteMaquette[];
  totalS: number;
  envois: Envoi[];
  fournisseur: string | null;
  /** Premier e-mail envoyé (lien vers la boîte mail). */
  emailId: string | null;
  /** Ouvert 2 fois ou plus, ou 45 s au total : à appeler en premier. */
  chaud: boolean;
  score: number;
  /** Dernière ligne « [Appel …] » des notes (null = jamais appelé). */
  dernierAppel: string | null;
  /** 25/11 : date (ISO) du dernier appel, lue dans cette ligne. */
  dateDernierAppel: string | null;
  /** 25/11 : dernier appel sans réponse (« Messagerie » ou « À rappeler ») et pas de décision : il reste à appeler. */
  aRappeler: boolean;
  /** 25/11 : a rouvert sa maquette APRÈS le dernier appel (remonte en tête). */
  rouvertApresAppel: boolean;
  /** L'artisan a déjà écrit (hors réponses automatiques). */
  aEcrit: boolean;
  /** Prestations mises en avant sur sa maquette, et communes de sa zone. */
  services: string[];
  zone: string[];
}

/** « 0321123456 » ou « +33 3 21… » → « 03 21 12 34 56 » (affichage). */
export function telAffiche(t: string | null): string | null {
  if (!t) return null;
  let c = t.replace(/[^\d+]/g, "");
  if (c.startsWith("+33")) c = "0" + c.slice(3);
  if (c.startsWith("0033")) c = "0" + c.slice(4);
  return /^0\d{9}$/.test(c) ? c.replace(/(\d{2})(?=\d)/g, "$1 ") : t;
}

/** Lien « tel: » (format international, pour que le téléphone compose directement). */
export function telLien(t: string | null): string | null {
  const a = telAffiche(t)?.replace(/\s/g, "");
  return a && /^0\d{9}$/.test(a) ? `tel:+33${a.slice(1)}` : null;
}

const APPEL = /^\[Appel [^\]]*\].*$/gm;

/** Dernière ligne « [Appel …] » des notes du prospect. */
export function dernierAppel(notes: string | null): string | null {
  const lignes = (notes ?? "").match(APPEL);
  return lignes?.length ? lignes[lignes.length - 1] : null;
}

/** « [Appel 24/11 18:12] … » → date ISO (heure de Paris ; année en cours, ou la précédente si la date serait dans le futur). */
export function dateAppel(ligne: string | null): string | null {
  const m = ligne?.match(/^\[Appel (\d{2})\/(\d{2})[^\d]+(\d{1,2}):(\d{2})\]/);
  if (!m) return null;
  const [j, mo, h, mi] = m.slice(1).map(Number);
  const maintenant = new Date();
  for (const an of [maintenant.getUTCFullYear(), maintenant.getUTCFullYear() - 1]) {
    const utc = Date.UTC(an, mo - 1, j, h, mi);
    // Décalage de Paris à cette date (1 h en hiver, 2 h en été).
    const paris = new Date(new Date(utc).toLocaleString("en-US", { timeZone: "Europe/Paris" }));
    const local = new Date(new Date(utc).toLocaleString("en-US", { timeZone: "UTC" }));
    const d = new Date(utc - (paris.getTime() - local.getTime()));
    if (d.getTime() <= maintenant.getTime() + 60_000) return d.toISOString();
  }
  return null;
}

/** Résultats d'appel qui laissent l'artisan « à rappeler ». */
const SANS_REPONSE = /\] (Messagerie|À rappeler)/;

export function lignesAppel(notes: string | null): string[] {
  return (notes ?? "").match(APPEL) ?? [];
}

type Ligne = {
  id: string; slug: string | null; vues: number; premiere_vue: string | null; derniere_vue: string; content: unknown;
  prospects: unknown;
};
type P = { id: string; name: string; city: string | null; phone: string | null; email: string | null; category: string | null;
  status: string; notes: string | null; current_website: string | null };

/** Les artisans qui ont ouvert leur maquette (100 au plus), triés du plus chaud au plus froid. `seul` = un seul prospect. */
export async function aAppeler(supabase: SupabaseClient, seul?: string): Promise<AAppeler[]> {
  let q = supabase.from("websites")
    .select("id, slug, vues, premiere_vue, derniere_vue, content, prospects!inner(id, name, city, phone, email, category, status, notes, current_website)")
    .eq("kind", "demo").gt("vues", 0).eq("is_demo", false).neq("status", "archive")
    .order("derniere_vue", { ascending: false }).limit(100);
  if (seul) q = q.eq("prospect_id", seul);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const lignes = (data ?? []) as unknown as Ligne[];
  const pros = (w: Ligne) => (Array.isArray(w.prospects) ? w.prospects[0] : w.prospects) as P;

  // Une maquette par artisan (la plus récemment ouverte), clients exclus.
  const parProspect = new Map<string, Ligne>();
  for (const w of lignes) {
    const p = pros(w);
    if (!p || p.status === "client" || parProspect.has(p.id)) continue;
    parProspect.set(p.id, w);
  }
  const retenues = [...parProspect.values()];
  const prospects = retenues.map(pros);
  const emails = prospects.map((p) => p.email?.toLowerCase().trim()).filter((e): e is string => !!e);
  const domaines = [...new Set(emails.map((e) => e.split("@")[1]).filter(Boolean))];

  const [visites, details, opp, ecrits] = await Promise.all([
    visitesDe(supabase, retenues.map((w) => w.id), 1000),
    detailsOuvertures(supabase, prospects.map((p) => ({ id: p.id, email: p.email }))),
    emails.length
      ? supabase.from("opposition_list").select("email, domain").or(`email.in.(${emails.map((e) => `"${e}"`).join(",")}),domain.in.(${domaines.map((d) => `"${d}"`).join(",")})`)
      : Promise.resolve({ data: [] as { email: string | null; domain: string | null }[] }),
    supabase.from("mailbox_messages").select("prospect_id").eq("direction", "entrant").eq("auto_submitted", false)
      .in("prospect_id", prospects.map((p) => p.id)).or("category.is.null,category.not.in.(automatique,spam)").limit(500),
  ]);
  const opposes = new Set<string>();
  for (const o of (opp.data ?? []) as { email: string | null; domain: string | null }[]) {
    if (o.email) opposes.add(o.email);
    if (o.domain) opposes.add("@" + o.domain);
  }
  const ontEcrit = new Set(((ecrits.data ?? []) as { prospect_id: string }[]).map((m) => m.prospect_id));

  const res: AAppeler[] = [];
  for (const w of retenues) {
    const p = pros(w);
    const e = p.email?.toLowerCase().trim();
    if (e && (opposes.has(e) || opposes.has("@" + e.split("@")[1]))) continue; // a demandé à ne plus être contacté
    const v = visites.get(w.id) ?? [];
    const totalS = v.reduce((t, x) => t + x.duree_s, 0);
    const d = details.get(p.id);
    // 26/11 : les maquettes « indépendant » ont des « prestations » au lieu de « services ».
    const c = (w.content ?? {}) as { services?: { titre?: string }[]; prestations?: { titre?: string }[]; zone?: string[]; metier?: string };
    const recence = Math.max(0, 14 - (Date.now() - new Date(w.derniere_vue).getTime()) / 86_400_000); // 0 à 14
    res.push({
      prospectId: p.id, websiteId: w.id, slug: w.slug, nom: p.name, metier: p.category ?? c.metier ?? null, ville: p.city,
      telephone: p.phone, email: p.email, siteActuel: p.current_website, statut: p.status, notes: p.notes,
      vues: w.vues, premiere: w.premiere_vue, derniere: w.derniere_vue, visites: v, totalS,
      envois: d?.envois ?? [], fournisseur: d?.fournisseur ?? null, emailId: d?.emailId ?? null,
      chaud: w.vues >= 2 || totalS >= 45,
      score: totalS + 40 * (w.vues - 1) + 3 * recence,
      dernierAppel: dernierAppel(p.notes), aEcrit: ontEcrit.has(p.id),
      ...(() => {
        const ligne = dernierAppel(p.notes);
        const quand = dateAppel(ligne);
        const decide = p.status === "interesse" || p.status === "refuse" || p.status === "client";
        return {
          dateDernierAppel: quand,
          aRappeler: !!ligne && SANS_REPONSE.test(ligne) && !decide,
          rouvertApresAppel: !!quand && !decide && new Date(w.derniere_vue).getTime() > new Date(quand).getTime(),
        };
      })(),
      services: (c.services ?? c.prestations ?? []).map((s) => s.titre ?? "").filter(Boolean).slice(0, 4),
      zone: (c.zone ?? []).slice(0, 5),
    });
  }
  // Jamais appelés d'abord (les plus chauds en tête), puis ceux déjà appelés.
  return res.sort((a, b) => Number(!!a.dernierAppel) - Number(!!b.dernierAppel) || b.score - a.score);
}
