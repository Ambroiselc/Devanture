// Point d'entrée unique pour lire les données du tableau de bord.
// • Supabase configuré → lecture dans la base (protégée par la RLS).
// • Sinon → données fictives de lib/demo-data.ts.
import "server-only";
import { cache } from "react";
import { demoData, demoMailbox } from "./demo-data";
import { createClient } from "./supabase/server";
import { isSupabaseConfigured } from "./supabase/config";
import { visitesDe, detailsOuvertures, type Ouverte, type VisiteMaquette } from "./visites-maquettes";
import { visitesSite, type VisiteSite } from "./visites-site";
import { interetsRecents, type Interet } from "./interets";
import type { AgentSettings, AppSettings, DashboardData, MailboxMessage, Prospect, ProspectStatus } from "./types";

export type DataResult =
  | { mode: "demo"; data: DashboardData }
  | { mode: "supabase"; data: DashboardData }
  | { mode: "error"; message: string };

const LIMIT = 500; // les lignes les plus récentes de chaque table (voir getComptesProspects pour les comptes justes)


/** Réglages par défaut si la ligne n'existe pas encore (migration pas encore lancée). */
export const defaultSettings: AppSettings = { ai_monthly_budget_eur: 20, ai_alert_ratio: 0.8 };

/** Tables que getData peut lire (3/11) : chaque page ne demande que celles qu'elle affiche. */
export type Partie = "campaigns" | "prospects" | "websites" | "emails" | "tasks" | "taskEvents" | "costs" | "opposition";
const TOUTES: Partie[] = ["campaigns", "prospects", "websites", "emails", "tasks", "taskEvents", "costs", "opposition"];

// cache() : un seul chargement par affichage de page, même si plusieurs composants le demandent.
export const loadDashboardData = cache(async (): Promise<DataResult> => chargerParties(TOUTES.join(",")));

