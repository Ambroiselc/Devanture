// Liens de paiement Stripe de PRODUCTION (28/10, créés par le workflow « Stripe — catalogue »).
// Lus par le tableau de bord (carte « Liens de paiement ») et par Inès (agents/lib/redaction-reponse.ts).
// Adresses publiques, faites pour être envoyées aux clients : ce ne sont pas des secrets.
// Si le catalogue change, relancer le workflow en production et recopier ici les adresses de son résumé.
//
// Quand les envoyer (CGV, article 5, version du 29/10) :
//   • formule sans engagement : la CRÉATION à la commande, puis l'ABONNEMENT à la mise en ligne du site ;
//   • formule « 0 € de départ » : l'abonnement à la COMMANDE, le premier mois compte dans les 12 (code LANCEMENT possible).

// Offre de lancement (24/11, décision de Broise) : présentée aux artisans comme un tarif « jusqu'au 31 décembre »,
// en échange du droit de montrer le site en exemple. On ne dit JAMAIS « pour mes 5 premiers
// clients » (ça dit qu'il n'y en a aucun). JAMAIS d'avis Google en contrepartie d'une réduction : interdit par Google
// (avis supprimés, fiche suspendue) et pratique commerciale trompeuse en droit français. L'avis se demande à part, sans rien offrir. En interne, la limite reste de 5 clients (code LANCEMENT limité à 5).

/** Interrupteur manuel : passer à false après le 5e client. */
const OFFRE_LANCEMENT_ACTIVE = true;
/** Dernier jour de l'offre (inclus), heure de Paris. Pour prolonger : changer les DEUX lignes. */
export const OFFRE_LANCEMENT_FIN = "2026-12-31";
export const OFFRE_LANCEMENT_JUSQU_AU = "31 décembre";

/** Offre de lancement encore ouverte ? (interrupteur ET date pas dépassée) */
export const OFFRE_LANCEMENT_OUVERTE =
  OFFRE_LANCEMENT_ACTIVE &&
  new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }) <= OFFRE_LANCEMENT_FIN;

/** La contrepartie demandée, en une phrase (script d'appel, Inès). */
export const OFFRE_LANCEMENT_CONTREPARTIE =
  "en échange, vous m'autorisez à montrer votre site en exemple";

export interface LienPaiement {
  cle: string;
  formule: "Essentiel" | "Pro";
  titre: string;
  prix: string;
  quand: "signature" | "mise_en_ligne"; // « signature » = à la commande
  lancement: boolean;
  url: string;
}

export const LIENS_PAIEMENT: LienPaiement[] = [
  { cle: "essentiel_creation", formule: "Essentiel", titre: "Création", prix: "390 €", quand: "signature", lancement: false, url: "https://buy.stripe.com/3cIfZhgEn1IubDI9uvbo400" },
  { cle: "essentiel_creation_lancement", formule: "Essentiel", titre: "Création, offre de lancement", prix: "195 €", quand: "signature", lancement: true, url: "https://buy.stripe.com/4gM8wPgEnfzk37ccGHbo401" },
  { cle: "pro_creation", formule: "Pro", titre: "Création", prix: "690 €", quand: "signature", lancement: false, url: "https://buy.stripe.com/3cI5kDewf2My7ns367bo402" },
  { cle: "pro_creation_lancement", formule: "Pro", titre: "Création, offre de lancement", prix: "345 €", quand: "signature", lancement: true, url: "https://buy.stripe.com/14AaEXco75YKePU9uvbo403" },
  { cle: "essentiel_mensuel", formule: "Essentiel", titre: "Abonnement sans engagement", prix: "19 €/mois", quand: "mise_en_ligne", lancement: false, url: "https://buy.stripe.com/eVq00j9bV86SbDIdKLbo404" },
  { cle: "pro_mensuel", formule: "Pro", titre: "Abonnement sans engagement", prix: "39 €/mois", quand: "mise_en_ligne", lancement: false, url: "https://buy.stripe.com/cNi3cvdsbevg0Z49uvbo405" },
  { cle: "essentiel_sans_frais", formule: "Essentiel", titre: "0 € de départ (12 mois)", prix: "55 €/mois", quand: "signature", lancement: false, url: "https://buy.stripe.com/9B628r73NevgazEfSTbo406" },
  { cle: "pro_sans_frais", formule: "Pro", titre: "0 € de départ (12 mois)", prix: "99 €/mois", quand: "signature", lancement: false, url: "https://buy.stripe.com/bJe4gzafZgDogY2dKLbo407" },
];

