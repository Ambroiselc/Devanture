// Claude Haiku rédige le premier e-mail de prospection (objet + texte) pour un artisan qui a sa maquette.
// La signature et les mentions obligatoires (d'où vient l'adresse, comment ne plus être contacté)
// sont ajoutées par le code, jamais par l'IA : elles sont toujours là, toujours exactes.
import { httpClaude } from "./http.ts";
import { coutEur, MODELE } from "./haiku.ts";
import { VARIANTES, type Variante } from "./variantes-email.ts";
import { phrasesTropLongues, STYLE_SIMPLE } from "./style.ts";

export { VARIANTES, type Variante };

/** Emplacement du lien vers la maquette : remplacé par la vraie adresse au moment de l'envoi. */
export const LIEN_DEMO = "{{lien_demo}}";

export interface InfosEmail {
  nom: string;
  metier: string;
  commune: string;
  /** Ce qu'on a observé de son site actuel. */
  qualiteSite: string | null;
  siteActuel: string | null;
  /** Pourquoi Loïc l'a retenu (une phrase). */
  raison: string | null;
  /** Remarque de Coco sur le précédent e-mail, à prendre en compte (30/10). */
  remarque?: string | null;
}

export interface RedactionEmail {
  objet: string;
  /** Texte rédigé par Claude, sans formule finale ni signature. */
  texte: string;
  tokensEntree: number;
  tokensSortie: number;
  coutEur: number;
}

const QUALITES: Record<string, string> = {
  aucun: "pas de site internet trouvé",
  reseau_social: "seulement une page sur un réseau social ou un annuaire, pas de vrai site",
  date: "un site qui paraît ancien (pas adapté au téléphone, ou pas mis à jour depuis longtemps)",
  correct: "un site correct mais perfectible",
  moderne: "un site récent",
};

const SYSTEME = `Tu es Valérie et tu rédiges le PREMIER e-mail de prospection de Devanture, une micro-entreprise qui crée des sites web pour les artisans du bâtiment et du jardin, partout en France (elle a commencé par la métropole lilloise).
L'artisan ne connaît pas Devanture. Devanture lui a déjà préparé une maquette de site, gratuite, visible par un lien.

Règles :
- Français, vouvoiement, ton direct et respectueux. Commence par « Bonjour, » (on ne connaît pas le nom du gérant).
- Écris à la PREMIÈRE PERSONNE DU SINGULIER : une seule personne écrit (« j'ai préparé », « j'ai remarqué »), jamais « nous ».
- Appelle l'entreprise exactement par le nom fourni (champ « entreprise »), ou « votre entreprise ». N'invente jamais un autre nom.
- La maquette existe en DEUX STYLES (un sobre, un plus chaleureux) sur la même page : dis-le en une phrase courte, et fais porter la question finale sur le style qu'il préfère (par exemple : « Lequel des deux styles vous plaît le plus ? »).
- Ce que contient la maquette (pour ne rien lui prêter d'autre, PAS pour en faire la liste) : une présentation de l'entreprise, ses prestations, sa zone d'intervention et un bouton pour demander un devis. Elle n'a ni avis clients, ni réalisations, ni photos, ni certifications : n'en parle pas. Ne parle pas d'annuaires ni de référencement.
- Ne fais JAMAIS l'inventaire de la maquette. Dis au plus deux choses concrètes qu'elle apporte à ses clients, en mots simples (par exemple : « Vos clients voient tout de suite ce que vous faites. Ils peuvent vous demander un devis en un clic. »). Ne cite pas « votre métier » comme un élément de la maquette.
- Nomme la commune une seule fois dans tout l'e-mail, au plus, et jamais au milieu d'une liste.
- 70 à 130 mots pour le texte. Pas de liste à puces, pas de gras, pas d'emoji, pas de point d'exclamation.
- Mets le lien de la maquette exactement sous la forme ${LIEN_DEMO}, seul sur sa ligne, une seule fois.
- Termine par UNE question simple qui appelle une réponse.
- N'écris NI formule de politesse finale, NI signature, NI mention de désinscription : elles sont ajoutées automatiquement.
- N'invente rien : pas de prix, pas de remise, pas de chiffres, pas de délai, pas de compliment sur des avis ou des chantiers que tu n'as pas vus. Ne parle de son site actuel qu'à partir de l'observation fournie, avec tact (jamais « votre site est moche »).
- Pas de formules creuses (« dans un monde de plus en plus digital », « booster votre visibilité », « n'hésitez pas »).
- Objet : 35 à 65 caractères, concret, avec le nom de l'entreprise, sans majuscules inutiles ni point d'exclamation. Si tu y mets la commune, toujours précédée de « à » (« Un site pour Dupont Couverture à Roubaix ») : jamais « pour <commune> », qui ferait croire que la commune est le nom de l'artisan ou du destinataire.

${STYLE_SIMPLE}

Réponds uniquement avec l'outil « rediger_email ».`;

