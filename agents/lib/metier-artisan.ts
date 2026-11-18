// Le métier d'un artisan (10/11) : avant, Loïc le devinait seulement à partir des domaines de travaux RGE, le premier
// qui correspondait l'emportait. Résultat : des menuisiers certifiés « fenêtres de toit » présentés comme couvreurs
// (Concept Menuiseries), et Coco qui renvoyait des maquettes à Sid tous les jours.
// Règle (prudente : on ne change le métier des domaines RGE que sur une preuve claire) :
//   1. le NOM de l'entreprise, s'il désigne un seul métier (« Concept Menuiseries » → Menuisier ; un nom de famille
//      comme « Dujardin » ne compte pas : le mot doit commencer un mot du nom) ;
//   2. le code NAF officiel, seulement s'il désigne un métier précis ET qu'il contredit les domaines RGE
//      (un électricien certifié pompe à chaleur reste « Climatisation et pompe à chaleur » ; les codes généralistes
//      41.20A et 43.99C ne changent rien) ;
//   3. sinon les domaines RGE (metierRge), comme avant.
// Aucun appel réseau ici : fonctions pures (tests : agents/test-metier.ts).
import { metierRge } from "./rge.ts";

export type SourceMetier = "nom" | "naf" | "rge";

/** Début de mot : « Menuiserie Dupont » oui, « Dujardin » non (\b ne marche pas avec les lettres accentuées). */
const mot = (racine: string) => new RegExp(`(?<!\\p{L})(?:${racine})`, "iu");

/** Mots du nom de l'entreprise → métier. Un nom qui désigne plusieurs métiers (« Plomberie Électricité ») ne compte pas. */
const PAR_NOM: [RegExp, string][] = [
  [mot("pompes? [àa] chaleur|climati|frigori|g[ée]nie climatique"), "Climatisation et pompe à chaleur"],
  [mot("plomb|chauffag|sanitaire"), "Plombier-chauffagiste"],
  [mot("[ée]lectri|[ée]lec(?!\\p{L})"), "Électricien"],
  [mot("menuis|fen[eê]tres|v[ée]randas?|volets"), "Menuisier"],
  [mot("couvert|couvreur|toiture|zingu|charpent"), "Couvreur"],
  [mot("serrur"), "Serrurier"],
  [mot("carrel"), "Carreleur"],
  [mot("pl[aâ]tr|plaquist"), "Plaquiste-plâtrier"],
  [mot("peintur|peintre"), "Peintre en bâtiment"],
  [mot("ma[çc]onn|ma[çc]on(?!\\p{L})"), "Maçon"],
  [mot("paysag|jardins?(?!\\p{L})|espaces? verts"), "Paysagiste"],
  // 17/11 : nouveaux métiers.
  [mot("isol"), "Isolation"],
  [mot("solaire|photovolta"), "Panneaux solaires"],
  [mot("fa[çc]ade|ravalement"), "Façadier"],
  [mot("po[eê]les?(?!\\p{L})|chemin[ée]e|ramon"), "Poêles et cheminées"],
];

/** Domaines RGE qui disent « climatisation / pompe à chaleur » (pour départager le code NAF 43.22B). */
const DOMAINE_CLIM = /pompe [àa] chaleur|climatisation/i;
const DOMAINE_CHAUFFAGE = /chaudi[eè]re|chauffage|chauffe-eau|po[eê]le|solaire thermique/i;
/** Domaines RGE de menuiserie (pour départager le code NAF 43.32B, menuiserie métallique et serrurerie). */
const DOMAINE_MENUISERIE = /fen[eê]tres|fermetures|menuiseries|portes/i;

/** Codes de travaux généraux : ils ne disent pas le métier, ils ne remplacent jamais les domaines RGE. */
const GENERALISTES = new Set(["41.20A", "43.99C"]);

/**
 * Codes NAF compatibles avec un métier deviné par les domaines RGE : dans ces cas, on garde le métier RGE, plus précis
 * (un électricien ou un plombier qui pose des pompes à chaleur ; une vitrerie qui pose des fenêtres ; un façadier).
 */
