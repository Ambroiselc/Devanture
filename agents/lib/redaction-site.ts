// Claude Haiku pour le site définitif (Pedro, 30/10) :
//   1. regarde les photos du client (petites miniatures) et les légende : ce qu'on y voit, quelle prestation,
//      à garder ou non, et lesquelles mettre en avant ;
//   2. réécrit les textes de la maquette avec ce que le client a vraiment envoyé (prestations, zone, horaires…),
//      et rédige les pages de prestation de la formule Pro.
// Même règle que pour les maquettes : aucun fait inventé.
import { httpClaude } from "./http.ts";
import { coutEur, MODELE } from "./haiku.ts";
import type { ContenuDemo, ServiceDemo } from "./demo-artisan-pro.ts";

export interface Usage { tokensEntree: number; tokensSortie: number; coutEur: number }

async function appeler(system: string, outil: Record<string, unknown> & { name: string }, contenu: unknown[], maxTokens: number) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY manquante.");
  const res = await httpClaude("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODELE, max_tokens: maxTokens, system, tools: [outil],
      tool_choice: { type: "tool", name: outil.name },
      messages: [{ role: "user", content: contenu }],
    }),
  }, 120_000);
  if (!res.ok) throw new Error(`API Claude : erreur ${res.status} ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as {
    content: { type: string; input?: Record<string, unknown> }[];
    usage: { input_tokens: number; output_tokens: number };
  };
  const sortie = data.content.find((c) => c.type === "tool_use")?.input;
  if (!sortie) throw new Error("API Claude : réponse vide.");
  const { input_tokens, output_tokens } = data.usage;
  return { sortie, usage: { tokensEntree: input_tokens, tokensSortie: output_tokens, coutEur: coutEur(input_tokens, output_tokens) } };
}

const court = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// ---------------------------------------------------------------------------------------------
// 1. Photos
// ---------------------------------------------------------------------------------------------

export interface AvisPhoto {
  /** Légende affichée sous la photo : celle du client, sinon une légende courte et naturelle (« Toiture en ardoise refaite »). */
  legende: string;
  /** Texte de remplacement (lecteurs d'écran, Google) : un peu plus précis, sans détail inutile. */
  alt: string;
  /** Index de la prestation montrée, ou null. */
  prestation: number | null;
  /** false = floue, capture d'écran, document, photo sans rapport avec le métier. */
  garder: boolean;
  /** 0 à 10 : belle photo pour l'en-tête du site (lumineuse, nette, chantier fini ou équipe au travail). */
  vitrine: number;
}

const SYSTEME_PHOTOS = `Tu aides à préparer le site web d'un artisan du bâtiment ou du jardin, en France.
Tu reçois ses photos (en petit, numérotées dans l'ordre), la liste de ses prestations, et parfois la légende que l'artisan a écrite lui-même pour une photo. Pour chaque photo :
- legende : la petite légende affichée sous la photo, comme l'écrirait l'artisan sur son site. 2 à 6 mots, naturelle et sobre, qui nomme le TRAVAIL montré : « Toiture en ardoise refaite », « Pose de gouttières en zinc », « Salle de bains rénovée », « Chantier en cours ». Jamais de détail du décor (grue, ciel, voiture, arbre, échafaudage, personne), jamais de ville, de date ni de marque. Si tu ne sais pas quel travail c'est, une légende très simple (« Chantier réalisé », « Travaux de couverture »). Si l'artisan a écrit une légende, ne rédige rien : recopie-la telle quelle.
- alt : le texte pour les malvoyants et Google, 40 à 100 caractères : ce qu'on voit du travail (matériau, partie de la maison), toujours sans détail du décor, sans ville, sans date, sans marque. Si l'artisan a écrit une légende, pars d'elle.
- prestation : l'index de la prestation que montre la photo, ou null si aucune ne correspond clairement.
- garder : false pour une photo floue, très sombre, une capture d'écran, un document, un devis, une facture, un visage de client en gros plan, ou une photo sans rapport avec le métier. true sinon.
- vitrine : de 0 à 10, à quel point la photo ferait une belle grande image en haut du site (nette, lumineuse, travail fini et soigné, cadrage large). Un logo seul vaut 0.

Réponds uniquement avec l'outil « legender_photos », avec exactement une entrée par photo, dans l'ordre.`;

/** Légende du client remise au propre : majuscule au début, sans point final ni guillemets. */
export function legendePropre(texte: string | null | undefined): string | null {
  const t = String(texte ?? "").replace(/\s+/g, " ").trim().replace(/^["«“\s]+|["»”\s.]+$/g, "").slice(0, 90);
  return t ? t[0].toLocaleUpperCase("fr-FR") + t.slice(1) : null;
}

export async function legenderPhotos(miniatures: Buffer[], metier: string, prestations: string[],
  legendesClient: (string | null)[] = []): Promise<{ avis: AvisPhoto[]; usage: Usage }> {
  if (miniatures.length === 0) return { avis: [], usage: { tokensEntree: 0, tokensSortie: 0, coutEur: 0 } };
  const contenu: unknown[] = [{ type: "text", text: JSON.stringify({ metier, prestations: prestations.map((p, i) => ({ index: i, titre: p })) }) }];
  miniatures.forEach((m, i) => {
    const sienne = legendePropre(legendesClient[i]);
    contenu.push({ type: "text", text: sienne ? `Photo ${i + 1} (légende écrite par l'artisan : « ${sienne} »)` : `Photo ${i + 1}` });
    contenu.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: m.toString("base64") } });
  });
  const { sortie, usage } = await appeler(SYSTEME_PHOTOS, {
    name: "legender_photos",
    description: "Enregistre la légende de chaque photo.",
    input_schema: {
      type: "object",
      properties: {
        photos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              legende: { type: "string" },
              alt: { type: "string" },
              prestation: { type: ["integer", "null"] },
              garder: { type: "boolean" },
              vitrine: { type: "integer", minimum: 0, maximum: 10 },
            },
            required: ["legende", "alt", "prestation", "garder", "vitrine"],
          },
        },
      },
      required: ["photos"],
    },
  }, contenu, 200 + miniatures.length * 110);
  const liste = Array.isArray(sortie.photos) ? (sortie.photos as Record<string, unknown>[]) : [];
  const avis = miniatures.map((_, i) => {
    const x = liste[i] ?? {};
    const p = typeof x.prestation === "number" && x.prestation >= 0 && x.prestation < prestations.length ? x.prestation : null;
    // La légende du client passe toujours avant celle de Claude.
    const legende = legendePropre(legendesClient[i]) ?? legendePropre(court(x.legende, 60)) ?? "Chantier réalisé";
    return {
      legende,
      alt: court(x.alt, 120) || legende,
      prestation: p,
      garder: x.garder !== false,
      vitrine: Math.max(0, Math.min(10, Math.round(Number(x.vitrine) || 0))),
    };
  });
  return { avis, usage };
}

