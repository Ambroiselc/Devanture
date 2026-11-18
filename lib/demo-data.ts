// =====================================================================
// DONNÉES FICTIVES — uniquement pour tester l'interface.
// Tous les commerces, adresses, e-mails et sites ci-dessous sont inventés.
// • Les noms finissent par « (fictif) ».
// • Les e-mails et sites utilisent le domaine réservé « .example ».
// • Chaque ligne a is_demo = true.
// Ces mêmes données existent en SQL dans supabase/seed.sql.
// =====================================================================
import type {
  Campaign, Cost, DashboardData, Email, MailboxMessage, OppositionEntry, Prospect, Task, TaskEvent, Website,
} from "./types";

const id = (prefix: string, n: number) =>
  `d0000000-0000-4000-8000-${prefix}${String(n).padStart(4, "0")}`;

export const C = (n: number) => id("0000000c", n); // campagnes
export const P = (n: number) => id("0000000a", n); // prospects
export const W = (n: number) => id("0000000b", n); // sites
export const E = (n: number) => id("0000000e", n); // e-mails
export const T = (n: number) => id("0000000f", n); // tâches
export const K = (n: number) => id("0000000d", n); // coûts
export const O = (n: number) => id("00000001", n); // liste d'opposition
export const M = (n: number) => id("00000002", n); // boîte mail

const campaigns: Campaign[] = [
  {
    id: C(1), name: "Commerces de bouche — Tourcoing centre (démo)",
    description: "Boulangeries, restaurants et traiteurs sans site ou avec un site daté.",
    status: "en_cours", target_city: "Tourcoing", target_category: "Alimentation",
    budget_eur: 25, started_at: "2026-10-06T08:00:00Z", ended_at: null,
    is_demo: true, created_at: "2026-10-05T17:00:00Z",
  },
  {
    id: C(2), name: "Artisans et services — Mouscron (démo)",
    description: "Garages, plombiers, cordonniers côté belge.",
    status: "planifiee", target_city: "Mouscron", target_category: "Artisanat",
    budget_eur: 15, started_at: null, ended_at: null,
    is_demo: true, created_at: "2026-10-15T10:00:00Z",
  },
  {
    id: C(3), name: "Essai interne beauté (démo)",
    description: "Petit test pour calibrer le score des prospects.",
    status: "terminee", target_city: "Tourcoing", target_category: "Beauté",
    budget_eur: 5, started_at: "2026-09-28T08:00:00Z", ended_at: "2026-10-02T18:00:00Z",
    is_demo: true, created_at: "2026-09-27T09:00:00Z",
  },
];

const prospect = (
  n: number, campaign: number | null, name: string, category: string, city: string,
  postal: string, status: Prospect["status"], score: number, hasSite: boolean,
  created: string, notes: string | null = null,
): Prospect => {
  const slug = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\(fictif\)/, "").trim().replace(/[^a-z0-9]+/g, "-");
  return {
    id: P(n), campaign_id: campaign ? C(campaign) : null, name, category,
    address: `${n} rue Imaginaire`, city, postal_code: postal,
    phone: `00 00 00 00 0${n}`, email: `contact@${slug}.example`,
    current_website: hasSite ? `https://${slug}.example` : null, has_website: hasSite,
    source: "Saisie manuelle (démo)", score, status, notes, is_demo: true, created_at: created,
  };
};