// 3/11 (erreur Cloudflare 1102, plan gratuit = 10 ms de calcul par page) : on ne lit et ne décode que les tables
// demandées. Les autres restent vides. La clé est une chaîne pour que cache() reconnaisse la même demande.
const chargerParties = cache(async (cle: string): Promise<DataResult> => {
  if (!isSupabaseConfigured) return { mode: "demo", data: demoData };
  const voulu = new Set(cle.split(","));
  const vide = Promise.resolve({ data: [] as never[], error: null });
  const si = <T,>(partie: Partie, q: () => PromiseLike<T>) => (voulu.has(partie) ? q() : vide) as PromiseLike<T>;

  const supabase = await createClient();
  const [campaigns, prospects, websites, emails, tasks, taskEvents, costs, opposition, settings] = await Promise.all([
    // 27/10 après-midi : retour aux 500 lignes les plus récentes. Tout lire dépassait le temps de calcul que
    // Cloudflare accorde à chaque page (erreur 1102). Les comptes justes viennent de la base (getComptesProspects,
    // getBudgetIa) et la page Prospects lit elle-même les prospects du filtre choisi (getProspectsFiltres).
    si("campaigns", () => supabase.from("campaigns").select("*").order("created_at", { ascending: false }).limit(LIMIT)),
    si("prospects", () => supabase.from("prospects").select("*").order("created_at", { ascending: false }).limit(LIMIT)),
    // 30/10 : SANS la colonne « content » (les textes complets de chaque maquette, plusieurs Ko chacune) : lue à
    // chaque page, elle a fait dépasser le temps de calcul de Cloudflare (erreur 1102) quand les maquettes sont
    // devenues nombreuses. Les pages n'ont besoin que de savoir si le contenu existe : « nom » suffit.
    si("websites", () => supabase.from("websites")
      .select("id, prospect_id, kind, status, template, url, published_at, slug, is_demo, created_at, updated_at, vues, premiere_vue, derniere_vue, nom:content->>nom")
      .order("created_at", { ascending: false }).limit(LIMIT)),
    // 30/10 : sans le texte (« body », plus d'1 Ko par e-mail) ; il est relu juste après, seulement pour les
    // e-mails à relire (page Valérie). La boîte mail lit le texte d'un e-mail de prospection quand on ouvre son fil.
    si("emails", () => supabase.from("emails")
      .select("id, prospect_id, campaign_id, website_id, subject, status, sent_at, is_demo, created_at, updated_at, variant, with_image, provider_id, delivery_status, delivery_checked_at, sender, relance_de, coco_verdict, coco_avis, coco_le")
      .order("created_at", { ascending: false }).limit(LIMIT)),
    // 2/11 : sans « input » (jamais affiché, parfois volumineux) ; remis à {} plus bas.
    si("tasks", () => supabase.from("tasks")
      .select("id, agent, title, status, priority, parent_task_id, campaign_id, prospect_id, website_id, output, attempts, max_attempts, error_message, tokens_input, tokens_output, scheduled_at, started_at, finished_at, is_demo, created_at, updated_at")
      .order("created_at", { ascending: false }).limit(LIMIT)),
    si("taskEvents", () => supabase.from("task_events").select("*").order("created_at", { ascending: false }).limit(LIMIT)),
    si("costs", () => supabase.from("costs").select("*").order("incurred_at", { ascending: false }).limit(LIMIT)),
    si("opposition", () => supabase.from("opposition_list").select("*").order("created_at", { ascending: false }).limit(1000)),
    supabase.from("app_settings").select("ai_monthly_budget_eur, ai_alert_ratio").maybeSingle(),
  ]);

  const failed = [campaigns, prospects, websites, emails, tasks, taskEvents, costs, opposition, settings].find((r) => r.error);
  if (failed?.error) {
    return { mode: "error", message: failed.error.message };
  }
  const textes = voulu.has("emails")
    ? await supabase.from("emails").select("id, body").in("status", ["brouillon", "a_valider"])
      .order("created_at", { ascending: false }).limit(150)
    : { data: [] as { id: string; body: string }[] };
  const texteDe = new Map((textes.data ?? []).map((t) => [t.id as string, t.body as string]));

  return {
    mode: "supabase",
    data: {
      campaigns: (campaigns.data ?? []).map((c) => ({
        ...c, budget_eur: c.budget_eur === null ? null : Number(c.budget_eur),
      })),
      prospects: prospects.data ?? [],
      // « content » vaut le nom affiché (texte) quand la maquette a ses textes, sinon null : assez pour les pages.
      websites: (websites.data ?? []).map(({ nom, ...w }) => ({ ...w, content: nom ?? null })),
      emails: (emails.data ?? []).map((e) => ({ ...e, body: texteDe.get(e.id) ?? "" })) as DashboardData["emails"],
      tasks: (tasks.data ?? []).map((t) => ({ ...t, input: {} })),
      taskEvents: taskEvents.data ?? [],
      // Postgres renvoie les « numeric » en texte : on les convertit en nombres.
      costs: (costs.data ?? []).map((c) => ({ ...c, amount_eur: Number(c.amount_eur) })),
      opposition: opposition.data ?? [],
      settings: settings.data
        ? {
            ai_monthly_budget_eur: Number(settings.data.ai_monthly_budget_eur),
            ai_alert_ratio: Number(settings.data.ai_alert_ratio),
          }
        : defaultSettings,
    },
  };
});

/**
 * Données du MENU (30/10), lues à chaque page : seulement les tâches des 14 derniers jours (colonnes utiles).
 * Le reste de DashboardData est vide ; le budget vient de getBudgetIa. Les pages qui ont besoin de tout appellent getData.
 */
export const getMenuData = cache(async (): Promise<DataResult> => {
  if (!isSupabaseConfigured) return { mode: "demo", data: demoData };
  const supabase = await createClient();
  const depuis = new Date(Date.now() - 14 * 86_400_000).toISOString();
  // 3/11 (1102) : plus de liste de 300 tâches à chaque page. Seulement les échecs des 14 j (pour la pastille) et la
  // dernière réussite de chaque agent (pour savoir si l'échec est réglé), en colonnes courtes.
  const [echecs, reussites] = await Promise.all([
    supabase.from("tasks").select("id, agent, status, error_message, finished_at, created_at")
      .eq("status", "echouee").gte("created_at", depuis).order("created_at", { ascending: false }).limit(40),
    supabase.from("tasks").select("id, agent, status, finished_at, created_at")
      .eq("status", "terminee").gte("created_at", depuis).order("finished_at", { ascending: false, nullsFirst: false }).limit(150),
  ]);
  const error = echecs.error ?? reussites.error;
  if (error) return { mode: "error", message: error.message };
  // Une réussite par agent suffit (la plus récente).
  const vus = new Set<string>();
  const dernieres = (reussites.data ?? []).filter((t) => (vus.has(t.agent as string) ? false : (vus.add(t.agent as string), true)));
  const data = [...(echecs.data ?? []), ...dernieres];
  return {
    mode: "supabase",
    data: { campaigns: [], prospects: [], websites: [], emails: [], tasks: data as unknown as DashboardData["tasks"], taskEvents: [],
      costs: [], opposition: [], settings: defaultSettings },
  };
});

