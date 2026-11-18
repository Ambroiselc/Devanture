// Liens de paiement Stripe de PRODUCTION (28/10, créés par le workflow « Stripe — catalogue »).
// Lus par le tableau de bord (carte « Liens de paiement ») et par Inès (agents/lib/redaction-reponse.ts).
// Adresses publiques, faites pour être envoyées aux clients : ce ne sont pas des secrets.
// Si le catalogue change, relancer le workflow en production et recopier ici les adresses de son résumé.
//
// Quand les envoyer (CGV, article 5, version du 29/10) :
//   • formule sans engagement : la CRÉATION à la commande, puis l'ABONNEMENT à la mise en ligne du site ;
//   • formule « 0 € de départ » : l'abonnement à la COMMANDE, le premier mois compte dans les 12 (code LANCEMENT possible).

/** Offre de lancement (5 premiers clients) encore ouverte ? À passer à false après le 5e client. */
export const OFFRE_LANCEMENT_OUVERTE = true;

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

/** Texte pour le message système d'Inès : quel lien, et quand. */
export function liensPourInes(): string {
  const l = (cle: string) => LIENS_PAIEMENT.find((x) => x.cle === cle)!.url;
  return [
    "Liens de paiement (à n'utiliser que si l'artisan a CLAIREMENT choisi sa formule et veut commander ; la réponse sera relue par Ambroise) :",
    OFFRE_LANCEMENT_OUVERTE
      ? `- Essentiel sans engagement, création à payer maintenant (offre de lancement, 195 € au lieu de 390 €) : ${l("essentiel_creation_lancement")}`
      : `- Essentiel sans engagement, création à payer maintenant (390 €) : ${l("essentiel_creation")}`,
    OFFRE_LANCEMENT_OUVERTE
      ? `- Pro sans engagement, création à payer maintenant (offre de lancement, 345 € au lieu de 690 €) : ${l("pro_creation_lancement")}`
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