const prospects: Prospect[] = [
  prospect(1, 1, "Boulangerie du Beffroi (fictif)", "Boulangerie", "Tourcoing", "59200", "demo_prete", 82, false, "2026-10-06T09:10:00Z"),
  prospect(2, 1, "Restaurant Le Petit Carillon (fictif)", "Restaurant", "Tourcoing", "59200", "interesse", 88, true, "2026-10-06T09:12:00Z", "Site actuel non adapté au mobile."),
  prospect(3, 1, "Traiteur Saveurs du Nord (fictif)", "Traiteur", "Tourcoing", "59200", "contacte", 74, false, "2026-10-06T09:15:00Z"),
  prospect(4, 1, "Fleuriste Les Jardins de Lise (fictif)", "Fleuriste", "Tourcoing", "59200", "client", 91, false, "2026-10-07T10:00:00Z", "A choisi l'abonnement mensuel."),
  prospect(5, 1, "Fromagerie de la Grand-Place (fictif)", "Fromagerie", "Tourcoing", "59200", "qualifie", 69, false, "2026-10-08T14:30:00Z"),
  prospect(6, 2, "Garage des Flandres (fictif)", "Garage", "Mouscron", "7700", "nouveau", 58, true, "2026-10-16T08:40:00Z"),
  prospect(7, 2, "Cordonnerie Express (fictif)", "Cordonnerie", "Mouscron", "7700", "nouveau", 41, false, "2026-10-16T08:45:00Z"),
  prospect(8, 3, "Institut Beauté Zen (fictif)", "Institut de beauté", "Tourcoing", "59200", "refuse", 55, true, "2026-09-28T11:00:00Z", "Déjà accompagné par une agence."),
  prospect(9, 3, "Salon Coiffure Lumière (fictif)", "Coiffeur", "Tourcoing", "59200", "ecarte", 22, true, "2026-09-28T11:05:00Z", "Site récent et correct."),
  // Exemple de prospect trouvé par l'agent de prospection (phase 2).
  {
    ...prospect(10, 1, "Plomberie du Carillon (fictif)", "Plombier-chauffagiste", "Tourcoing", "59200", "qualifie", 86, true, "2026-10-22T08:00:00Z"),
    source: "Annuaire des entreprises + fiche Google + site",
    siret: "00000000000010", naf_code: "43.22A", google_place_id: "fictif-carillon",
    website_quality: "date", email_source: "https://plomberie-du-carillon.example/contact",
    score_reason: "34 avis Google (4,7/5) mais site de 2015, sans version mobile : fort potentiel.",
  },
];

const websites: Website[] = [
  { id: W(1), prospect_id: P(1), kind: "demo", status: "pret", template: "artisan-chaleureux", url: "https://demo.devanture.example/boulangerie-du-beffroi", published_at: null, is_demo: true, created_at: "2026-10-09T10:00:00Z" },
  { id: W(2), prospect_id: P(2), kind: "demo", status: "publie", template: "restaurant-carte", url: "https://demo.devanture.example/le-petit-carillon", published_at: "2026-10-10T16:00:00Z", is_demo: true, created_at: "2026-10-09T11:00:00Z" },
  { id: W(3), prospect_id: P(3), kind: "demo", status: "publie", template: "restaurant-carte", url: "https://demo.devanture.example/saveurs-du-nord", published_at: "2026-10-11T09:00:00Z", is_demo: true, created_at: "2026-10-10T08:00:00Z" },
  { id: W(4), prospect_id: P(4), kind: "demo", status: "archive", template: "boutique-vitrine", url: "https://demo.devanture.example/jardins-de-lise", published_at: "2026-10-09T15:00:00Z", is_demo: true, created_at: "2026-10-08T09:00:00Z" },
  { id: W(5), prospect_id: P(4), kind: "production", status: "en_generation", template: "boutique-vitrine", url: null, published_at: null, is_demo: true, created_at: "2026-10-18T09:00:00Z" },
  { id: W(6), prospect_id: P(5), kind: "demo", status: "erreur", template: "artisan-chaleureux", url: null, published_at: null, is_demo: true, created_at: "2026-10-17T14:00:00Z" },
];

const emails: Email[] = [
  { id: E(1), prospect_id: P(1), campaign_id: C(1), website_id: W(1), subject: "Une vitrine en ligne pour la Boulangerie du Beffroi", body: "Bonjour, nous avons préparé une démonstration de site pour votre boulangerie… (texte fictif)", status: "a_valider", sent_at: null, is_demo: true, created_at: "2026-10-09T12:00:00Z" },
  { id: E(2), prospect_id: P(2), campaign_id: C(1), website_id: W(2), subject: "Votre carte en ligne, lisible sur téléphone", body: "Bonjour, votre site actuel s'affiche mal sur mobile… (texte fictif)", status: "valide", sent_at: null, is_demo: true, created_at: "2026-10-10T16:30:00Z" },
  { id: E(3), prospect_id: P(3), campaign_id: C(1), website_id: W(3), subject: "Saveurs du Nord : votre démonstration est prête", body: "Bonjour, voici un aperçu de ce que pourrait être votre site… (texte fictif)", status: "brouillon", sent_at: null, is_demo: true, created_at: "2026-10-11T09:30:00Z" },
];

