// Réponses FICTIVES pour tester l'agent sans Internet ni clés (DEVANTURE_SIMULATION=1).
// Aucune de ces entreprises n'existe ; tout ce qui est enregistré en simulation est marqué « fictif ».

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const html = (body: string, url: string) => {
  const res = new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  Object.defineProperty(res, "url", { value: url });
  return res;
};

// --- Google : « plombier Tourcoing » renvoie 2 pages, les autres recherches 1 page ---
const place = (id: string, nom: string, extra: Record<string, unknown> = {}) => ({
  id, displayName: { text: nom }, formattedAddress: "1 Rue Fictive, 59200 Tourcoing, France",
  businessStatus: "OPERATIONAL", primaryType: "plumber", types: ["plumber", "point_of_interest"],
  rating: 4.6, userRatingCount: 23, ...extra,
});

const PAGE_1 = [
  place("fake-beffroi", "Plomberie du Beffroi (fictif)", { websiteUri: "http://plomberie-beffroi.example.fr/" }),
  place("fake-exemple", "Plomberie Exemple (fictif)", { websiteUri: "https://www.facebook.com/plomberieexemple", userRatingCount: 41 }),
  place("fake-magasin", "Grand Magasin Sanitaire (fictif)", { primaryType: "home_goods_store", types: ["home_goods_store"] }),
  place("fake-roubaix", "Plombier de Roubaix (fictif)", { formattedAddress: "2 Rue Fictive, 59100 Roubaix, France" }),
];
const PAGE_2 = [
  place("fake-moderne", "Chauffage Moderne (fictif)", { websiteUri: "https://chauffage-moderne.example.fr/" }),
  place("fake-dubois", "Sanitaires Dubois (fictif)", { websiteUri: "https://sanitaires-dubois.example.fr/", userRatingCount: 8 }),
  place("fake-refus", "Plomberie Refus (fictif)", { websiteUri: "https://plomberie-refus.example.fr/" }),
  place("fake-discret", "Plomberie Discrète (fictif)"),
  place("fake-ferme", "Plomberie Fermée (fictif)", { businessStatus: "CLOSED_PERMANENTLY" }),
];
const AUTRE = [place("fake-chauffe", "Chauffe Eau Express (fictif)", { userRatingCount: 3 })];

function google(body: { textQuery: string; pageToken?: string }) {
  if (body.textQuery.startsWith("plombier ")) {
    return body.pageToken === "page-2" ? json({ places: PAGE_2 }) : json({ places: PAGE_1, nextPageToken: "page-2" });
  }
  if (body.textQuery.startsWith("chauffagiste ")) return json({ places: [...AUTRE, PAGE_1[0]] }); // doublon : ignoré
  return json({ places: [] });
}

// --- Annuaire : recherche par nom ---
const etab = (siret: string, nomCommercial: string | null, extra: Record<string, unknown> = {}) => ({
  siret, adresse: "1 RUE FICTIVE 59200 TOURCOING", code_postal: "59200", commune: "59599",
  libelle_commune: "TOURCOING", activite_principale: "43.22A", etat_administratif: "A",
  statut_diffusion_etablissement: "O", nom_commercial: nomCommercial, liste_enseignes: null, ...extra,
});
const ENTREPRISES: Record<string, unknown[]> = {
  beffroi: [{ nom_complet: "PLOMBERIE DU BEFFROI (FICTIF)", statut_diffusion: "O",
    matching_etablissements: [etab("00000000100011", "PLOMBERIE DU BEFFROI (FICTIF)")] }],
  // Auto-entrepreneur : l'annuaire ne connaît que « Jean Exemple » (2e recherche, nom raccourci).
  exemple: [{ nom_complet: "JEAN EXEMPLE (FICTIF)", statut_diffusion: "O",
    matching_etablissements: [etab("00000000200012", null)] }],
  dubois: [{ nom_complet: "SANITAIRES DUBOIS (FICTIF)", statut_diffusion: "O",
    matching_etablissements: [etab("00000000600016", null), etab("00000000600099", null, { etat_administratif: "F" })] }],
  discret: [{ nom_complet: "PERSONNE DISCRETE", statut_diffusion: "P",
    matching_etablissements: [etab("00000000500015", null)] }],
};

function annuaire(url: string) {
  const q = (new URL(url).searchParams.get("q") ?? "").toLowerCase();
  if (q.includes("exemple") && q.includes("plomberie")) return json({ results: [] }); // 1re recherche : rien
  const cle = Object.keys(ENTREPRISES).find((k) => q.includes(k) || (k === "discret" && q.includes("discrète")));
  return json({ results: cle ? ENTREPRISES[cle] : [] });
}

