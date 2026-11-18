// 18/11 : le dépôt est PUBLIC, donc les journaux de GitHub Actions (sortie des agents, annotations, résumés) sont
// lisibles par tout le monde. Ce module masque, dans tout ce qu'un agent écrit à l'écran ou dans le résumé :
//  - les valeurs « artisan » lues dans la base (nom, ville, adresse, téléphone, site, objet, texte…) : enregistrées
//    automatiquement par connecter() (agents/lib/db.ts, option transform de postgres) ;
//  - celles venues d'ailleurs (liste RGE, Google), enregistrées avec masquer() ;
//  - toute adresse e-mail (sauf nos domaines), tout numéro de téléphone français, tout SIRET et les liens /m/<slug>.
// Le détail complet reste dans la base (journal des tâches du tableau de bord), jamais dans GitHub.
// Actif seulement dans GitHub Actions (GITHUB_ACTIONS=true) : rien ne change ailleurs.
import { appendFileSync } from "node:fs";

/** Colonnes dont la valeur désigne un artisan ou contient ses mots : jamais affichées telles quelles. */
const COLONNES = new Set([
  "name", "nom", "business_name", "entreprise", "artisan", "city", "ville", "address", "adresse", "postal_code",
  "email", "from_email", "to_email", "reply_to", "from_name", "contact", "contact_name", "dirigeant", "first_name", "last_name",
  "phone", "telephone", "tel", "slug", "current_website", "website", "site", "domain", "domaine", "siret", "siren",
  "subject", "objet", "body", "body_text", "body_html", "texte", "summary", "resume", "notes", "score_reason", "raison",
  "avis", "coco_avis", "debut_texte", "url", "place_id", "google_place_id", "message", "telephone_client",
]);

export function colonneSensible(nom: string): boolean {
  return COLONNES.has(nom.toLowerCase());
}

const NOS_DOMAINES = /(^|\.)(devanture-artisans\.fr|devanture-sites\.fr)$/i;
const sensibles = new Set<string>();
let tries: string[] = [];
let aJour = true;

/** Enregistre des valeurs à masquer (noms, villes, sites… venus d'ailleurs que la base). */
export function masquer(...valeurs: unknown[]) {
  for (const v of valeurs) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t.length < 4 || t.length > 400 || sensibles.has(t)) continue;
    sensibles.add(t);
    aJour = false;
  }
}

/** Le texte tel qu'il peut apparaître dans un journal public. */
export function filtrer(texte: string): string {
  if (!texte) return texte;
  let s = texte;
  if (sensibles.size) {
    if (!aJour) { tries = [...sensibles].sort((a, b) => b.length - a.length); aJour = true; }
    for (const v of tries) if (s.includes(v)) s = s.split(v).join("•••");
  }
  return s
    .replace(/([A-Z0-9._%+-]+)@([A-Z0-9.-]+\.[A-Z]{2,})/gi, (_m, _l, d: string) => (NOS_DOMAINES.test(d) ? `…@${d}` : "[adresse]"))
    .replace(/(?:\+33\s?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/g, "[tél]")
    .replace(/\b\d{3}\s?\d{3}\s?\d{3}\s?\d{5}\b/g, "[siret]")
    .replace(/\/m\/[a-z0-9][a-z0-9-]*/gi, "/m/…");
}

/** Ajoute au résumé du lancement GitHub (public), après filtrage. */
export function ajouterResume(texte: string) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, filtrer(texte));
}

// Toute la sortie du processus passe par le filtre (console.log, console.error, annotations ::notice…).
const ACTIF = process.env.GITHUB_ACTIONS === "true";
const g = globalThis as { __sortiePublique?: boolean };
if (ACTIF && !g.__sortiePublique) {
  g.__sortiePublique = true;
  for (const flux of [process.stdout, process.stderr]) {
    const ecrire = flux.write.bind(flux) as (...a: unknown[]) => boolean;
    flux.write = ((morceau: unknown, ...reste: unknown[]) =>
      ecrire(typeof morceau === "string" ? filtrer(morceau)
        : morceau instanceof Uint8Array ? filtrer(Buffer.from(morceau).toString("utf8")) : morceau, ...reste)) as typeof flux.write;
  }
}