type TaskInit = Partial<Task> & Pick<Task, "agent" | "title" | "status">;
const task = (n: number, t: TaskInit): Task => ({
  id: T(n), priority: 5, parent_task_id: null, campaign_id: null, prospect_id: null,
  website_id: null, input: {}, output: null, attempts: t.status === "en_attente" ? 0 : 1,
  max_attempts: 3, error_message: null, tokens_input: 0, tokens_output: 0,
  scheduled_at: t.started_at ?? "2026-10-19T08:00:00Z", started_at: null, finished_at: null,
  is_demo: true, created_at: t.started_at ?? "2026-10-19T08:00:00Z", ...t,
});

const tasks: Task[] = [
  task(1, { agent: "orchestrateur", title: "Planifier la campagne Tourcoing centre", status: "terminee", campaign_id: C(1), started_at: "2026-10-06T08:00:00Z", finished_at: "2026-10-06T08:01:10Z", tokens_input: 3200, tokens_output: 900 }),
  task(2, { agent: "prospection", title: "Rechercher des commerces de bouche à Tourcoing", status: "terminee", parent_task_id: T(1), campaign_id: C(1), started_at: "2026-10-06T08:02:00Z", finished_at: "2026-10-06T08:09:30Z", tokens_input: 18400, tokens_output: 4100, output: { prospects_trouves: 5 } }),
  task(3, { agent: "site_demo", title: "Démo — Boulangerie du Beffroi", status: "terminee", parent_task_id: T(1), campaign_id: C(1), prospect_id: P(1), website_id: W(1), started_at: "2026-10-09T09:40:00Z", finished_at: "2026-10-09T09:52:00Z", tokens_input: 22000, tokens_output: 15800 }),
  task(4, { agent: "site_demo", title: "Démo — Restaurant Le Petit Carillon", status: "terminee", parent_task_id: T(1), campaign_id: C(1), prospect_id: P(2), website_id: W(2), started_at: "2026-10-09T10:40:00Z", finished_at: "2026-10-09T10:55:00Z", tokens_input: 24500, tokens_output: 17200 }),
  task(5, { agent: "email", title: "Rédiger l'e-mail — Boulangerie du Beffroi", status: "terminee", campaign_id: C(1), prospect_id: P(1), website_id: W(1), started_at: "2026-10-09T11:58:00Z", finished_at: "2026-10-09T12:00:00Z", tokens_input: 4100, tokens_output: 650 }),
  task(6, { agent: "site_demo", title: "Démo — Fromagerie de la Grand-Place", status: "echouee", campaign_id: C(1), prospect_id: P(5), website_id: W(6), attempts: 3, error_message: "Délai dépassé lors de la génération des images (simulation).", started_at: "2026-10-17T13:50:00Z", finished_at: "2026-10-17T14:12:00Z", tokens_input: 19800, tokens_output: 6100 }),
  task(7, { agent: "site_production", title: "Site définitif — Fleuriste Les Jardins de Lise", status: "en_cours", prospect_id: P(4), website_id: W(5), priority: 8, started_at: "2026-10-18T09:00:00Z", tokens_input: 31000, tokens_output: 12400 }),
  task(8, { agent: "email", title: "Rédiger l'e-mail — Traiteur Saveurs du Nord", status: "terminee", campaign_id: C(1), prospect_id: P(3), website_id: W(3), started_at: "2026-10-11T09:28:00Z", finished_at: "2026-10-11T09:30:00Z", tokens_input: 3900, tokens_output: 610 }),
  task(9, { agent: "prospection", title: "Rechercher des artisans à Mouscron", status: "en_attente", campaign_id: C(2), scheduled_at: "2026-10-21T08:00:00Z", created_at: "2026-10-16T08:30:00Z" }),
  task(10, { agent: "email", title: "Rédiger l'e-mail — Fromagerie de la Grand-Place", status: "annulee", campaign_id: C(1), prospect_id: P(5), attempts: 0, started_at: "2026-10-17T14:13:00Z", error_message: "Annulée : la démo associée a échoué." }),
  task(11, { agent: "prospection", title: "Rechercher des instituts de beauté (essai)", status: "echouee", campaign_id: C(3), attempts: 1, max_attempts: 1, error_message: "Clé API de recherche manquante (simulation).", started_at: "2026-09-28T08:00:00Z", finished_at: "2026-09-28T08:00:04Z" }),
  task(12, { agent: "site_demo", title: "Démo — Traiteur Saveurs du Nord", status: "terminee", campaign_id: C(1), prospect_id: P(3), website_id: W(3), attempts: 2, started_at: "2026-10-10T07:50:00Z", finished_at: "2026-10-10T08:20:00Z", tokens_input: 41000, tokens_output: 21000 }),
];

