// Google Places (API « New ») : chercher les artisans visibles sur Google, en deux temps.
//   1. rechercherIds : une page de 20 identifiants au plus (3 pages par recherche), gratuite et illimitée ;
//   2. detailsFiche : la fiche complète d'un artisan jamais vu (quota gratuit de 1 000 par mois, puis payant).
// Règle Google : on n'a le droit de CONSERVER que l'identifiant du lieu (place id).
// Le reste (note, nombre d'avis, site) sert seulement à juger l'artisan, sur le moment.
import { http } from "./http.ts";
import { masquer } from "./sortie-publique.ts";
import type { Commune } from "./geo.ts";

export interface FicheGoogle {
  placeId: string;
  nom: string;
  adresse: string;
  site: string | null;
  note: number | null;
  nbAvis: number;
  statut: string | null;
  type: string | null;
  types: string[];
}

// Champs lus dans la fiche complète. websiteUri (indispensable), rating et userRatingCount
// font passer la lecture au palier « Enterprise » de Google (1 000 gratuites par mois
// d'après la grille tarifaire de Google ; d'où le plafond mensuel de l'agent).
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.primaryType",
  "places.types",
  "nextPageToken",
].join(",");

interface Place {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  primaryType?: string;
  types?: string[];
}

/**
 * Temps 1 : une page de résultats pour « <recherche> <ville> », limitée à la zone de la commune,
 * en ne demandant QUE les identifiants des fiches. Ce type de recherche est gratuit et illimité chez Google
 * (« Text Search Essentials (IDs Only) ») : on peut chercher autant qu'on veut sans toucher au quota.
 */
export async function rechercherIds(
  recherche: string,
  commune: Commune,
  pageToken?: string,
): Promise<{ ids: string[]; suivante: string | null }> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY manquante.");

  const res = await http("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.id,nextPageToken",
    },
    body: JSON.stringify({
      textQuery: `${recherche} ${commune.nom}`,
      languageCode: "fr",
      regionCode: "FR",
      pageSize: 20,
      locationRestriction: {
        rectangle: {
          low: { latitude: commune.zone.sud, longitude: commune.zone.ouest },
          high: { latitude: commune.zone.nord, longitude: commune.zone.est },
        },
      },
      ...(pageToken ? { pageToken } : {}),
    }),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`Google Places : erreur ${res.status} ${detail}`);
  }

  const data = (await res.json()) as { places?: { id: string }[]; nextPageToken?: string };
  return { ids: (data.places ?? []).map((p) => p.id).filter(Boolean), suivante: data.nextPageToken ?? null };
}

/** La fiche est-elle bien dans la commune ? (le rectangle déborde un peu sur les villes voisines) */
export function dansLaCommune(fiche: FicheGoogle, commune: Commune): boolean {
  const adresse = fiche.adresse.toLowerCase();
  return commune.codesPostaux.some((cp) => adresse.includes(cp)) || adresse.includes(commune.nom.toLowerCase());
}

/**
 * Relit une fiche Google par son identifiant (le seul élément qu'on a le droit de conserver).
 * Sert à renoter un prospect déjà connu. Compte comme une requête Google.
 */
export async function detailsFiche(placeId: string): Promise<FicheGoogle> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY manquante.");
  const champs = FIELD_MASK.split(",").filter((c) => c.startsWith("places.")).map((c) => c.slice("places.".length)).join(",");
  const res = await http(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=fr`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": champs },
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`Google Places : erreur ${res.status} ${detail}`);
  }
  const p = (await res.json()) as Place;
  masquer(p.displayName?.text, p.formattedAddress, p.websiteUri); // journaux publics (18/11)
  return {
    placeId: p.id ?? placeId,
    nom: p.displayName?.text ?? "",
    adresse: p.formattedAddress ?? "",
    site: p.websiteUri ?? null,
    note: p.rating ?? null,
    nbAvis: p.userRatingCount ?? 0,
    statut: p.businessStatus ?? null,
    type: p.primaryType ?? null,
    types: p.types ?? [],
  };
}