const OUTIL = {
  name: "rediger_email",
  description: "Enregistre l'objet et le texte de l'e-mail.",
  input_schema: {
    type: "object",
    properties: { objet: { type: "string" }, texte: { type: "string" } },
    required: ["objet", "texte"],
  },
};

export async function redigerEmail(a: InfosEmail, variante: Variante, consignes: string | null): Promise<RedactionEmail> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY manquante.");

  const systeme = [
    SYSTEME,
    VARIANTES[variante].consigne,
    consignes ? `Consignes supplémentaires de Broise (à respecter) :\n${consignes}` : "",
  ].filter(Boolean).join("\n\n");

  const donnees = {
    entreprise: a.nom,
    metier: a.metier,
    commune: a.commune,
    observation_presence_en_ligne: a.qualiteSite ? QUALITES[a.qualiteSite] ?? a.qualiteSite : "inconnue",
    site_actuel: a.siteActuel,
    pourquoi_retenu: a.raison,
    ...(a.remarque ? { a_eviter_selon_la_relecture_de_coco: a.remarque } : {}),
  };

  // Deux essais au plus : si des phrases sont trop longues, Claude les réécrit une fois.
  let s: Record<string, unknown> | undefined;
  let tokensEntree = 0;
  let tokensSortie = 0;
  let aCouper: string[] = [];
  for (let essai = 0; essai < 2; essai++) {
    const message = essai === 0 ? donnees : {
      ...donnees,
      a_corriger: `Ces phrases sont trop longues ou font une liste. Réécris l'e-mail : phrases courtes (15 mots environ) mais reliées entre elles (mais, donc, du coup…), jamais plus de deux éléments à la suite, sans faire l'inventaire de la maquette : ${aCouper.join(" / ")}`,
    };
    const res = await httpClaude(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: MODELE,
          max_tokens: 700,
          system: systeme,
          tools: [OUTIL],
          tool_choice: { type: "tool", name: OUTIL.name },
          messages: [{ role: "user", content: JSON.stringify(message) }],
        }),
      },
      60_000,
    );
    if (!res.ok) throw new Error(`API Claude : erreur ${res.status} ${(await res.text()).slice(0, 300)}`);

    const data = (await res.json()) as {
      content: { type: string; input?: Record<string, unknown> }[];
      usage: { input_tokens: number; output_tokens: number };
    };
    tokensEntree += data.usage.input_tokens;
    tokensSortie += data.usage.output_tokens;
    s = data.content.find((c) => c.type === "tool_use")?.input;
    if (!s) throw new Error("API Claude : réponse sans e-mail.");
    aCouper = phrasesTropLongues(String(s.texte ?? ""));
    if (aCouper.length === 0) break;
  }
  if (!s) throw new Error("API Claude : réponse sans e-mail.");

  const objet = corrigerObjet(String(s.objet ?? "").replace(/\s+/g, " ").replace(/!+/g, "").trim().slice(0, 90), a.commune);
  let texte = String(s.texte ?? "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 2000);
  if (!objet || texte.length < 80) throw new Error("API Claude : e-mail trop court.");

  // Le lien de la maquette doit apparaître une fois, seul sur sa ligne.
  const morceaux = texte.split(LIEN_DEMO);
  if (morceaux.length === 1) texte = `${texte}\n\nLa maquette :\n${LIEN_DEMO}`;
  else if (morceaux.length > 2) texte = morceaux[0] + LIEN_DEMO + morceaux.slice(1).join("");
  texte = texte
    .split("\n")
    .flatMap((ligne) => {
      if (!ligne.includes(LIEN_DEMO) || ligne.trim() === LIEN_DEMO) return [ligne];
      const reste = ligne.replace(LIEN_DEMO, "").trim();
      return reste ? [reste, LIEN_DEMO] : [LIEN_DEMO];
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { objet, texte, tokensEntree, tokensSortie, coutEur: coutEur(tokensEntree, tokensSortie) };
}

/** D'où vient l'adresse, en clair : « sur votre site plomberie-dupont.fr ». */
function origine(emailSource: string | null): string {
  if (!emailSource) return "sur une page publique de votre entreprise";
  if (emailSource.startsWith("rge:")) return "dans la liste officielle des entreprises RGE publiée par l'ADEME";
  try {
    return `sur votre site ${new URL(emailSource).hostname.replace(/^www\./, "")}`;
  } catch {
    return "sur une page publique de votre entreprise";
  }
}

/**
 * E-mail complet : texte de Claude + formule finale + signature + mentions obligatoires
 * (registre RGPD : qui écrit, d'où vient l'adresse, comment ne plus être contacté).
 */
export function assemblerEmail(texte: string, signature: string, email: string, emailSource: string | null): string {
  return [
    texte.trim(),
    "",
    "Bien cordialement,",
    signature.trim(),
    "",
    "—",
    `Pourquoi ce message : votre adresse ${email} est publiée ${origine(emailSource)}. Devanture n'écrit qu'aux professionnels, au sujet de leur activité.`,
    "Pour ne plus recevoir de message de Devanture, répondez simplement « STOP ».",
    // Information complète (RGPD, art. 14) : sources, durée, droits, CNIL. Page du site vitrine (27/10).
    "Vos données et vos droits : devanture-artisans.fr/donnees-personnelles",
  ].join("\n");
}

/**
 * Remet la signature ACTUELLE (réglage de la page « Valérie ») dans un e-mail déjà rédigé :
 * tout ce qui se trouve entre « Bien cordialement, » et la ligne « — » des mentions est remplacé.
 * Ainsi, changer la signature vaut aussi pour les e-mails déjà validés.
 */
export function remplacerSignature(corps: string, signature: string): string {
  const debut = corps.lastIndexOf("Bien cordialement,");
  if (debut === -1 || !signature.trim()) return corps;
  const finFormule = debut + "Bien cordialement,".length;
  const mentions = corps.indexOf("\n\n—\n", finFormule);
  const fin = mentions === -1 ? corps.length : mentions;
  return `${corps.slice(0, finFormule)}\n${signature.trim()}${corps.slice(fin)}`;
}

/**
 * 9/11 : « 2R Energies, une maquette de site pour Bermerain » faisait croire que la commune était le destinataire.
 * Dans l'objet, « pour <commune> » (et « pour la commune de … ») devient « pour vous à <commune> ».
 */
export function corrigerObjet(objet: string, commune: string | null | undefined): string {
  const c = (commune ?? "").trim();
  if (!c) return objet;
  const echap = c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[-\s']+/g, "[-\\s']+");
  return objet.replace(new RegExp(`(?<![\\p{L}\\d])pour\\s+(?:la\\s+commune\\s+de\\s+)?(${echap})(?![\\p{L}\\d])`, "iu"), "pour vous à $1");
}