const ev = (n: number, taskN: number, level: TaskEvent["level"], message: string, at: string): TaskEvent =>
  ({ id: n, task_id: T(taskN), level, message, details: null, is_demo: true, created_at: at });

const taskEvents: TaskEvent[] = [
  ev(1, 2, "info", "5 commerces correspondent aux critères.", "2026-10-06T08:09:30Z"),
  ev(2, 6, "warning", "Tentative 1 : image d'en-tête trop lente à générer.", "2026-10-17T13:58:00Z"),
  ev(3, 6, "warning", "Tentative 2 : même problème, nouvel essai.", "2026-10-17T14:05:00Z"),
  ev(4, 6, "error", "Tentative 3 : abandon après 3 essais.", "2026-10-17T14:12:00Z"),
  ev(5, 7, "info", "Structure du site validée, rédaction des pages en cours.", "2026-10-18T09:20:00Z"),
  ev(6, 11, "error", "Variable d'environnement manquante pour l'API de recherche.", "2026-09-28T08:00:04Z"),
  ev(7, 12, "warning", "Tentative 1 échouée : réponse incomplète, relance automatique.", "2026-10-10T08:02:00Z"),
  ev(8, 12, "info", "Tentative 2 réussie.", "2026-10-10T08:20:00Z"),
];

const cost = (n: number, taskN: number | null, campaignN: number | null, provider: string,
  category: Cost["category"], amount: number, description: string, at: string): Cost => ({
  id: K(n), task_id: taskN ? T(taskN) : null, campaign_id: campaignN ? C(campaignN) : null,
  provider, category, amount_eur: amount, description, incurred_at: at, is_demo: true, created_at: at,
});

const costs: Cost[] = [
  cost(1, 1, 1, "anthropic", "api", 0.03, "Planification (fictif)", "2026-10-06T08:01:10Z"),
  cost(2, 2, 1, "anthropic", "api", 0.12, "Recherche de prospects (fictif)", "2026-10-06T08:09:30Z"),
  cost(3, 3, 1, "anthropic", "api", 0.31, "Génération démo (fictif)", "2026-10-09T09:52:00Z"),
  cost(4, 4, 1, "anthropic", "api", 0.34, "Génération démo (fictif)", "2026-10-09T10:55:00Z"),
  cost(5, 5, 1, "anthropic", "api", 0.02, "Rédaction e-mail (fictif)", "2026-10-09T12:00:00Z"),
  cost(6, 8, 1, "anthropic", "api", 0.02, "Rédaction e-mail (fictif)", "2026-10-11T09:30:00Z"),
  cost(7, 12, 1, "anthropic", "api", 0.52, "Génération démo, 2 tentatives (fictif)", "2026-10-10T08:20:00Z"),
  cost(8, 6, 1, "anthropic", "api", 0.21, "Démo échouée (fictif)", "2026-10-17T14:12:00Z"),
  cost(9, 7, null, "anthropic", "api", 0.41, "Site définitif, en cours (fictif)", "2026-10-18T12:00:00Z"),
  cost(10, null, null, "registrar-fictif", "domaine", 8.99, "Nom de domaine client (fictif)", "2026-10-18T09:05:00Z"),
  cost(11, null, null, "hebergeur-fictif", "hebergement", 5.0, "Hébergement mensuel (fictif)", "2026-10-01T00:00:00Z"),
  cost(12, null, 3, "anthropic", "api", 0.08, "Essai beauté (fictif)", "2026-09-29T10:00:00Z"),
];

const opposition: OppositionEntry[] = [
  { id: O(1), email: "contact@institut-beaute-zen.example", domain: null, business_name: "Institut Beauté Zen (fictif)",
    reason: "refus", notes: "A répondu « non merci, ne plus m'écrire ».", is_demo: true, created_at: "2026-10-03T09:00:00Z" },
  { id: O(2), email: null, domain: "chaine-fictive.example", business_name: "Chaîne de magasins (fictif)",
    reason: "manuel", notes: "Franchise : décisions prises au siège, inutile de démarcher.", is_demo: true, created_at: "2026-10-12T15:30:00Z" },
];

