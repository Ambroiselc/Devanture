// Liste officielle des entreprises RGE (« Reconnu Garant de l'Environnement »), publiée par l'ADEME.
// Données ouvertes (Licence Ouverte 2.0), actualisées chaque jour, sans clé ni quota.
// Avantage sur Google : chaque entreprise a déjà son e-mail, son téléphone et souvent son site.
// API : https://data.ademe.fr/data-fair/api/v1/datasets/liste-des-entreprises-rge-2/
import { http, sleep } from "./http.ts";
import { masquer } from "./sortie-publique.ts";
import { joliNom } from "./annuaire.ts";

const BASE = "https://data.ademe.fr/data-fair/api/v1/datasets/liste-des-entreprises-rge-2/lines";

/** Ce qu'on met dans email_source : l'e-mail dira « publiée dans la liste officielle des entreprises RGE ». */
export const SOURCE_EMAIL_RGE = "rge:ademe";

interface Ligne {
  siret?: string;
  nom_entreprise?: string;
  adresse?: string;
  code_postal?: string;
  commune?: string;
  email?: string;
  site_internet?: string;
  domaine?: string;
  particulier?: boolean;
}

export interface EntrepriseRge {
  siret: string;
  nom: string;
  adresse: string;
  codePostal: string;
  commune: string;
  email: string | null;
  site: string | null;
  domaines: string[];
  /** Travaille pour les particuliers (notre cible). */
  particulier: boolean;
}

/** Domaines qui ne sont pas des artisans (bureaux d'études, architectes, auditeurs) : écartés. */
const PAS_ARTISAN = /architecte|audit|bureau d.?[ée]tudes|[ée]tude thermique|diagnostic|ma[iî]trise d.?[œo]e?uvre|assistance|accompagnateur/i;

/** Du domaine de travaux RGE vers les métiers de Loïc (le premier qui correspond l'emporte). */
const METIERS: [RegExp, string][] = [
  [/pompe [àa] chaleur|climatisation|ventilation/i, "Climatisation et pompe à chaleur"],
  // 17/11 : nouveaux métiers (avant : poêles → plombier, photovoltaïque → électricien, façade → maçon, isolation → plaquiste).
  [/po[eê]le|insert|foyer|appareil.*bois/i, "Poêles et cheminées"],
  [/chaudi[eè]re|chauffage|chauffe-eau|bois|solaire thermique|eau chaude|g[ée]othermie/i, "Plombier-chauffagiste"],
  [/photovolta[iï]que/i, "Panneaux solaires"],
  [/[ée]lectri/i, "Électricien"],
  [/fen[eê]tres? de toit|toiture/i, "Couvreur"],
  [/fen[eê]tres|fermetures|menuiseries|portes/i, "Menuisier"],
  [/murs par l.?ext[ée]rieur|fa[çc]ade/i, "Façadier"],
  [/isolation|planchers|murs|combles|rampants/i, "Isolation"],
];

export function metierRge(domaines: string[]): string {
  for (const [motif, metier] of METIERS) if (domaines.some((d) => motif.test(d))) return metier;
  return "Artisan du bâtiment";
}

export function estArtisanRge(e: EntrepriseRge): boolean {
  return e.particulier && e.domaines.some((d) => !PAS_ARTISAN.test(d));
}

const emailValide = (e?: string) => {
  const v = (e ?? "").trim().toLowerCase();
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(v) ? v : null;
};

const siteValide = (s?: string) => {
  const v = (s ?? "").trim();
  if (!v || v.length < 4) return null;
  return /^https?:\/\//i.test(v) ? v : `http://${v}`;
};

/**
 * Toutes les entreprises RGE de ces codes postaux, une par SIRET (la liste a une ligne par qualification).
 */
export async function entreprisesRge(codesPostaux: string[]): Promise<EntrepriseRge[]> {
  if (codesPostaux.length === 0) return [];
  return lireRge(`code_postal:(${codesPostaux.join(" OR ")})`);
}

/** 17/11 : les entreprises RGE de ces SIRET (pour relire leurs domaines de travaux, qui ne sont pas gardés en base). */
export async function entreprisesRgeParSiret(sirets: string[]): Promise<EntrepriseRge[]> {
  const propres = [...new Set(sirets.map((s) => s.replace(/\s/g, "")).filter((s) => /^\d{14}$/.test(s)))];
  const tous: EntrepriseRge[] = [];
  for (let i = 0; i < propres.length; i += 40) {
    tous.push(...(await lireRge(`siret:(${propres.slice(i, i + 40).join(" OR ")})`)));
  }
  return tous;
}

/** Toutes les entreprises RGE d'un département (« 59 », « 62 »…), une par SIRET. Élargissement de zone (27/10). */
export async function entreprisesRgeDepartement(departement: string): Promise<EntrepriseRge[]> {
  if (!/^(\d{2}|2[AB])$/.test(departement)) throw new Error(`Département invalide : ${departement}`);
  return lireRge(`code_postal:${departement}*`);
}

async function lireRge(qs: string): Promise<EntrepriseRge[]> {
  const params = new URLSearchParams({
    size: "1000",
    qs,
    select: "siret,nom_entreprise,adresse,code_postal,commune,email,site_internet,domaine,particulier",
  });
  let url: string | null = `${BASE}?${params}`;
  const parSiret = new Map<string, EntrepriseRge>();
  let pages = 0;
  while (url && pages < 60) {
    pages++;
    // 9/11 : le serveur de l'ADEME dépasse parfois 30 s (échec de Loïc à 14 h 22) : 3 essais, 60 s chacun, 10 puis 30 s d'attente.
    let res: Response | null = null;
    for (let essai = 1; ; essai++) {
      try {
        res = await http(url, { headers: { accept: "application/json" } }, 60_000);
        if (res.ok || res.status < 500 || essai >= 3) break;
      } catch (err) {
        if (essai >= 3) throw err;
      }
      await new Promise((r) => setTimeout(r, essai === 1 ? 10_000 : 30_000));
    }
    if (!res.ok) throw new Error(`Liste RGE : erreur ${res.status}`);
    const data = (await res.json()) as { results?: Ligne[]; next?: string };
    for (const l of data.results ?? []) {
      const siret = (l.siret ?? "").replace(/\s/g, "");
      if (!/^\d{14}$/.test(siret)) continue;
      const e = parSiret.get(siret) ?? {
        siret,
        nom: joliNom(l.nom_entreprise ?? ""),
        adresse: joliNom(l.adresse ?? ""),
        codePostal: l.code_postal ?? "",
        commune: joliNom(l.commune ?? ""),
        email: null,
        site: null,
        domaines: [],
        particulier: false,
      };
      e.email ??= emailValide(l.email);
      e.site ??= siteValide(l.site_internet);
      if (l.domaine && !e.domaines.includes(l.domaine)) e.domaines.push(l.domaine);
      e.particulier ||= l.particulier === true;
      parSiret.set(siret, e);
      masquer(e.nom, e.adresse, l.nom_entreprise, l.adresse, e.site, l.site_internet); // journaux publics (18/11)
    }
    url = data.next ?? null;
    await sleep(200);
  }
  return [...parSiret.values()];
}
