// Réglages de l'agent, modifiables depuis la page « Loïc » du tableau de bord.
// Si la table n'existe pas encore (migration pas lancée), on prend les valeurs par défaut.
import type { Sql } from "./db.ts";
import { CODES_COMMUNES, METIERS } from "./metiers.ts";

export interface Reglages {
  nom: string;
  actif: boolean;
  auto: boolean;
  metiers: string[];
  /** Codes INSEE des communes prospectées en automatique. */
  communes: string[];
  limiteParDefaut: number;
  maxGoogleJour: number;
  maxGoogleMois: number;
  scoreQualifie: number;
  scoreEcarte: number;
  consignes: string | null;
}

// Limites dures : les réglages ne peuvent jamais aller au-delà.
export const PLAFOND_GOOGLE_JOUR = 200;
export const PLAFOND_GOOGLE_MOIS = 900;
export const PLAFOND_PAR_LANCEMENT = 100;

export const REGLAGES_PAR_DEFAUT: Reglages = {
  nom: "Loïc",
  actif: true,
  auto: false,
  metiers: METIERS.map((m) => m.id),
  communes: CODES_COMMUNES,
  limiteParDefaut: 20,
  maxGoogleJour: PLAFOND_GOOGLE_JOUR,
  maxGoogleMois: PLAFOND_GOOGLE_MOIS,
  scoreQualifie: 60,
  scoreEcarte: 40,
  consignes: null,
};

const borne = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export async function lireReglages(sql: Sql): Promise<Reglages> {
  try {
    const [r] = await sql<{
      display_name: string; enabled: boolean; auto_enabled: boolean; metiers: string[]; communes?: string[] | null;
      default_limit: number; max_google_day: number; max_google_month: number;
      score_qualified: number; score_discarded: number; instructions: string | null;
    }[]>`select * from public.agent_settings where agent = 'prospection'`;
    if (!r) return REGLAGES_PAR_DEFAUT;
    return {
      nom: r.display_name,
      actif: r.enabled,
      auto: r.auto_enabled,
      metiers: r.metiers.filter((m) => METIERS.some((x) => x.id === m)).length
        ? r.metiers.filter((m) => METIERS.some((x) => x.id === m))
        : REGLAGES_PAR_DEFAUT.metiers,
      // Ordre de la liste des communes (par population), quel que soit l'ordre enregistré.
      communes: r.communes?.length ? CODES_COMMUNES.filter((c) => r.communes!.includes(c)) : CODES_COMMUNES,
      limiteParDefaut: borne(r.default_limit, 1, PLAFOND_PAR_LANCEMENT),
      maxGoogleJour: borne(r.max_google_day, 0, PLAFOND_GOOGLE_JOUR),
      maxGoogleMois: borne(r.max_google_month, 0, PLAFOND_GOOGLE_MOIS),
      scoreQualifie: borne(r.score_qualified, 0, 100),
      scoreEcarte: borne(r.score_discarded, 0, 100),
      consignes: r.instructions?.trim() || null,
    };
  } catch (err) {
    if ((err as { code?: string }).code === "42P01") return REGLAGES_PAR_DEFAUT; // table absente
    throw err;
  }
}

/**
 * Tournée : choisit jusqu'à `nombre` couples (métier, commune) à prospecter.
 * D'abord ceux jamais faits, dans l'ordre des communes (la plus peuplée d'abord) puis des métiers,
 * ce qui donne en pratique plusieurs métiers dans la même commune. Ensuite, ceux faits il y a le plus
 * longtemps. Un couple « épuisé » (plus de nouveaux artisans) est laissé de côté pendant 30 jours.
 */
export async function choisirAutomatiquement(
  sql: Sql,
  reglages: Reglages,
  nombre: number,
): Promise<{ metier: string; commune: string }[]> {
  const passages = await sql<{ metier: string; commune: string; dernier: Date; epuise: boolean }[]>`
    select input->>'metier' as metier, input->>'commune' as commune, max(started_at) as dernier,
           coalesce(bool_or(output->>'arret' like 'Plus de nouveaux%'
                            and started_at > now() - interval '30 days'), false) as epuise
      from public.tasks
     where agent = 'prospection' and input ? 'commune' and status = 'terminee'
     group by 1, 2`;
  const cle = (m: string, c: string) => `${m}|${c}`;
  const vus = new Map(passages.map((p) => [cle(p.metier, p.commune), p]));

  const jamaisFaits: { metier: string; commune: string }[] = [];
  const dejaFaits: { metier: string; commune: string; dernier: number }[] = [];
  for (const commune of reglages.communes) {
    for (const metier of reglages.metiers) {
      const p = vus.get(cle(metier, commune));
      if (!p) jamaisFaits.push({ metier, commune });
      else if (!p.epuise) dejaFaits.push({ metier, commune, dernier: new Date(p.dernier).getTime() });
    }
  }
  dejaFaits.sort((a, b) => a.dernier - b.dernier);
  return [...jamaisFaits, ...dejaFaits.map(({ metier, commune }) => ({ metier, commune }))].slice(0, nombre);
}