// --- Sites ---
const PAGES: Record<string, string> = {
  "http://plomberie-beffroi.example.fr/": `<html><head><title>Plomberie du Beffroi</title>
    <meta name="generator" content="FrontPage 4.0"></head><body><h1>Bienvenue</h1>
    <a href="/contact.html">Nous contacter</a><p>© 2014 Plomberie du Beffroi — site réalisé par webagence@agence-web.example.com</p></body></html>`,
  "http://plomberie-beffroi.example.fr/contact.html": `<html><body>Écrivez-nous : contact&#64;plomberie-beffroi.example.fr</body></html>`,
  "https://chauffage-moderne.example.fr/": `<html><head><meta name="viewport" content="width=device-width">
    <title>Chauffage Moderne — pompes à chaleur</title><meta name="description" content="Installation de PAC"></head>
    <body>© 2026 <a href="mailto:bonjour@chauffage-moderne.example.fr">bonjour@chauffage-moderne.example.fr</a></body></html>`,
  "https://sanitaires-dubois.example.fr/": `<html><head><title>Dubois</title></head><body>Devis gratuit :
    sanitaires.dubois[at]gmail.com — © 2017 — création : contact@agence-web.example.com</body></html>`,
  "https://plomberie-refus.example.fr/": `<html><head><title>Refus</title></head><body>contact@plomberie-refus.example.fr © 2015</body></html>`,
};

// --- Claude Haiku : règles simples et prévisibles ---
function haiku(body: { tools?: { name: string }[]; messages: { content: string }[] }) {
  if (body.tools?.[0]?.name === "rediger_demo") return haikuDemo(JSON.parse(body.messages[0].content));
  if (body.tools?.[0]?.name === "rediger_email") return haikuEmail(JSON.parse(body.messages[0].content));
  if (body.tools?.[0]?.name === "traiter_message") return haikuBoite(JSON.parse(body.messages[0].content));
  const d = JSON.parse(body.messages[0].content) as {
    fiche_google: { nom: string; type: string; nombre_avis: number };
    visite_du_site: { reseau_social: boolean; repond: boolean; mobile?: boolean } | null;
    annuaire: { index: number; nom: string; raison_sociale: string }[];
  };
  const artisan = d.fiche_google.type === "plumber";
  const mot = d.fiche_google.nom.toLowerCase().split(/\s+/).find((w) => w.length > 4 && !/plomberie|fictif|chauffage/.test(w)) ?? "";
  const sans = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const e = d.annuaire.find((x) => sans(`${x.nom} ${x.raison_sociale}`).includes(sans(mot)));
  let qualite = "aucun";
  if (d.visite_du_site?.reseau_social) qualite = "reseau_social";
  else if (d.visite_du_site?.repond) qualite = d.visite_du_site.mobile ? "moderne" : "date";
  const score = !artisan ? 5 : qualite === "moderne" ? 20 : d.fiche_google.nombre_avis >= 10 ? 85 : d.fiche_google.nombre_avis >= 5 ? 65 : 45;
  return json({
    content: [{ type: "tool_use", name: "noter_prospect",
      input: { artisan, annuaire: e ? e.index : null, qualite_site: qualite, score, raison: `Note fictive (${qualite}).` } }],
    usage: { input_tokens: 800, output_tokens: 70 },
  });
}

/** Liste RGE fictive : 3 lignes (2 entreprises, dont une avec 2 qualifications) et un bureau d'études. */
function rgeFictif(url: string) {
  if (!new URL(url).searchParams.get("qs")?.includes("59200")) return json({ total: 0, results: [] });
  const l = (siret: string, nom: string, domaine: string, extra: Record<string, unknown> = {}) => ({
    siret, nom_entreprise: nom, adresse: "1 RUE FICTIVE", code_postal: "59200", commune: "TOURCOING",
    email: `contact@${nom.toLowerCase().replace(/[^a-z]/g, "")}.fr`, domaine, particulier: true, ...extra });
  return json({ total: 4, results: [
    l("00000000900019", "TOITURE RGE FICTIVE", "Isolation des combles perdus"),
    l("00000000900019", "TOITURE RGE FICTIVE", "Fenêtres de toit"),
    l("00000000910018", "CHAUFFAGE RGE FICTIF", "Pompe à chaleur : chauffage", { site_internet: "https://www.plomberie-beffroi-fictif.fr" }),
    l("00000000920017", "BUREAU ETUDES FICTIF", "Audit énergétique"),
  ] });
}

