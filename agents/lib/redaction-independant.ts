// Claude Haiku rédige les textes d'une maquette « indépendant » (photographe, coach sportif ; nouvelle cible du 26/11).
// La mise en page vient du modèle demo-independant.ts. Même règle d'honnêteté que pour les artisans.
import { httpClaude } from "./http.ts";
import { coutEur, MODELE } from "./haiku.ts";
import type { ContenuIndependant, MetierIndependant } from "./demo-independant.ts";

export interface InfosIndependant {
  nom: string;
  metier: MetierIndependant;
  commune: string;
  telephone: string | null;
  email: string | null;
  /** Début du texte de son site actuel. */
  texteSite: string | null;
}

const SYSTEME = `Tu rédiges les textes d'un site de démonstration pour un ou une indépendante (photographe ou coach sportif), en France.
Devanture, une micro-entreprise, lui enverra cette démo pour lui proposer un nouveau site avec réservation en ligne. Ton simple, chaleureux et concret, en français. Le site parle à la PREMIÈRE PERSONNE (« je vous accompagne »), au vouvoiement pour le visiteur.

Règle absolue : n'invente AUCUN fait. Pas d'année de création, d'ancienneté, de diplôme, de certification, de prix, de nombre de clients, d'avis, de récompense, de matériel, de prénom qui ne serait pas dans le nom. N'accorde aucun mot au féminin ou au masculin pour parler de la personne (« installée », « passionné ») : tourne la phrase autrement.
Appuie-toi d'abord sur le texte de son site actuel (ses vraies prestations, sa spécialité, sa façon de travailler). S'il ne dit rien, décris le métier de façon générale.

À rédiger :
- nom : le nom tel qu'il doit apparaître en haut du site, court et propre (40 caractères au plus), sans mots-clés ajoutés (« Studio Lumière - Photographe mariage Lille » → « Studio Lumière »). Majuscules normales. N'invente jamais un nom.
- accroche : titre principal, 35 à 70 caractères, concret, qui dit ce qu'il ou elle fait et où (« Photographe de mariage et de famille à Lille », « Coach sportif à Roubaix, chez vous ou au parc »). Pas de slogan creux (« Révélez votre potentiel », « Des souvenirs inoubliables »).
- intro : 1 phrase, 90 à 180 caractères, à la première personne, sur ce que la personne apporte concrètement.
- prestations : 4 prestations (celles de son site si possible). titre ≤ 28 caractères, description = 1 phrase de 50 à 110 caractères. Jamais de prix ni de durée inventée.
- apropos : 2 phrases, 150 à 300 caractères, à la première personne, sans fait inventé.
- zone : 5 à 7 communes, choisies UNIQUEMENT dans la liste fournie, sa commune en premier.

Réponds uniquement avec l'outil « rediger_demo ».`;

const OUTIL = {
  name: "rediger_demo",
  description: "Enregistre les textes de la démo.",
  input_schema: {
    type: "object",
    properties: {
      nom: { type: "string" },
      accroche: { type: "string" },
      intro: { type: "string" },
      prestations: {
        type: "array", minItems: 3, maxItems: 4,
        items: { type: "object", properties: { titre: { type: "string" }, description: { type: "string" } }, required: ["titre", "description"] },
      },
      apropos: { type: "string" },
      zone: { type: "array", items: { type: "string" } },
    },
    required: ["nom", "accroche", "intro", "prestations", "apropos", "zone"],
  },
};

const court = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Nom proposé par Claude s'il est raisonnable et tiré du nom d'origine, sinon le nom d'origine. */
function nomPropre(propose: unknown, origine: string): string {
  const nom = court(propose, 60);
  if (!nom || nom.length > 40) return origine.slice(0, 60);
  const mots = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  const connus = new Set(mots(origine));
  return mots(nom).some((m) => connus.has(m)) || mots(nom).length === 0 ? nom : origine.slice(0, 60);
}

export async function redigerDemoIndependant(a: InfosIndependant, communesProches: string[], palette: number) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY manquante.");
  const res = await httpClaude("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODELE, max_tokens: 1000, system: SYSTEME, tools: [OUTIL], tool_choice: { type: "tool", name: OUTIL.name },
      messages: [{ role: "user", content: JSON.stringify({
        nom: a.nom, metier: a.metier, commune: a.commune, texte_du_site_actuel: a.texteSite, communes_possibles: communesProches,
      }) }],
    }),
  }, 60_000);
  if (!res.ok) throw new Error(`API Claude : erreur ${res.status} ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as { content: { type: string; input?: Record<string, unknown> }[]; usage: { input_tokens: number; output_tokens: number } };
  const s = data.content.find((c) => c.type === "tool_use")?.input;
  if (!s) throw new Error("API Claude : réponse sans textes.");

  const prestations = (Array.isArray(s.prestations) ? s.prestations : [])
    .slice(0, 4)
    .map((x: Record<string, unknown>) => ({ titre: court(x.titre, 36), description: court(x.description, 140) }))
    .filter((x) => x.titre && x.description);
  if (prestations.length < 3) throw new Error("API Claude : pas assez de prestations.");
  const permises = new Set(communesProches);
  const zone = [...new Set([a.commune, ...(Array.isArray(s.zone) ? s.zone.map(String) : []).filter((z) => permises.has(z))])].slice(0, 7);

  const contenu: ContenuIndependant = {
    modele: "independant",
    nom: nomPropre(s.nom, a.nom),
    metier: a.metier,
    commune: a.commune,
    accroche: court(s.accroche, 90) || `${a.metier} à ${a.commune}`,
    intro: court(s.intro, 220),
    prestations,
    apropos: court(s.apropos, 360),
    zone,
    telephone: a.telephone,
    email: a.email,
    palette,
  };
  const { input_tokens, output_tokens } = data.usage;
  return { contenu, tokensEntree: input_tokens, tokensSortie: output_tokens, coutEur: coutEur(input_tokens, output_tokens) };
}