/** Ligne « offre de lancement » du message système d'Inès (vide si l'offre est fermée). */
export function texteLancementInes(): string {
  if (!OFFRE_LANCEMENT_OUVERTE) return "- (Plus d'offre de lancement : ne propose aucune réduction.)";
  return `- Tarif de lancement jusqu'au ${OFFRE_LANCEMENT_JUSQU_AU} : création à moitié prix (195 € au lieu de 390 €, 345 € au lieu de 690 €), ou les 3 premiers mois à moitié prix avec 0 € de départ. En échange, l'artisan autorise Ambroise à montrer son site en exemple (c'est la SEULE contrepartie). Présente-le TOUJOURS ainsi (une date limite et un échange), JAMAIS comme une offre « pour les premiers clients » ou « les 5 premiers ».
- Ne lie JAMAIS un avis Google à une réduction, un cadeau ou un avantage (interdit par Google et par la loi). Un avis se demande seulement à part, une fois le site en ligne, sans rien offrir : « si vous êtes content, un avis m'aiderait beaucoup ».
- Si l'artisan demande des références ou d'autres clients : ne mens jamais et n'invente aucun client. Dis simplement qu'Ambroise lance Devanture en ce moment, que c'est la raison du tarif de lancement, et que la maquette qu'il a reçue montre déjà ce que donnera son site.`;
}

/** Texte pour le message système d'Inès : quel lien, et quand. */
export function liensPourInes(): string {
  const l = (cle: string) => LIENS_PAIEMENT.find((x) => x.cle === cle)!.url;
  return [
    "Liens de paiement (à n'utiliser que si l'artisan a CLAIREMENT choisi sa formule et veut commander ; la réponse sera relue par Ambroise) :",
    OFFRE_LANCEMENT_OUVERTE
      ? `- Essentiel sans engagement, création à payer maintenant (tarif de lancement jusqu'au ${OFFRE_LANCEMENT_JUSQU_AU}, 195 € au lieu de 390 €) : ${l("essentiel_creation_lancement")}`
      : `- Essentiel sans engagement, création à payer maintenant (390 €) : ${l("essentiel_creation")}`,
    OFFRE_LANCEMENT_OUVERTE
      ? `- Pro sans engagement, création à payer maintenant (tarif de lancement jusqu'au ${OFFRE_LANCEMENT_JUSQU_AU}, 345 € au lieu de 690 €) : ${l("pro_creation_lancement")}`
      : `- Pro sans engagement, création à payer maintenant (690 €) : ${l("pro_creation")}`,
    `- Essentiel « 0 € de départ », premier mois à payer maintenant (55 €/mois sur 12 mois, ce premier mois compte dans les 12) : ${l("essentiel_sans_frais")}`,
    `- Pro « 0 € de départ », premier mois à payer maintenant (99 €/mois sur 12 mois, ce premier mois compte dans les 12) : ${l("pro_sans_frais")}`,
    ...(OFFRE_LANCEMENT_OUVERTE ? ["- Avec « 0 € de départ », indique qu'il peut taper le code LANCEMENT au paiement (3 premiers mois à moitié prix)."] : []),
    "- Les abonnements SANS engagement (19 € ou 39 €/mois) se paient seulement à la mise en ligne du site : n'envoie jamais ces deux liens-là avant.",
    "- Mets le lien seul sur sa ligne et ajoute : « En payant, vous acceptez les conditions générales : devanture-artisans.fr/cgv ».",
    "- S'il n'a pas encore choisi sa formule (Essentiel ou Pro, avec ou sans frais de départ), demande-lui laquelle au lieu d'envoyer un lien.",
  ].join("\n");
}

/** Ce qu'un paiement veut dire, d'après la clé de son lien (relève des paiements, page Clients). */
export function infosLien(cle: string | null | undefined):
  | { type: "commande"; formule: "essentiel" | "pro"; paiement: "creation" | "sans_frais"; lancement: boolean }
  | { type: "abonnement"; formule: "essentiel" | "pro" }
  | null {
  const l = LIENS_PAIEMENT.find((x) => x.cle === cle);
  if (!l) return null;
  const formule = l.formule === "Pro" ? "pro" : "essentiel";
  if (l.cle.endsWith("_mensuel")) return { type: "abonnement", formule };
  return { type: "commande", formule, paiement: l.cle.includes("sans_frais") ? "sans_frais" : "creation", lancement: l.lancement };
}
