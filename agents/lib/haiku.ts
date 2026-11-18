// Claude Haiku note chaque artisan trouvé sur Google : est-ce bien un artisan du métier,
// quelle entreprise de l'annuaire c'est, que vaut son site, et quel est son potentiel comme client.
import { httpClaude } from "./http.ts";
import type { EntrepriseAnnuaire } from "./annuaire.ts";
import type { FicheGoogle } from "./places.ts";
import type { AnalyseSite } from "./site.ts";

export const MODELE = "claude-haiku-5-5";
// Tarifs Claude Haiku 5.5 (dollars par million de tokens), d'après la page des tarifs
// d'Anthropic en octobre 2026. Conversion volontairement un peu haute pour ne jamais sous-estimer.
const PRIX_ENTREE_USD = 0.1;
const PRIX_SORTIE_USD = 0.5;
const USD_EN_EUR = 0.95;

export type QualiteSite = "aucun" | "reseau_social" | "date" | "correct" | "moderne";

export interface Note {
  /** true = artisan qui exerce ce métier (pas un magasin, un grossiste, une autre activité). */
  artisan: boolean;
  /** Index de l'entreprise de l'annuaire qui correspond à la fiche, ou null. */
  annuaire: number | null;
  qualiteSite: QualiteSite;
  score: number;
  raison: string;
  tokensEntree: number;
  tokensSortie: number;
  coutEur: number;
}

const SYSTEME = `Tu aides Devanture, une micro-entreprise qui crée des sites web pour les artisans du bâtiment et du jardin, partout en France.
Pour chaque artisan trouvé sur Google, tu reçois sa fiche Google, ce qu'on a vu sur son site actuel, et jusqu'à 5 entreprises de l'annuaire officiel qui pourraient être la sienne.

1. artisan : true si c'est une entreprise qui exerce ce métier chez les clients (artisan, PME du bâtiment). false si c'est un magasin, un grossiste, une plateforme, une enseigne nationale ou une autre activité.
2. annuaire : l'index de l'entreprise de l'annuaire qui correspond à cette fiche (même nom commercial, même nom de famille du gérant, ou même adresse), sinon null. Pour un auto-entrepreneur, l'annuaire donne souvent le nom de la personne (« Jean Dupont ») alors que la fiche s'appelle « Plomberie Dupont » : c'est bien la même entreprise.
3. qualite_site : « aucun » (pas de site), « reseau_social » (seulement Facebook, Pages Jaunes…), « date » (site ancien : pas adapté au mobile, pas de https, copyright de plus de 3 ans, aspect daté), « correct », « moderne ».
4. score de 0 à 100 = à quel point un nouveau site lui serait utile ET qu'il pourrait l'acheter. Le nombre d'avis Google et la note comptent TRÈS PEU : un artisan actif avec 0, 1 ou 3 avis vaut presque autant qu'un artisan qui en a 50 (au plus 5 points d'écart). Ce qui compte, c'est son site actuel et le fait qu'il exerce bien le métier :
   - 80 à 100 : artisan du métier, en activité, sans site, avec seulement un réseau social ou une page d'annuaire, ou avec un site daté.
     Un site qui NE RÉPOND PAS (visite_du_site.repond = false : site en panne, expiré, inaccessible) compte comme « pas de site » : qualite_site = « aucun » et score de 80 à 100. C'est même un excellent prospect.
   - 60 à 79 : site correct mais perfectible (pas clair sur téléphone, pas de prestations, pas de bouton de contact).
   - 40 à 59 : doute réel sur l'activité (fiche presque vide, activité principale peut-être différente).
   - 0 à 39 : site moderne, entreprise fermée, ou pas un artisan du métier.
5. raison : une phrase courte en français (moins de 160 caractères) qui justifie le score.

Réponds uniquement avec l'outil « noter_prospect ».`;

const OUTIL = {
  name: "noter_prospect",
  description: "Enregistre la note d'un artisan.",
  input_schema: {
    type: "object",
    properties: {
      artisan: { type: "boolean" },
      annuaire: { type: ["integer", "null"], description: "Index de l'entreprise de l'annuaire, ou null." },
      qualite_site: { type: "string", enum: ["aucun", "reseau_social", "date", "correct", "moderne"] },
      score: { type: "integer", minimum: 0, maximum: 100 },
      raison: { type: "string" },
    },
    required: ["artisan", "annuaire", "qualite_site", "score", "raison"],
  },
};

export function coutEur(tokensEntree: number, tokensSortie: number): number {
  return ((tokensEntree * PRIX_ENTREE_USD + tokensSortie * PRIX_SORTIE_USD) / 1_000_000) * USD_EN_EUR;
}

export async function noter(
  metier: string,
  fiche: FicheGoogle,
  site: AnalyseSite | null,
  annuaire: EntrepriseAnnuaire[],
  consignes: string | null = null,
): Promise<Note> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY manquante.");

  const donnees = {
    metier,
    fiche_google: {
      nom: fiche.nom,
      adresse: fiche.adresse,
      type: fiche.type,
      types: fiche.types.slice(0, 6),
      statut: fiche.statut,
      note: fiche.note,
      nombre_avis: fiche.nbAvis,
      site: fiche.site,
    },
    visite_du_site: site
      ? { reseau_social: site.reseauSocial, repond: site.repond, ...site.indices, email_trouve: !!site.email }
      : null,
    annuaire: annuaire.map((e, i) => ({
      index: i, nom: e.nom, raison_sociale: e.raisonSociale, adresse: e.adresse, code_naf: e.naf,
    })),
  };

  const res = await httpClaude(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELE,
        max_tokens: 400,
        // Les consignes de Broise (page « Loïc ») complètent les consignes de base.
        system: consignes ? `${SYSTEME}\n\nConsignes supplémentaires de Broise (à respecter) :\n${consignes}` : SYSTEME,
        tools: [OUTIL],
        tool_choice: { type: "tool", name: OUTIL.name },
        messages: [{ role: "user", content: JSON.stringify(donnees) }],
      }),
    },
    60_000,
  );

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`API Claude : erreur ${res.status} ${detail}`);
  }

  const data = (await res.json()) as {
    content: { type: string; input?: Record<string, unknown> }[];
    usage: { input_tokens: number; output_tokens: number };
  };
  const sortie = data.content.find((c) => c.type === "tool_use")?.input;
  if (!sortie) throw new Error("API Claude : réponse sans note.");

  const qualites: QualiteSite[] = ["aucun", "reseau_social", "date", "correct", "moderne"];
  const index = typeof sortie.annuaire === "number" && annuaire[sortie.annuaire] ? sortie.annuaire : null;
  const qualite = qualites.includes(sortie.qualite_site as QualiteSite) ? (sortie.qualite_site as QualiteSite) : "aucun";
  const score = Math.max(0, Math.min(100, Math.round(Number(sortie.score) || 0)));
  const { input_tokens, output_tokens } = data.usage;

  return {
    artisan: sortie.artisan !== false,
    annuaire: index,
    qualiteSite: qualite,
    score,
    raison: String(sortie.raison ?? "").slice(0, 200),
    tokensEntree: input_tokens,
    tokensSortie: output_tokens,
    coutEur: coutEur(input_tokens, output_tokens),
  };
}
