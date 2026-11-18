// Accueil d'un nouveau client (29/10) : son lien personnel et l'e-mail de bienvenue préparé pour Broise.
// Utilisé par la relève des paiements (agents/paiements.ts) et par la page Clients (rattachement à la main).

/** Adresse du tableau de bord, où se trouve la page d'accueil des clients. */
export const URL_APP = (process.env.APP_BASE_URL || "https://app.devanture-artisans.fr").replace(/\/+$/, "");

export const lienAccueil = (jeton: string) => `${URL_APP}/bienvenue/${jeton}`;

export const OBJET_BIENVENUE = "Bienvenue, on lance votre site";

/** Corps de l'e-mail de bienvenue (sans formule finale ni signature, ajoutées par assemblerReponse). */
export function texteBienvenue(jeton: string): string {
  return [
    "Bonjour,",
    "",
    "Merci pour votre confiance, votre paiement est bien reçu.",
    "",
    "Pour préparer votre site, j'ai besoin de quelques éléments sur votre entreprise. Le plus simple est de passer par cette page, faite pour vous :",
    lienAccueil(jeton),
    "",
    "Vous pouvez y déposer vos photos depuis votre téléphone, en plusieurs fois si besoin. Dès que j'ai tout, je vous envoie un aperçu de votre site.",
  ].join("\n");
}

/** E-mail complet, avec la même fin que les réponses d'Inès (assemblerReponse). */
export function bienvenueComplete(jeton: string, signature: string | null | undefined): string {
  const sig = signature?.trim() || "Ambroise Le Clerc\nDevanture";
  return [texteBienvenue(jeton), "", "Bien cordialement,", sig].join("\n");
}