export const demoData: DashboardData = {
  campaigns, prospects, websites, emails, tasks, taskEvents, costs, opposition,
  // Budget volontairement bas en démo, pour voir à quoi ressemble l'alerte.
  settings: { ai_monthly_budget_eur: 2.4, ai_alert_ratio: 0.8 },
};

/** Boîte mail fictive (mode démo) : une réponse intéressée à valider, une question réglée seule, un STOP. */
const msg = (m: Partial<MailboxMessage> & Pick<MailboxMessage, "id" | "direction" | "status" | "created_at">): MailboxMessage => ({
  thread_id: null, prospect_id: null, email_id: null, reply_to_id: null, from_email: null, from_name: null, to_email: null,
  subject: "", body_text: "", attachments: [], auto_submitted: false, category: null, summary: null, review_reason: null,
  sent_by: null, received_at: null, sent_at: null, error_message: null, is_demo: true, updated_at: m.created_at, ...m,
});

export const demoMailbox: MailboxMessage[] = [
  msg({ id: M(1), direction: "entrant", status: "traite", thread_id: M(1), prospect_id: P(2), category: "interesse",
    from_email: "contact@restaurant-le-petit-carillon.example", from_name: "Claire (fictif)",
    subject: "Re: Une maquette de site pour Le Petit Carillon", created_at: "2026-10-27T08:12:00Z", received_at: "2026-10-27T08:12:00Z",
    summary: "Préfère le style chaleureux et demande le prix.",
    body_text: "Bonjour,\n\nLe style chaleureux me plaît beaucoup. Ça coûterait combien pour le mettre en ligne ?\n\nClaire" }),
  msg({ id: M(2), direction: "sortant", status: "a_valider", thread_id: M(1), prospect_id: P(2), reply_to_id: M(1), category: "interesse",
    to_email: "contact@restaurant-le-petit-carillon.example", subject: "Re: Une maquette de site pour Le Petit Carillon",
    created_at: "2026-10-27T08:13:00Z", review_reason: "artisan intéressé : à toi de conclure · sujet sensible : prix ou tarif",
    body_text: "Bonjour,\n\nMerci pour votre retour, ravi que le style chaleureux vous plaise. Deux formules existent : Essentiel à 390 € puis 19 € par mois, ou Pro à 690 € puis 39 € par mois. Pour vous, l'Essentiel suffit largement. Voulez-vous que je vous envoie le détail ?\n\nBien cordialement,\nAmbroise Le Clerc\nDevanture" }),
  msg({ id: M(3), direction: "entrant", status: "traite", thread_id: M(3), prospect_id: P(3), category: "question",
    from_email: "contact@traiteur-saveurs-du-nord.example", subject: "Re: Votre maquette",
    created_at: "2026-10-26T15:40:00Z", received_at: "2026-10-26T15:40:00Z", summary: "Ne trouve pas le lien de la maquette.",
    body_text: "Bonjour, je ne trouve pas le lien pour voir la maquette." }),
  msg({ id: M(4), direction: "sortant", status: "envoye", thread_id: M(3), prospect_id: P(3), reply_to_id: M(3), sent_by: "agent", category: "question",
    to_email: "contact@traiteur-saveurs-du-nord.example", subject: "Re: Votre maquette", created_at: "2026-10-26T15:41:00Z", sent_at: "2026-10-26T15:42:00Z",
    body_text: "Bonjour,\n\nLe lien est dans mon premier message, juste au-dessus de la question. Il s'ouvre sur ordinateur comme sur téléphone.\n\nBien cordialement,\nAmbroise Le Clerc\nDevanture" }),
  msg({ id: M(5), direction: "entrant", status: "traite", thread_id: M(5), category: "stop", from_email: "gerant@garage-fictif.example",
    subject: "STOP", created_at: "2026-10-26T10:05:00Z", received_at: "2026-10-26T10:05:00Z",
    summary: "Demande à ne plus être contacté : ajouté à la liste d'opposition.", body_text: "STOP" }),
];