/** Pastille de la page Inès : réponses à valider ou en erreur, messages reçus à traiter (comptés par la base). */
export const getMailCount = cache(async (): Promise<number> => {
  if (!isSupabaseConfigured) {
    return demoMailbox.filter((m) => (m.direction === "sortant" && (m.status === "a_valider" || m.status === "erreur"))
      || (m.direction === "entrant" && m.status === "a_traiter")).length;
  }
  const supabase = await createClient();
  const [sortants, entrants] = await Promise.all([
    supabase.from("mailbox_messages").select("id", { count: "exact", head: true }).eq("direction", "sortant").in("status", ["a_valider", "erreur"]),
    supabase.from("mailbox_messages").select("id", { count: "exact", head: true }).eq("direction", "entrant").eq("status", "a_traiter"),
  ]);
  return (sortants.count ?? 0) + (entrants.count ?? 0);
});

/** Données prêtes à afficher (listes vides si la lecture a échoué). */
export async function getData(...parties: Partie[]): Promise<DashboardData> {
  // 3/11 : sans argument, tout est lu (comme avant) ; avec, seulement les tables demandées.
  const result = parties.length ? await chargerParties([...new Set(parties)].sort().join(",")) : await loadDashboardData();
  return result.mode === "error"
    ? { campaigns: [], prospects: [], websites: [], emails: [], tasks: [], taskEvents: [], costs: [],
        opposition: [], settings: defaultSettings }
    : result.data;
}

/** Vérifie que l'utilisateur connecté est dans la table app_admins. */
export const getAccess = cache(async (): Promise<{ email: string | null; isAdmin: boolean } | null> => {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { email: null, isAdmin: false };
  const { data: row } = await supabase
    .from("app_admins").select("user_id").eq("user_id", claims.sub).maybeSingle();
  return { email: (claims.email as string | undefined) ?? null, isAdmin: Boolean(row) };
});

/** Réglages par défaut de Loïc (mode démo, ou migration « reglages_loic » pas encore lancée). */
export const defaultLoicSettings: AgentSettings = {
  agent: "prospection",
  display_name: "Loïc",
  enabled: true,
  auto_enabled: false,
  metiers: ["plombier", "electricien", "couvreur", "peintre", "menuisier", "serrurier", "macon", "carreleur",
    "plaquiste", "climatisation", "paysagiste"],
  communes: null,
  default_limit: 20,
  max_google_day: 200,
  max_google_month: 900,
  score_qualified: 60,
  score_discarded: 40,
  instructions: null,
  updated_at: null,
};

/**
 * Réglages de Loïc, l'agent de prospection.
 * `ready = false` : la table n'existe pas encore (migration à lancer) ou mode démo.
 */
export const getLoicSettings = cache(async (): Promise<{ settings: AgentSettings; ready: boolean }> => {
  if (!isSupabaseConfigured) return { settings: defaultLoicSettings, ready: false };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_settings").select("*").eq("agent", "prospection").maybeSingle();
  if (error || !data) return { settings: defaultLoicSettings, ready: false };
  return { settings: data as AgentSettings, ready: true };
});

/** Réglages par défaut de Valérie, l'agente des e-mails (mode démo, ou migration « valerie » pas encore lancée). */
export const defaultValerieSettings: AgentSettings = {
  ...defaultLoicSettings,
  agent: "email",
  display_name: "Valérie",
  default_limit: 10,
  send_enabled: false,
  send_max_per_day: 50,
  instructions: null,
  signature: "Prénom Nom\nDevanture — sites web pour les artisans",
};

/** Réglages de Valérie. `ready = false` : migration à lancer, ou mode démo. */
export const getValerieSettings = cache(async (): Promise<{ settings: AgentSettings; ready: boolean }> => {
  if (!isSupabaseConfigured) return { settings: defaultValerieSettings, ready: false };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_settings").select("*").eq("agent", "email").maybeSingle();
  if (error || !data) return { settings: defaultValerieSettings, ready: false };
  return { settings: data as AgentSettings, ready: true };
});

/** Réglages par défaut d'Inès, l'agente de la boîte mail (mode démo, ou migration « boite_mail » pas encore lancée). */
export const defaultBoiteSettings: AgentSettings = {
  ...defaultLoicSettings,
  agent: "boite",
  display_name: "Inès",
  default_limit: 50,
  instructions: null,
  signature: "Ambroise Le Clerc\nDevanture — sites web pour les artisans\nhttps://devanture-artisans.fr",
  auto_reply_enabled: true,
  auto_reply_max_per_day: 20,
};