// ---------------------------------------------------------------------------------------------
// 2. Textes
// ---------------------------------------------------------------------------------------------

export interface InfosClient {
  nom: string;
  metier: string;
  commune: string;
  /** Ce que le client a tapé sur sa page d'accueil (texte libre). */
  prestations: string | null;
  zone: string | null;
  horaires: string | null;
  telephone: string | null;
  message: string | null;
  /** Les textes de sa maquette (point de départ). */
  maquette: Pick<ContenuDemo, "accroche" | "intro" | "services" | "zone" | "zoneTexte" | "apropos">;
  /** Formule Pro : nombre de pages de prestation à rédiger (0 pour l'Essentiel). */
  nbPages: number;
}

export interface TextesSite {
  accroche: string;
  intro: string;
  services: ServiceDemo[];
  zone: string[];
  zoneTexte: string;
  apropos: string;
  horaires: string | null;
  telephone: string | null;
  citation: string | null;
  description: string;
  /** false si le client demande de ne pas afficher son adresse (on garde alors seulement la commune). */
  afficherAdresse: boolean;
  pages: { prestation: number; titre: string; paragraphes: string[] }[];
}

const SYSTEME_TEXTES = `Tu rédiges les textes du VRAI site web d'un artisan du bâtiment ou du jardin, en France, qui vient de commander son site.
Tu pars des textes de sa maquette et de ce qu'il a lui-même écrit (ses prestations, sa zone, ses horaires, son message). Ce qu'il a écrit passe toujours avant la maquette. Ton sobre et professionnel, vouvoiement, français correct, sans fautes.

Règle absolue : n'invente AUCUN fait. Pas d'année de création, pas d'ancienneté, pas de nombre d'employés, pas de certification (RGE, Qualibat…), pas de garantie, pas de prix, pas de délai, pas d'avis, pas de marque, pas d'urgence 7 j/7, sauf si le client l'a écrit lui-même.

À rédiger :
- accroche : titre principal, 60 à 95 caractères, ce qu'il fait et où.
- intro : 1 à 2 phrases, 120 à 240 caractères, centrées sur le besoin de ses clients et la demande de devis.
- services : 3 à 6 prestations. Reprends SES prestations s'il en a donné (dans son ordre, regroupe si besoin), sinon garde celles de la maquette. tag = 1 ou 2 mots, titre ≤ 32 caractères, description = 1 phrase de 60 à 120 caractères.
- zone : la liste des communes où il intervient, d'après ce qu'il a écrit (sa commune en premier, 12 au plus). S'il parle d'un rayon ou d'un département sans citer de communes, garde la liste de la maquette.
- zone_texte : 1 phrase sur sa zone d'intervention, fidèle à ce qu'il a écrit.
- apropos : 1 à 3 phrases qui présentent l'entreprise, avec ce qu'il dit de lui dans son message s'il en parle, sinon neutres.
- horaires : ses horaires remis au propre, un jour ou une plage par ligne (« Lundi au vendredi : 8 h – 18 h »), ou null s'il n'en a pas donné.
- telephone : son numéro au format « 06 12 34 56 78 », ou null.
- citation : une phrase courte DE LUI sur sa façon de travailler, reprise presque mot pour mot de son message, ou null s'il n'a rien écrit de tel. Ne l'invente jamais.
- afficher_adresse : false si le client demande de ne pas montrer son adresse (ou travaille depuis chez lui et le dit), true sinon.
- description : la description pour Google, 130 à 155 caractères : métier, commune, prestations principales, demande de devis.
- pages : exactement le nombre demandé (« nb_pages », parfois 0). Une page pour chacune de ses prestations principales (prestation = index dans services). titre ≤ 60 caractères. paragraphes = 2 ou 3 paragraphes de 2 à 4 phrases : en quoi consiste la prestation pour le client, comment se passe l'intervention en général (visite, devis écrit, travaux, nettoyage), et l'invitation à demander un devis. Général et exact, sans fait inventé.

Réponds uniquement avec l'outil « rediger_site ».`;

