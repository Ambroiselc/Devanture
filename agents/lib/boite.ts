// Outils de la boîte mail : adresses de réponse par prospect, nettoyage des messages,
// et garde-fous codés en dur (ils ne dépendent pas de l'IA) pour l'agente des réponses.

/**
 * Adresse de réponse propre à un prospect : ambroise@devanture-artisans.fr → ambroise+p-<id>@devanture-artisans.fr.
 * Quand l'artisan répond, on sait exactement de qui vient la réponse, même s'il écrit depuis une autre adresse.
 */
export function adresseReponse(base: string, prospectId: string): string {
  const m = base.trim().match(/^(.*<)?\s*([^<>\s@+]+)(\+[^@]*)?@([^<>\s]+?)\s*(>)?$/);
  if (!m) return base;
  const [, avant = "", local, , domaine, apres = ""] = m;
  return `${avant}${local}+p-${prospectId}@${domaine}${apres}`;
}

const TAG = /\+p-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@/i;

/** Identifiant du prospect caché dans l'adresse de réponse, s'il y en a un. */
export function prospectDepuisAdresse(adresse: string | null): string | null {
  return adresse?.match(TAG)?.[1]?.toLowerCase() ?? null;
}

/** Simple adresse e-mail extraite d'un « Nom <adresse> ». */
export function adresseSeule(texte: string): string {
  return (texte.match(/<([^>]+)>/)?.[1] ?? texte).trim().toLowerCase();
}

/**
 * Garde le message de l'artisan sans l'historique cité en dessous
 * (« Le 26 oct. 2026, Ambroise a écrit : », lignes commençant par « > », « De : … »).
 */
export function sansCitation(texte: string): string {
  const lignes = texte.replace(/\r/g, "").split("\n");
  const fin = lignes.findIndex((l) =>
    /^\s*>/.test(l)
    || /^\s*(le|on)\s.{3,120}(a écrit|wrote)\s*:?\s*$/i.test(l)
    || /^\s*-{2,}\s*(message d'origine|original message|message transféré)/i.test(l)
    || /^\s*(de|from)\s*:\s*.+@/i.test(l)
    || /^\s*_{5,}\s*$/.test(l));
  const garde = (fin === -1 ? lignes : lignes.slice(0, fin)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return garde || texte.trim();
}

/** Demande de désinscription claire : « STOP », « désinscrire », « ne plus m'écrire »… */
export function demandeStop(sujet: string, texte: string): boolean {
  const debut = sansCitation(texte).slice(0, 400);
  if (/^\s*stop\b/i.test(debut) || /^\s*(re\s*:\s*)?stop\s*$/i.test(sujet)) return true;
  return /d[ée]sinscri|d[ée]sabonn|ne (plus|jamais) (me |nous )?(recontacter|contacter|[ée]crire|envoyer)|retirez[- ]moi|supprimez (mon|notre) adresse|arr[êe]tez de m/i
    .test(debut);
}

/**
 * Sujets sensibles : la réponse attend TOUJOURS Broise, même si l'IA la juge simple.
 * Prix, contrat, paiement, résiliation, litige, données personnelles, rendez-vous à fixer…
 */
const SENSIBLES: [RegExp, string][] = [
  [/(^|[^\p{L}])(prix|tarif|co[ûu]t|combien|euro|devis|remise|promo|gratuit|offre de lancement)|€/iu, "prix ou tarif"],
  [/(^|[^\p{L}])(contrat|engagement|cgv|conditions g[ée]n[ée]rales|r[ée]silia|r[ée]silier|abonnement)/iu, "contrat ou abonnement"],
  [/(^|[^\p{L}])(paiement|payer|virement|factur|pr[ée]l[èe]vement|iban|carte bancaire|rembours|acompte|stripe)/iu, "paiement"],
  [/(^|[^\p{L}])(avocat|plainte|litige|mise en demeure|cnil|rgpd|donn[ée]es personnelles|ill[ée]gal|harc[eè]lement|arnaque)/iu, "juridique ou plainte"],
  [/(^|[^\p{L}])(rendez-vous|rdv|appel|rappel|(me|vous|nous) t[ée]l[ée]phoner|par t[ée]l[ée]phone|num[ée]ro de t[ée]l|disponibilit|cr[ée]neau|visio)/iu, "rendez-vous ou appel"],
  [/(^|[^\p{L}])(mot de passe|identifiant|acc[èe]s (au|à) mon site|nom de domaine|transf[ée]rer le domaine)/iu, "accès ou domaine"],
];

export function sujetsSensibles(...textes: string[]): string[] {
  const tout = textes.join("\n");
  return SENSIBLES.filter(([re]) => re.test(tout)).map(([, nom]) => nom);
}

/** Adresses d'expéditeurs qui ne sont pas des personnes (on ne leur répond jamais). */
export function expediteurMachine(adresse: string): boolean {
  if (/^(no-?reply|ne-?pas-?repondre|mailer-daemon|postmaster|bounce|notifications?|alerts?)[@+.-]/i.test(adresse)) return true;
  // 10/11 : messages des services Google (workspace@google.com : « votre essai arrive à expiration »…), jamais un artisan.
  return /@([a-z0-9-]+\.)*google\.com$/i.test(adresse.trim());
}

/** Objet d'une réponse : « Re : … » sans les « Re : Re : » qui s'empilent. */
export function objetReponse(sujet: string): string {
  const s = sujet.replace(/^\s*((re|tr|fwd?|aw)\s*:\s*)+/i, "").trim();
  return `Re: ${s || "votre message"}`.slice(0, 150);
}