/** Réglages d'Inès. `ready = false` : migration à lancer, ou mode démo. */
export const getBoiteSettings = cache(async (): Promise<{ settings: AgentSettings; ready: boolean }> => {
  if (!isSupabaseConfigured) return { settings: defaultBoiteSettings, ready: false };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_settings").select("*").eq("agent", "boite").maybeSingle();
  if (error || !data) return { settings: defaultBoiteSettings, ready: false };
  return { settings: data as AgentSettings, ready: true };
});

/** Messages de la boîte mail (les plus récents d'abord). `ready = false` : table absente ou mode démo. */
export const getMailbox = cache(async (): Promise<{ messages: MailboxMessage[]; ready: boolean }> => {
  if (!isSupabaseConfigured) return { messages: demoMailbox, ready: true };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mailbox_messages")
    .select("id, direction, thread_id, prospect_id, email_id, reply_to_id, from_email, from_name, to_email, subject, body_text, attachments, auto_submitted, category, summary, status, review_reason, sent_by, received_at, sent_at, error_message, is_demo, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (error) return { messages: [], ready: false };
  return { messages: (data ?? []) as MailboxMessage[], ready: true };
});

/**
 * Comptes justes sur TOUS les prospects, calculés par la base (rien n'est téléchargé : seulement des nombres).
 * Sert aux onglets de la page Prospects et au parcours de la vue d'ensemble.
 */
export const getComptesProspects = cache(async (): Promise<{
  total: number;
  parStatut: Record<ProspectStatus, number>;
  /** Trouvés par l'agent (SIRET ou fiche Google), écartés compris. */
  trouves: number;
  /** Trouvés par l'agent et retenus (hors écartés). */
  parAgent: number;
  parAgentAvecEmail: number;
} | null> => {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const statuts: ProspectStatus[] = ["nouveau", "qualifie", "demo_prete", "contacte", "interesse", "client", "refuse", "ecarte"];
  const compter = (f?: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => {
    const q = base();
    return (f ? f(q) : q).then((r) => r.count ?? 0);
  };
  function base() {
    return supabase.from("prospects").select("id", { count: "exact", head: true });
  }
  const trouvesQ = (q: ReturnType<typeof base>) => q.or("siret.not.is.null,google_place_id.not.is.null");
  const parAgentQ = (q: ReturnType<typeof base>) => trouvesQ(q).neq("status", "ecarte");
  const [total, trouves, parAgent, parAgentAvecEmail, ...n] = await Promise.all([
    compter(),
    compter(trouvesQ),
    compter(parAgentQ),
    compter((q) => parAgentQ(q).not("email", "is", null)),
    ...statuts.map((st) => compter((q) => q.eq("status", st))),
  ]);
  return { total, trouves, parAgent, parAgentAvecEmail, parStatut: Object.fromEntries(statuts.map((st, i) => [st, n[i]])) as Record<ProspectStatus, number> };
});

/**
 * 9/11 : le nom et l'adresse de prospects précis, lus par leur identifiant. Sert à la boîte mail : getData ne
 * lit que les 500 prospects les plus récents, donc les artisans contactés plus tôt (relances surtout) s'y
 * affichaient « Prospect ». Deux colonnes seulement, par paquets de 100 identifiants.
 */
export async function getNomsProspects(ids: string[]): Promise<Map<string, { name: string; email: string | null }>> {
  const noms = new Map<string, { name: string; email: string | null }>();
  const uniques = [...new Set(ids.filter(Boolean))];
  if (!isSupabaseConfigured || !uniques.length) return noms;
  const supabase = await createClient();
  const paquets: string[][] = [];
  for (let i = 0; i < uniques.length; i += 100) paquets.push(uniques.slice(i, i + 100));
  const reponses = await Promise.all(paquets.map((p) => supabase.from("prospects").select("id, name, email").in("id", p)));
  for (const r of reponses) for (const p of r.data ?? []) noms.set(p.id as string, { name: p.name as string, email: (p.email as string | null) ?? null });
  return noms;
}

/**
 * 25/11 : les e-mails de prospection PARTIS, les plus récents d'abord (par date d'envoi).
 * getData("emails") lit les 500 derniers e-mails CRÉÉS : avec plus de 1 000 e-mails validés en attente, les e-mails
 * envoyés aujourd'hui mais rédigés il y a plusieurs jours (Valérie envoie les mieux notés d'abord) n'y étaient pas,
 * et manquaient dans le dossier « Envoyés » de la boîte mail.
 */
export async function getEmailsEnvoyes(limite = 300): Promise<DashboardData["emails"]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("emails")
    .select("id, prospect_id, campaign_id, website_id, subject, status, sent_at, is_demo, created_at, updated_at, variant, with_image, provider_id, delivery_status, delivery_checked_at, sender, relance_de, coco_verdict, coco_avis, coco_le")
    .in("status", ["envoye", "repondu"]).not("sent_at", "is", null)
    .order("sent_at", { ascending: false }).limit(limite);
  if (error) return [];
  return (data ?? []).map((e) => ({ ...e, body: "" })) as unknown as DashboardData["emails"];
}

/** Les prospects d'un statut (ou tous), les mieux notés d'abord, lus directement dans la base. */
export async function getProspectsFiltres(statut: ProspectStatus | undefined, limite = 300): Promise<Prospect[] | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  let q = supabase.from("prospects").select("*").order("score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false }).limit(limite);
  if (statut) q = q.eq("status", statut);
  const { data, error } = await q;
  return error ? null : ((data ?? []) as Prospect[]);
}

/** Dépenses IA du mois, calculées par la base (vue ai_budget_status). null = pas disponible (mode démo). */
export const getBudgetIa = cache(async (): Promise<{ spent: number; budget: number; alerte: number } | null> => {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("ai_budget_status").select("budget_eur, spent_eur, alert_ratio").maybeSingle();
  if (error || !data) return null;
  return { spent: Number(data.spent_eur), budget: Number(data.budget_eur), alerte: Number(data.alert_ratio) };
});

/**
 * Données de la VUE D'ENSEMBLE (2/11) : erreur Cloudflare 1102 persistante sur cette page, qui lisait toute getData()
 * (500 prospects complets, 500 tâches avec leurs entrées/sorties, 500 lignes de journal, 150 textes d'e-mails…).
 * Ici : seulement les colonnes utiles, les comptes faits par la base, et les erreurs des 14 derniers jours.
 */
export const getVueEnsemble = cache(async (): Promise<{
  tasks: DashboardData["tasks"];
  taskEvents: DashboardData["taskEvents"];
  costs: DashboardData["costs"];
  settings: AppSettings;
  emailsValides: number;
  emailsAValider: number;
  demosEnLigne: number;
  /** Maquettes ouvertes par les artisans (2/11) : total, artisans contactés et les dernières ouvertes. */
  nbOuvertes: number;
  nbContactes: number;
  ouvertes: Ouverte[];
  /** Visites du site vitrine (2/11), 30 derniers jours ; null si la migration n'est pas encore appliquée. */
  site: { jour: string; page: string; source: string; visites: number }[] | null;
  /** Message d'erreur si les visites du site n'ont pas pu être lues (affiché dans le panneau). */
  siteErreur: string | null;
  /** 13/11 : détail des 30 dernières visites du site vitrine ; null si la migration du 13/11 n'est pas appliquée. */
  siteDetail: VisiteSite[] | null;
  /** 13/11 : artisans qui ont cliqué « Ce site m'intéresse » (20 derniers). */
  interets: Interet[];
  /** Tâches en attente ou en cours (compte fait par la base). */
  enCours: number;
} | null> => {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const depuis = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const compte = (r: { count: number | null }) => r.count ?? 0;
  const depuis30 = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  // 2/11 soir (1102 de nouveau) : plus de liste de 300 tâches ni de 500 coûts. Seulement les tâches utiles à l'affichage
  // (8 dernières, échecs et réussites des 14 j, colonnes courtes), les coûts DU MOIS avec l'agent joint par la base,
  // et le nombre de tâches en cours compté par la base.
  const cols = "id, agent, title, status, error_message, is_demo, started_at, scheduled_at, finished_at, created_at";
  const debutMois = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [recentes, echecs, succes, enCours, events, costs, settings, valides, aValider, demos, vues, contactes, site] = await Promise.all([
    supabase.from("tasks").select(cols).order("created_at", { ascending: false }).limit(8),
    supabase.from("tasks").select(cols).eq("status", "echouee").gte("created_at", depuis)
      .order("created_at", { ascending: false }).limit(40),
    supabase.from("tasks").select("id, agent, status, title, is_demo, started_at, scheduled_at, finished_at, created_at, error_message")
      .eq("status", "terminee").gte("created_at", depuis).order("created_at", { ascending: false }).limit(150),
    supabase.from("tasks").select("id", { count: "exact", head: true }).in("status", ["en_cours", "en_attente"]),
    supabase.from("task_events").select("id, task_id, level, message, is_demo, created_at")
      .eq("level", "error").gte("created_at", depuis).order("created_at", { ascending: false }).limit(40),
    supabase.from("costs").select("id, task_id, amount_eur, incurred_at, tasks(agent)")
      .gte("incurred_at", debutMois).order("incurred_at", { ascending: false }).limit(1000),
    supabase.from("app_settings").select("ai_monthly_budget_eur, ai_alert_ratio").maybeSingle(),
    supabase.from("emails").select("id", { count: "exact", head: true }).eq("status", "valide"),
    supabase.from("emails").select("id", { count: "exact", head: true }).eq("status", "a_valider"),
    supabase.from("websites").select("id", { count: "exact", head: true }).eq("kind", "demo").in("status", ["pret", "publie"]),
    supabase.from("websites").select("id, slug, vues, premiere_vue, derniere_vue, prospects!inner(id, name, city, email)", { count: "exact" })
      .eq("kind", "demo").gt("vues", 0).order("derniere_vue", { ascending: false }).limit(6),
    // Premiers e-mails envoyés (hors relances) : un par artisan contacté.
    supabase.from("emails").select("id", { count: "exact", head: true }).not("sent_at", "is", null).is("relance_de", null),
    supabase.from("site_visites").select("jour, page, source, visites").gte("jour", depuis30).limit(2000),
  ]);
  if (recentes.error || echecs.error || succes.error || events.error || costs.error) return null;
  // 5/11 : durée de chaque ouverture, pour les 6 maquettes affichées seulement.
  const [visitesParSite, siteDetail, interets] = await Promise.all([
    visitesDe(supabase, vues.error ? [] : (vues.data ?? []).map((w) => w.id as string)),
    visitesSite(supabase),
    interetsRecents(supabase),
  ]);
  const pros = (w: { prospects: unknown }) => (Array.isArray(w.prospects) ? w.prospects[0] : w.prospects) as
    { id: string; name: string; city: string | null; email: string | null } | null;
  const details = await detailsOuvertures(supabase, vues.error ? [] : (vues.data ?? []).map(pros).filter((p) => p !== null)
    .map((p) => ({ id: p.id, email: p.email })));
  const vus = new Set<string>();
  const tasks = [...(recentes.data ?? []), ...(echecs.data ?? []), ...(succes.data ?? [])]
    .filter((t) => (vus.has(t.id as string) ? false : (vus.add(t.id as string), true)));
  // Les tâches des lignes « erreur » du journal (nom, agent) : sans elles, la page affichait « Tâche inconnue »
  // et ne savait pas que l'agent avait retravaillé normalement depuis (erreur « réglée »).
  const manquantes = [...new Set((events.data ?? []).map((e) => e.task_id as string))].filter((id) => !vus.has(id));
  if (manquantes.length) {
    const { data } = await supabase.from("tasks").select(cols).in("id", manquantes);
    tasks.push(...(data ?? []));
  }
  return {
    tasks: tasks as unknown as DashboardData["tasks"],
    taskEvents: (events.data ?? []) as unknown as DashboardData["taskEvents"],
    costs: (costs.data ?? []).map(({ tasks: t, ...c }) => ({
      ...c, amount_eur: Number(c.amount_eur),
      agent: ((Array.isArray(t) ? t[0] : t) as { agent: string } | null)?.agent ?? null,
    })) as unknown as DashboardData["costs"],
    enCours: compte(enCours),
    settings: settings.data
      ? { ai_monthly_budget_eur: Number(settings.data.ai_monthly_budget_eur), ai_alert_ratio: Number(settings.data.ai_alert_ratio) }
      : defaultSettings,
    emailsValides: compte(valides),
    emailsAValider: compte(aValider),
    demosEnLigne: compte(demos),
    nbOuvertes: vues.error ? 0 : compte(vues),
    nbContactes: contactes.error ? 0 : compte(contactes),
    ouvertes: vues.error ? [] : (vues.data ?? []).map((w) => {
      const p = pros(w);
      const d = p ? details.get(p.id) : undefined;
      return { name: p?.name ?? "?", city: p?.city ?? null, vues: w.vues as number, premiere: (w.premiere_vue as string | null) ?? null, derniere: w.derniere_vue as string,
               visites: visitesParSite.get(w.id as string) ?? [], slug: (w.slug as string | null) ?? null,
               fournisseur: d?.fournisseur ?? null, emailId: d?.emailId ?? null, envois: d?.envois ?? [] };
    }),
    site: site.error ? null : (site.data ?? []) as { jour: string; page: string; source: string; visites: number }[],
    siteErreur: site.error ? site.error.message : null,
    siteDetail,
    interets,
  };
});

/**
 * Page d'accueil d'UNE campagne (26/11, demande de Broise) : la vue d'ensemble limitée à ses prospects.
 * Comptes par la base (en-têtes `count`) ou sur des colonnes courtes ; null en mode démo ou si la campagne n'existe pas.
 */
export const getVueCampagne = cache(async (id: string): Promise<{
  campagne: { id: string; name: string; description: string | null; status: string; target_category: string | null;
    target_city: string | null; started_at: string | null; ended_at: string | null; budget_eur: number | null };
  parStatut: Record<string, number>;
  total: number;
  demos: number;
  /** Premiers e-mails et relances : validés en attente, partis (total et par jour, 14 derniers jours). */
  emailsValides: number;
  emailsAValider: number;
  premiersPartis: number;
  relancesParties: number;
  parJour: { jour: string; premiers: number; relances: number }[];
  /** Maquettes ouvertes : nombre, artisans contactés, dernières ouvertes (comme sur la vue d'ensemble). */
  nbOuvertes: number;
  ouvertes: Ouverte[];
  /** Réponses reçues (hors réponses automatiques, spam et contacts de chauffe), par catégorie, et les dernières. */
  reponses: Record<string, number>;
  dernieresReponses: { id: string; recu: string; nom: string | null; categorie: string | null; resume: string | null; fil: string | null }[];
  interets: { id: string; cree_le: string; nom: string | null; ville: string | null; traite_le: string | null }[];
  couts: { agent: string; montant: number }[];
  /** Pour la nouvelle cible : recherches Google déjà faites (villes × métiers), null pour les autres campagnes. */
  recherches: { faites: number; fiches: number; qualifies: number } | null;
} | null> => {
  if (!isSupabaseConfigured || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data: c } = await supabase.from("campaigns")
    .select("id, name, description, status, target_category, target_city, started_at, ended_at, budget_eur").eq("id", id).maybeSingle();
  if (!c) return null;
  const compte = (r: { count: number | null }) => r.count ?? 0;
  const il14 = new Date(Date.now() - 13 * 86_400_000);
  il14.setHours(0, 0, 0, 0);
  const [statuts, demos, valides, aValider, premiers, relances, recents, vues, couts, interets] = await Promise.all([
    supabase.from("prospects").select("status").eq("campaign_id", id).range(0, 19999),
    supabase.from("websites").select("id, prospects!inner(campaign_id)", { count: "exact", head: true })
      .eq("kind", "demo").in("status", ["pret", "publie"]).eq("prospects.campaign_id", id),
    supabase.from("emails").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "valide"),
    supabase.from("emails").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "a_valider"),
    supabase.from("emails").select("id", { count: "exact", head: true }).eq("campaign_id", id).not("sent_at", "is", null).is("relance_de", null),
    supabase.from("emails").select("id", { count: "exact", head: true }).eq("campaign_id", id).not("sent_at", "is", null).not("relance_de", "is", null),
    supabase.from("emails").select("sent_at, relance_de").eq("campaign_id", id).gte("sent_at", il14.toISOString()).range(0, 4999),
    supabase.from("websites").select("id, slug, vues, premiere_vue, derniere_vue, prospects!inner(id, name, city, email, campaign_id)", { count: "exact" })
      .eq("kind", "demo").gt("vues", 0).eq("prospects.campaign_id", id).order("derniere_vue", { ascending: false }).limit(8),
    supabase.from("costs").select("amount_eur, tasks(agent)").eq("campaign_id", id).range(0, 19999),
    supabase.from("maquette_interets").select("id, cree_le, traite_le, prospects!inner(name, city, campaign_id)")
      .eq("prospects.campaign_id", id).order("cree_le", { ascending: false }).limit(20),
  ]);
  const parStatut: Record<string, number> = {};
  for (const r of statuts.data ?? []) parStatut[r.status as string] = (parStatut[r.status as string] ?? 0) + 1;

  // Envois des 14 derniers jours, jour par jour (heure de Paris).
  const jourParis = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  const parJour = Array.from({ length: 14 }, (_, i) => ({ jour: jourParis(new Date(il14.getTime() + (i + 0.5) * 86_400_000)), premiers: 0, relances: 0 }));
  for (const e of recents.data ?? []) {
    const j = parJour.find((x) => x.jour === jourParis(new Date(e.sent_at as string)));
    if (j) { if (e.relance_de) j.relances++; else j.premiers++; }
  }

  // Maquettes ouvertes : mêmes détails que la vue d'ensemble.
  const pros = (w: { prospects: unknown }) => (Array.isArray(w.prospects) ? w.prospects[0] : w.prospects) as
    { id: string; name: string; city: string | null; email: string | null } | null;
  const lignes = vues.error ? [] : (vues.data ?? []);
  const [visitesParSite, details] = await Promise.all([
    visitesDe(supabase, lignes.map((w) => w.id as string)),
    detailsOuvertures(supabase, lignes.map(pros).filter((p) => p !== null).map((p) => ({ id: p.id, email: p.email }))),
  ]);

  // Réponses des prospects de la campagne (messages entrants rattachés à un prospect).
  const { data: msgs } = await supabase.from("mailbox_messages")
    .select("id, received_at, created_at, category, summary, thread_id, prospects!inner(name, campaign_id)")
    .eq("direction", "entrant").eq("prospects.campaign_id", id)
    .or("category.is.null,category.not.in.(automatique,spam,chauffe)").eq("auto_submitted", false)
    .order("created_at", { ascending: false }).limit(200);
  const reponses: Record<string, number> = {};
  for (const m of msgs ?? []) { const k = (m.category as string | null) ?? "autre"; reponses[k] = (reponses[k] ?? 0) + 1; }

  const parAgent = new Map<string, number>();
  for (const k of couts.data ?? []) {
    const t = (Array.isArray(k.tasks) ? k.tasks[0] : k.tasks) as { agent: string } | null;
    parAgent.set(t?.agent ?? "hors", (parAgent.get(t?.agent ?? "hors") ?? 0) + Number(k.amount_eur));
  }

  let recherches: { faites: number; fiches: number; qualifies: number } | null = null;
  if (c.name === "Photographes et coachs") {
    const { data: r, error } = await supabase.from("recherches_independants").select("fiches, qualifies").range(0, 9999);
    if (!error) recherches = { faites: (r ?? []).length, fiches: (r ?? []).reduce((t, x) => t + (x.fiches as number), 0),
      qualifies: (r ?? []).reduce((t, x) => t + (x.qualifies as number), 0) };
  }

  return {
    campagne: { ...c, budget_eur: c.budget_eur === null ? null : Number(c.budget_eur) } as never,
    parStatut,
    total: (statuts.data ?? []).length,
    demos: compte(demos),
    emailsValides: compte(valides),
    emailsAValider: compte(aValider),
    premiersPartis: compte(premiers),
    relancesParties: compte(relances),
    parJour,
    nbOuvertes: vues.error ? 0 : compte(vues),
    ouvertes: lignes.map((w) => {
      const p = pros(w);
      const d = p ? details.get(p.id) : undefined;
      return { name: p?.name ?? "?", city: p?.city ?? null, vues: w.vues as number, premiere: (w.premiere_vue as string | null) ?? null,
               derniere: w.derniere_vue as string, visites: visitesParSite.get(w.id as string) ?? [], slug: (w.slug as string | null) ?? null,
               fournisseur: d?.fournisseur ?? null, emailId: d?.emailId ?? null, envois: d?.envois ?? [] };
    }),
    reponses,
    dernieresReponses: (msgs ?? []).slice(0, 8).map((m) => ({
      id: m.id as string, recu: (m.received_at ?? m.created_at) as string,
      nom: ((Array.isArray(m.prospects) ? m.prospects[0] : m.prospects) as { name: string } | null)?.name ?? null,
      categorie: m.category as string | null, resume: m.summary as string | null, fil: (m.thread_id as string | null) ?? null,
    })),
    interets: interets.error ? [] : (interets.data ?? []).map((i) => {
      const p = (Array.isArray(i.prospects) ? i.prospects[0] : i.prospects) as { name: string; city: string | null } | null;
      return { id: i.id as string, cree_le: i.cree_le as string, nom: p?.name ?? null, ville: p?.city ?? null, traite_le: i.traite_le as string | null };
    }),
    couts: [...parAgent.entries()].map(([agent, montant]) => ({ agent, montant })).sort((a, b) => b.montant - a.montant),
    recherches,
  };
});
