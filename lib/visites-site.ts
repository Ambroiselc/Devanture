// Détail des visites du site vitrine (13/11, migration 20261113000000_visites_site_detail.sql) : les 30 dernières,
// chacune rapprochée de ce qui s'est passé juste avant (ouverture d'une maquette, e-mails de prospection partis),
// pour deviner d'où elle vient. Rien ne permet de savoir QUI c'est : ce ne sont que des indices.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface VisiteSite {
  debut: string;
  duree_s: number | null;
  page: string;
  pages: string[];
  source: string;
  appareil: string | null;
  systeme: string | null;
  navigateur: string | null;
  retrouvee: boolean;
  /** 13/11 après-midi : opérateur et pays (jamais l'IP) ; robot = réseau d'hébergeur (Microsoft 365 qui vérifie les liens…). */
  reseau: string | null;
  pays: string | null;
  robot: boolean;
  /** Maquettes ouvertes dans l'heure d'avant (nom de l'artisan, heure, même type d'appareil ou non). */
  maquettes: { nom: string; ville: string | null; debut: string; memeAppareil: boolean }[];
  /** E-mails de prospection partis dans les 3 h d'avant (premiers e-mails et relances). */
  emails3h: number;
}

const HEURE = 3_600_000;

/** null si la migration n'est pas encore appliquée (table absente). */
export async function visitesSite(supabase: SupabaseClient): Promise<VisiteSite[] | null> {
  const colonnes = "debut, duree_s, page, pages, source, appareil, systeme, navigateur, retrouvee";
  const lire = (cols: string) => supabase.from("site_visites_detail").select(cols).order("debut", { ascending: false }).limit(40);
  let res = await lire(`${colonnes}, reseau, pays, robot`);
  // Migration 20261113010000_visites_site_robots.sql pas encore appliquée : sans le réseau.
  if (res.error) res = await lire(colonnes);
  const { data, error } = res;
  if (error) return null;
  const lignes = ((data ?? []) as Partial<VisiteSite>[]).map((l) => ({ reseau: null, pays: null, robot: false, ...l })) as
    Omit<VisiteSite, "maquettes" | "emails3h">[];
  if (!lignes.length) return [];
  const plusAncienne = new Date(Math.min(...lignes.map((l) => new Date(l.debut).getTime())) - 3 * HEURE).toISOString();
  const [maq, mails] = await Promise.all([
    supabase.from("maquette_visites").select("debut, appareil, websites!inner(prospects!inner(name, city))")
      .gte("debut", plusAncienne).order("debut", { ascending: false }).limit(300),
    supabase.from("emails").select("sent_at").not("sent_at", "is", null).gte("sent_at", plusAncienne).limit(3000),
  ]);
  const un = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);
  const ouvertures = (maq.error ? [] : maq.data ?? []).map((m) => {
    const p = un(un((m as { websites: unknown }).websites as { prospects: unknown } | null)?.prospects as
      { name: string; city: string | null } | null);
    return { t: new Date(m.debut as string).getTime(), debut: m.debut as string, appareil: (m.appareil as string | null) ?? null,
             nom: p?.name ?? "?", ville: p?.city ?? null };
  });
  const envois = (mails.error ? [] : mails.data ?? []).map((e) => new Date(e.sent_at as string).getTime());
  return lignes.map((l) => {
    const t = new Date(l.debut).getTime();
    const vues = new Map<string, VisiteSite["maquettes"][number]>();
    for (const o of ouvertures) {
      if (o.t < t - HEURE || o.t > t + 5 * 60_000 || vues.has(o.nom)) continue;
      const memeAppareil = Boolean(o.appareil && l.appareil && (o.appareil === l.appareil
        || (o.appareil === "telephone" && l.appareil === "tablette")));
      vues.set(o.nom, { nom: o.nom, ville: o.ville, debut: o.debut, memeAppareil });
    }
    return { ...l, pages: l.pages ?? [], maquettes: [...vues.values()].slice(0, 3),
             emails3h: envois.filter((e) => e <= t && e >= t - 3 * HEURE).length };
  });
}