export async function redigerSite(c: InfosClient): Promise<{ textes: TextesSite; usage: Usage }> {
  const { sortie: s, usage } = await appeler(SYSTEME_TEXTES, {
    name: "rediger_site",
    description: "Enregistre les textes du site.",
    input_schema: {
      type: "object",
      properties: {
        accroche: { type: "string" },
        intro: { type: "string" },
        services: {
          type: "array", minItems: 3, maxItems: 6,
          items: {
            type: "object",
            properties: { tag: { type: "string" }, titre: { type: "string" }, description: { type: "string" } },
            required: ["tag", "titre", "description"],
          },
        },
        zone: { type: "array", items: { type: "string" } },
        zone_texte: { type: "string" },
        apropos: { type: "string" },
        horaires: { type: ["string", "null"] },
        telephone: { type: ["string", "null"] },
        citation: { type: ["string", "null"] },
        description: { type: "string" },
        afficher_adresse: { type: "boolean" },
        pages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              prestation: { type: "integer" },
              titre: { type: "string" },
              paragraphes: { type: "array", items: { type: "string" } },
            },
            required: ["prestation", "titre", "paragraphes"],
          },
        },
      },
      required: ["accroche", "intro", "services", "zone", "zone_texte", "apropos", "horaires", "telephone", "citation", "description", "afficher_adresse", "pages"],
    },
  }, [{
    type: "text",
    text: JSON.stringify({
      nom: c.nom, metier: c.metier, commune: c.commune, nb_pages: c.nbPages,
      ce_que_le_client_a_ecrit: {
        prestations: c.prestations, zone: c.zone, horaires: c.horaires, telephone: c.telephone, message: c.message,
      },
      maquette: c.maquette,
    }),
  }], 1500 + c.nbPages * 450);

  const services: ServiceDemo[] = (Array.isArray(s.services) ? (s.services as Record<string, unknown>[]) : [])
    .slice(0, 6)
    .map((x) => ({ tag: court(x.tag, 24), titre: court(x.titre, 40), description: court(x.description, 160) }))
    .filter((x) => x.titre && x.description);
  const avecServices = services.length >= 3 ? services : c.maquette.services;

  const zone = [c.commune, ...(Array.isArray(s.zone) ? s.zone.map((z) => court(z, 40)) : [])].filter(Boolean);
  const zoneUnique = [...new Set(zone)].slice(0, 12);

  // Téléphone : on garde le numéro du client tel qu'il l'a donné si Claude n'a pas su le remettre en forme.
  const chiffres = (t: string | null) => (t ?? "").replace(/\D/g, "");
  let telephone = court(s.telephone, 20) || null;
  if (telephone && c.telephone && chiffres(telephone) !== chiffres(c.telephone).replace(/^33/, "0")) telephone = court(c.telephone, 25);
  if (!telephone && c.telephone) telephone = court(c.telephone, 25);

  // Citation : seulement si elle vient vraiment de son message (au moins la moitié de ses mots s'y trouvent).
  let citation = court(s.citation, 160) || null;
  if (citation) {
    const mots = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z]{4,}/g) ?? [];
    const source = new Set(mots(`${c.message ?? ""} ${c.prestations ?? ""}`));
    const m = mots(citation);
    if (!m.length || m.filter((x) => source.has(x)).length < m.length / 2) citation = null;
  }

  const pages = (Array.isArray(s.pages) ? (s.pages as Record<string, unknown>[]) : [])
    .map((p) => ({
      prestation: Number(p.prestation),
      titre: court(p.titre, 70),
      paragraphes: (Array.isArray(p.paragraphes) ? p.paragraphes : []).map((x) => court(x, 700)).filter(Boolean).slice(0, 3),
    }))
    .filter((p, i, t) => Number.isInteger(p.prestation) && p.prestation >= 0 && p.prestation < avecServices.length
      && p.titre && p.paragraphes.length > 0 && t.findIndex((q) => q.prestation === p.prestation) === i)
    .slice(0, c.nbPages);

  return {
    textes: {
      accroche: court(s.accroche, 120) || c.maquette.accroche,
      intro: court(s.intro, 300) || c.maquette.intro,
      services: avecServices,
      zone: zoneUnique.length > 1 ? zoneUnique : c.maquette.zone,
      zoneTexte: court(s.zone_texte, 220) || c.maquette.zoneTexte,
      apropos: court(s.apropos, 420) || c.maquette.apropos,
      horaires: s.horaires ? String(s.horaires).trim().slice(0, 400) : (c.horaires?.trim().slice(0, 400) || null),
      telephone,
      citation,
      description: court(s.description, 170) || `${c.metier} à ${c.commune} : ${c.nom}. Demandez votre devis.`,
      afficherAdresse: s.afficher_adresse !== false,
      pages,
    },
    usage,
  };
}
