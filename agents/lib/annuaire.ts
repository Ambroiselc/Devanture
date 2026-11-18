// Annuaire officiel des entreprises (recherche-entreprises.api.gouv.fr).
// Données publiques et ouvertes (licence ouverte) : on a le droit de les conserver.
// Gratuit, sans clé, limité à 7 requêtes par seconde.
// Sert à vérifier qu'un artisan trouvé sur Google est une entreprise active, et à récupérer son SIRET.
import { http, sleep } from "./http.ts";

export interface EntrepriseAnnuaire {
  siret: string;
  nom: string;
  /** Nom de la personne ou de la société, si différent du nom commercial. */
  raisonSociale: string;
  adresse: string;
  codePostal: string | null;
  commune: string | null;
  naf: string;
  /** false = l'entreprise a refusé la diffusion de ses informations : on ne la prospecte pas. */
  diffusible: boolean;
}

interface Etablissement {
  siret?: string;
  adresse?: string;
  code_postal?: string;
  commune?: string;
  libelle_commune?: string;
  activite_principale?: string;
  etat_administratif?: string;
  statut_diffusion_etablissement?: string;
  nom_commercial?: string | null;
  liste_enseignes?: string[] | null;
}

interface Resultat {
  nom_complet?: string;
  statut_diffusion?: string;
  matching_etablissements?: Etablissement[];
}

const BASE = "https://recherche-entreprises.api.gouv.fr/search";

/** Met « PLOMBERIE DUPONT » en « Plomberie Dupont » pour que ce soit lisible. */
export function joliNom(nom: string): string {
  if (nom !== nom.toUpperCase()) return nom.trim();
  const petits = new Set(["de", "du", "des", "la", "le", "les", "et", "en", "sur", "aux", "au"]);
  return nom
    .trim()
    .toLowerCase()
    .replace(/(^|[\s\-'’(])(\p{L}+)/gu, (m, sep: string, mot: string, pos: number) =>
      pos > 0 && petits.has(mot) ? m : sep + mot[0].toUpperCase() + mot.slice(1));
}

/**
 * Code NAF officiel d'un établissement à partir de son SIRET (10/11, pour le métier des artisans RGE).
 * Renvoie null si l'annuaire ne le connaît pas ou ne répond pas : le métier se décide alors autrement.
 */
export async function nafParSiret(siret: string): Promise<string | null> {
  if (!/^\d{14}$/.test(siret)) return null;
  const url = `${BASE}?${new URLSearchParams({ q: siret, per_page: "1", limite_matching_etablissements: "1" })}`;
  try {
    let res = await http(url, { headers: { accept: "application/json" } });
    if (res.status === 429) {
      await sleep(Number(res.headers.get("retry-after") ?? "2") * 1000);
      res = await http(url, { headers: { accept: "application/json" } });
    }
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: (Resultat & { activite_principale?: string })[] };
    const r = data.results?.[0];
    const etab = r?.matching_etablissements?.find((e) => e.siret === siret);
    // L'activité de l'établissement d'abord ; celle de l'entreprise si l'établissement n'est pas renvoyé.
    const naf = etab?.activite_principale ?? r?.activite_principale ?? null;
    return naf && /^\d{2}\.\d{2}[A-Z]$/.test(naf) ? naf : null;
  } catch {
    return null;
  } finally {
    await sleep(150); // reste sous la limite de 7 requêtes par seconde
  }
}

/**
 * Cherche une entreprise par son nom dans la commune.
 * Renvoie jusqu'à 5 établissements actifs du bâtiment (code NAF 43.xx) ou du métier (`naf`) :
 * Claude choisit ensuite le bon.
 */
export async function chercherDansAnnuaire(nom: string, codeCommune: string, naf: string[] = []): Promise<EntrepriseAnnuaire[]> {
  const params = new URLSearchParams({
    q: nom,
    code_commune: codeCommune,
    etat_administratif: "A",
    per_page: "5",
    limite_matching_etablissements: "3",
  });

  let res = await http(`${BASE}?${params}`, { headers: { accept: "application/json" } });
  if (res.status === 429) {
    // Trop de requêtes : on attend comme l'annuaire le demande, puis on réessaie une fois.
    await sleep(Number(res.headers.get("retry-after") ?? "2") * 1000);
    res = await http(`${BASE}?${params}`, { headers: { accept: "application/json" } });
  }
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Annuaire des entreprises : erreur ${res.status}`);

  const data = (await res.json()) as { results?: Resultat[] };
  const trouves: EntrepriseAnnuaire[] = [];
  for (const r of data.results ?? []) {
    for (const e of r.matching_etablissements ?? []) {
      if (!e.siret || e.etat_administratif !== "A") continue;
      if (e.commune && e.commune !== codeCommune) continue;
      const activite = e.activite_principale ?? "";
      if (!activite.startsWith("43.") && !naf.includes(activite)) continue; // bâtiment ou métier visé
      const nomCommercial = e.nom_commercial || e.liste_enseignes?.[0] || null;
      trouves.push({
        siret: e.siret,
        nom: joliNom(nomCommercial || r.nom_complet || ""),
        raisonSociale: joliNom(r.nom_complet ?? ""),
        adresse: e.adresse ?? "",
        codePostal: e.code_postal ?? null,
        commune: e.libelle_commune ? joliNom(e.libelle_commune) : null,
        naf: activite,
        diffusible:
          (!r.statut_diffusion || r.statut_diffusion === "O") &&
          (!e.statut_diffusion_etablissement || e.statut_diffusion_etablissement === "O"),
      });
    }
  }
  await sleep(150); // reste sous la limite de 7 requêtes par seconde
  return trouves.slice(0, 5);
}
