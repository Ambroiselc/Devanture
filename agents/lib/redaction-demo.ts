// Claude Haiku rédige les textes d'une démo (titre, présentation, prestations, zone)
// à partir de ce qu'on sait vraiment de l'artisan. La mise en page vient du modèle (demo-artisan-pro.ts).
import { httpClaude } from "./http.ts";
import { coutEur, MODELE } from "./haiku.ts";
import type { ContenuDemo, ServiceDemo } from "./demo-artisan-pro.ts";

export interface InfosArtisan {
  nom: string;
  metier: string;
  commune: string;
  adresse: string | null;
  email: string | null;
  /** Début du texte de son site actuel (ce qu'il dit lui-même de son activité), s'il en a un. */
  texteSite: string | null;
}

export interface Redaction {
  contenu: ContenuDemo;
  tokensEntree: number;
  tokensSortie: number;
  coutEur: number;
}

const SYSTEME = `Tu rédiges les textes d'un site de démonstration pour un artisan du bâtiment ou du jardin, en France.
Devanture, une micro-entreprise, lui enverra cette démo pour lui proposer un vrai site. Le ton est sobre et professionnel, au vouvoiement, en français.

Règle absolue : n'invente AUCUN fait sur l'entreprise. Pas d'année de création, pas d'ancienneté, pas de nombre d'employés, pas de certification (RGE, Qualibat…), pas de garantie, pas de prix, pas de délai d'intervention, pas d'avis, pas de prénom, pas d'urgence 7 j/7.
Tu peux t'appuyer sur ce que dit le texte de son site actuel, s'il est fourni. Sinon, décris le métier de façon générale.

À rédiger :
- nom : le nom de l'entreprise tel qu'il doit apparaître en haut du site, court et propre (40 caractères au plus). Sur Google, beaucoup d'artisans ajoutent des mots-clés à leur nom (« Prince Paysage: Elagueur, Paysagiste, entretien jardin… », « France Dépannage - Serrurier à Roubaix ») : garde seulement le vrai nom (« Prince Paysage », « France Dépannage »). Mets les majuscules normalement (« QUALI RENOV' » → « Quali Renov' »). N'invente jamais un nom : si le nom fourni est celui d'une personne (« Jordane Vasseur »), garde-le tel quel.
- accroche : titre principal, 60 à 95 caractères, qui dit ce qu'il fait et où (ex. « Électricité, dépannage et mise aux normes à Lille et dans la métropole », « Couverture et zinguerie à Arras et alentour »).
- intro : 1 à 2 phrases, 120 à 240 caractères, centrées sur le besoin du client et la demande de devis.
- services : 6 prestations typiques de CE métier (ou celles de son site actuel). tag = 1 ou 2 mots (« Urgence », « Rénovation », « Entretien »…), titre ≤ 32 caractères, description = 1 phrase de 60 à 120 caractères.
- zone : 7 à 10 communes voisines, choisies UNIQUEMENT dans la liste fournie, la commune de l'artisan en premier.
- zone_texte : 1 phrase sur la zone d'intervention, sans distance ni frais de déplacement.
- apropos : 1 à 2 phrases neutres qui présentent l'entreprise (métier, commune, clientèle de particuliers et professionnels), sans fait inventé.

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
      services: {
        type: "array",
        minItems: 3,
        maxItems: 6,
        items: {
          type: "object",
          properties: { tag: { type: "string" }, titre: { type: "string" }, description: { type: "string" } },
          required: ["tag", "titre", "description"],
        },
      },
      zone: { type: "array", items: { type: "string" } },
      zone_texte: { type: "string" },
      apropos: { type: "string" },
    },
    required: ["nom", "accroche", "intro", "services", "zone", "zone_texte", "apropos"],
  },
};

/** Nom proposé par Claude, s'il est raisonnable (court, non vide, et tiré du nom d'origine) ; sinon le nom d'origine. */
function nomPropre(propose: unknown, origine: string): string {
  const nom = String(propose ?? "").replace(/\s+/g, " ").trim();
  if (!nom || nom.length > 40) return origine.slice(0, 60);
  const mots = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  const connus = new Set(mots(origine));
  // Garde-fou : au moins un mot du nom proposé doit venir du nom d'origine (Claude ne doit pas inventer un nom).
  return mots(nom).some((m) => connus.has(m)) || mots(nom).length === 0 ? nom : origine.slice(0, 60);
}

const court = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function redigerDemo(a: InfosArtisan, communesProches: string[]): Promise<Redaction> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY manquante.");

  const donnees = {
    nom: a.nom,
    metier: a.metier,
    commune: a.commune,
    texte_du_site_actuel: a.texteSite,
    communes_possibles: communesProches,
  };

  const res = await httpClaude(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODELE,
        max_tokens: 1200,
        system: SYSTEME,
        tools: [OUTIL],
        tool_choice: { type: "tool", name: OUTIL.name },
        messages: [{ role: "user", content: JSON.stringify(donnees) }],
      }),
    },
    60_000,
  );
  if (!res.ok) throw new Error(`API Claude : erreur ${res.status} ${(await res.text()).slice(0, 300)}`);

  const data = (await res.json()) as {
    content: { type: string; input?: Record<string, unknown> }[];
    usage: { input_tokens: number; output_tokens: number };
  };
  const s = data.content.find((c) => c.type === "tool_use")?.input;
  if (!s) throw new Error("API Claude : réponse sans textes.");

  const services: ServiceDemo[] = (Array.isArray(s.services) ? s.services : [])
    .slice(0, 6)
    .map((x: Record<string, unknown>) => ({ tag: court(x.tag, 24), titre: court(x.titre, 40), description: court(x.description, 160) }))
    .filter((x) => x.titre && x.description);
  if (services.length < 3) throw new Error("API Claude : pas assez de prestations.");

  // Zone : seulement des communes de la liste, la commune de l'artisan en premier, sans doublon.
  const permises = new Set(communesProches);
  const zone = [a.commune, ...(Array.isArray(s.zone) ? s.zone.map(String) : []).filter((z) => permises.has(z))];
  const zoneUnique = [...new Set(zone)].slice(0, 10);

  const { input_tokens, output_tokens } = data.usage;
  return {
    contenu: {
      nom: nomPropre(s.nom, a.nom),
      metier: a.metier,
      commune: a.commune,
      adresse: a.adresse,
      email: a.email,
      accroche: court(s.accroche, 120) || `${a.metier} à ${a.commune}`,
      intro: court(s.intro, 300),
      services,
      zone: zoneUnique,
      zoneTexte: court(s.zone_texte, 200) || `Interventions à ${a.commune} et dans les communes voisines.`,
      apropos: court(s.apropos, 360),
    },
    tokensEntree: input_tokens,
    tokensSortie: output_tokens,
    coutEur: coutEur(input_tokens, output_tokens),
  };
}