/** E-mail fictif (Valérie). */
function haikuEmail(d: { entreprise: string; commune: string }) {
  return json({
    content: [{ type: "tool_use", name: "rediger_email", input: {
      objet: `Une maquette de site pour ${d.entreprise} (fictif)`,
      texte: `Bonjour,\n\nTexte fictif de simulation : j'ai préparé une maquette de site pour ${d.entreprise}, à ${d.commune}. Vous pouvez la voir ici : {{lien_demo}}\n\nElle reprend vos prestations et votre zone d'intervention, et s'affiche bien sur téléphone. Tout se modifie selon vos souhaits.\n\nSouhaitez-vous que je l'adapte à votre entreprise ?`,
    } }],
    usage: { input_tokens: 700, output_tokens: 250 },
  });
}

/** Tri fictif de la boîte mail : selon des mots du message reçu. */
function haikuBoite(d: { message_recu: string }) {
  const m = d.message_recu.toLowerCase();
  const [categorie, simple, reponse] = m.includes("combien")
    ? ["question", false, "Bonjour,\n\nMerci pour votre question. La formule Essentiel est à 390 € puis 19 € par mois (réponse fictive)."]
    : m.includes("pas intéress")
      ? ["pas_interesse", true, "Bonjour,\n\nMerci pour votre réponse, c'est noté : je ne vous recontacterai pas. (réponse fictive)"]
      : m.includes("sobre")
        ? ["interesse", false, "Bonjour,\n\nMerci, le style sobre est noté. Je vous prépare la suite. (réponse fictive)"]
        : ["question", true, "Bonjour,\n\nLa maquette s'ouvre avec le lien de mon premier message, sur ordinateur comme sur téléphone. (réponse fictive)"];
  return json({
    content: [{ type: "tool_use", name: "traiter_message", input: {
      categorie, resume: `Résumé fictif : ${categorie}.`, repondre: true, reponse, simple, a_signaler: "" } }],
    usage: { input_tokens: 1200, output_tokens: 180 },
  });
}

/** Textes de démo fictifs (agent des démos). */
function haikuDemo(d: { metier: string; commune: string; communes_possibles: string[] }) {
  return json({
    content: [{ type: "tool_use", name: "rediger_demo", input: {
      accroche: `${d.metier} à ${d.commune} et dans la métropole lilloise (texte fictif)`,
      intro: "Décrivez votre besoin et recevez un devis clair avant toute intervention. (Texte fictif de simulation.)",
      services: [1, 2, 3, 4, 5, 6].map((n) => ({ tag: "Exemple", titre: `Prestation ${n}`, description: "Description fictive d'une prestation, pour la simulation." })),
      zone: d.communes_possibles.slice(0, 8),
      zone_texte: `Interventions à ${d.commune} et alentours (texte fictif).`,
      apropos: "Présentation fictive de l'entreprise, pour la simulation.",
    } }],
    usage: { input_tokens: 900, output_tokens: 600 },
  });
}

// --- geo.api.gouv.fr : zone fictive autour de la commune ---
function geo(url: string) {
  const code = new URL(url).pathname.split("/").pop();
  const cp = code === "59599" ? "59200" : "59000";
  return json({ nom: code === "59599" ? "Tourcoing" : "Lille", code, codesPostaux: [cp],
    bbox: { type: "Polygon", coordinates: [[[3.11, 50.69], [3.19, 50.69], [3.19, 50.75], [3.11, 50.75], [3.11, 50.69]]] } });
}

export async function fakeFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (url.startsWith("https://geo.api.gouv.fr/")) return geo(url);
  if (url.startsWith("https://data.ademe.fr/")) return rgeFictif(url);
  if (url.startsWith("https://api.resend.com/emails/")) return json({ last_event: "delivered" });
  if (url.startsWith("https://api.resend.com/emails")) return json({ id: `fictif-${Math.random().toString(36).slice(2, 10)}` });
  if (url.startsWith("https://recherche-entreprises.api.gouv.fr/")) return annuaire(url);
  if (url.startsWith("https://places.googleapis.com/v1/places/") && !init.body) {
    // Relecture d'une fiche par son identifiant (renotation) : on la retrouve dans les pages fictives.
    const id = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    const fiche = [...PAGE_1, ...PAGE_2, ...AUTRE].find((p) => p.id === id);
    return fiche ? json(fiche) : new Response("introuvable", { status: 404 });
  }
  if (url.startsWith("https://places.googleapis.com/")) return google(JSON.parse(String(init.body)));
  if (url.startsWith("https://api.anthropic.com/")) return haiku(JSON.parse(String(init.body)));
  const page = PAGES[url];
  return page ? html(page, url) : new Response("introuvable", { status: 404 });
}