const COMPATIBLES: Record<string, string[]> = {
  "Climatisation et pompe à chaleur": ["43.21A", "43.22A", "43.22B"],
  "Plombier-chauffagiste": ["43.22A", "43.22B"],
  "Électricien": ["43.21A", "43.21B"],
  "Menuisier": ["43.32A", "43.32B", "43.32C", "16.23Z", "43.34Z"],
  "Couvreur": ["43.91A", "43.91B", "43.99A"],
  "Maçon": ["43.99C", "41.20A", "43.34Z", "43.33Z", "43.99B"],
  "Plaquiste-plâtrier": ["43.31Z", "43.29A"],
  // 17/11 : métiers ajoutés ; leurs codes NAF habituels ne doivent pas les changer en un autre métier.
  "Isolation": ["43.29A", "43.31Z", "43.91A", "43.91B", "43.99C", "41.20A", "43.32A", "43.34Z"],
  "Panneaux solaires": ["43.21A", "43.21B", "43.22B", "43.91B", "35.11Z"],
  "Façadier": ["43.99A", "43.34Z", "43.99C", "43.29A", "41.20A", "43.91B"],
  "Poêles et cheminées": ["43.22A", "43.22B", "43.99C", "47.59B"],
};

export function metierParNom(nom: string): string | null {
  const trouves = new Set(PAR_NOM.filter(([motif]) => motif.test(nom)).map(([, metier]) => metier));
  return trouves.size === 1 ? [...trouves][0] : null;
}

/** Code NAF officiel → métier, ou null si le code ne dit pas le métier (isolation, travaux de finition…). */
export function metierParNaf(naf: string | null | undefined, domaines: string[] = []): string | null {
  const code = (naf ?? "").trim().toUpperCase();
  switch (code) {
    case "43.22A": return "Plombier-chauffagiste";
    case "43.22B": {
      // Installation thermique et de climatisation : les deux métiers ont ce code, les domaines RGE départagent.
      const clim = domaines.some((d) => DOMAINE_CLIM.test(d));
      const chauffage = domaines.some((d) => DOMAINE_CHAUFFAGE.test(d));
      return clim && !chauffage ? "Climatisation et pompe à chaleur" : "Plombier-chauffagiste";
    }
    case "43.21A": return "Électricien";
    case "43.91A": case "43.91B": case "43.99A": return "Couvreur";
    case "43.34Z": return "Peintre en bâtiment";
    case "43.32A": case "43.32C": case "16.23Z": return "Menuisier";
    case "43.32B": return domaines.some((d) => DOMAINE_MENUISERIE.test(d)) ? "Menuisier" : "Serrurier";
    case "43.99C": case "41.20A": return "Maçon";
    case "43.33Z": return "Carreleur";
    case "43.31Z": return "Plaquiste-plâtrier";
    case "81.30Z": return "Paysagiste";
    default: return null;
  }
}

/**
 * Le métier d'un artisan de la liste RGE, et d'où il vient.
 * `metierRgeActuel` : métier déjà deviné par les domaines RGE (rattrapage, quand les domaines ne sont plus en base).
 */
export function metierArtisan(e: { nom: string; naf?: string | null; domaines: string[]; metierRgeActuel?: string | null }): { metier: string; source: SourceMetier } {
  const parNom = metierParNom(e.nom);
  if (parNom) return { metier: parNom, source: "nom" };
  const rge = e.metierRgeActuel ?? metierRge(e.domaines);
  const naf = (e.naf ?? "").trim().toUpperCase();
  const parNaf = metierParNaf(naf, e.domaines);
  if (parNaf && parNaf !== rge) {
    const inconnu = rge === "Artisan du bâtiment";
    const contredit = !GENERALISTES.has(naf) && !(COMPATIBLES[rge] ?? []).includes(naf);
    if (inconnu || contredit) return { metier: parNaf, source: "naf" };
  }
  return { metier: rge, source: "rge" };
}
