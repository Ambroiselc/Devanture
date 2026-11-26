// Cible de prospection en cours (26/11, décision de Broise après 504 artisans contactés et 0 intéressé).
// « independants » : photographes et coachs sportifs du Nord et du Pas-de-Calais qui ont un site, sans réservation
// en ligne ni tarifs, avec moins de 30 avis Google (tests du 26/11 : docs projet « nouvelle-cible »).
//   - Loïc ne prospecte plus d'artisans en automatique : il cherche ces indépendants (prospection-independants.ts).
//   - Sid leur fait une maquette « indépendant » (demo-independant.ts), Valérie un e-mail adapté.
//   - L'envoi ne fait plus partir de PREMIER e-mail à un artisan : seulement à la cible. Les relances des artisans
//     déjà contactés continuent.
// Pour revenir aux artisans : CIBLE = "artisans".
// Lu par les agents ET par le tableau de bord : il n'importe rien.

export const CIBLE: "artisans" | "independants" = "independants";

/** Métiers de la nouvelle cible (valeur de prospects.category). */
export const METIERS_INDEPENDANTS = ["Photographe", "Coach sportif"] as const;
export type MetierIndep = (typeof METIERS_INDEPENDANTS)[number];

export const estIndependant = (categorie: string | null | undefined): categorie is MetierIndep =>
  (METIERS_INDEPENDANTS as readonly string[]).includes(categorie ?? "");

/** Recherche Google pour chaque métier. */
export const RECHERCHE_METIER: Record<MetierIndep, string> = {
  "Photographe": "photographe",
  "Coach sportif": "coach sportif",
};

/** Règle de sélection (validée par Broise le 26/11). */
export const AVIS_MAX = 30;

/** Réservation en ligne : plateformes connues ou modules de réservation des créateurs de sites. */
export const RESA = /resalib\.fr|doctolib\.fr|planity\.com|calendly\.com|cal\.com\/|crenolibre\.fr|medoucine\.com|treatwell\.fr|booksy\.com|fresha\.com|simplybook\.|acuityscheduling|setmore\.com|zcal\.co|tidycal|agendize|clicrdv|rdv360|book-online|bookings-checkout|services-page|wix-bookings|webador[^"']*booking|reservation en ligne|réservation en ligne|réserver en ligne|prendre (?:un )?(?:rdv|rendez-vous) en ligne/i;
/** Tarifs : un montant en euros (de 15 à 499 €) écrit sur la page. */
export const PRIX = /\b(?:[1-9]\d|[1-4]\d\d)(?:[.,]\d{2})?\s?(?:€|euros?\b|eur\b)/i;
