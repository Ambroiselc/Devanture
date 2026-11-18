// Types TypeScript qui reflètent les tables Supabase.
// Si tu modifies une table dans le SQL, pense à modifier le type ici aussi.

export type CampaignStatus = "brouillon" | "planifiee" | "en_cours" | "en_pause" | "terminee" | "annulee";
export type ProspectStatus =
  | "nouveau" | "qualifie" | "demo_prete" | "contacte" | "interesse" | "client" | "refuse" | "ecarte";
export type WebsiteKind = "demo" | "production";
export type WebsiteStatus = "brouillon" | "en_generation" | "pret" | "publie" | "archive" | "erreur";
export type EmailStatus = "brouillon" | "a_valider" | "valide" | "envoye" | "repondu" | "erreur" | "annule";
export type AgentName = "orchestrateur" | "prospection" | "site_demo" | "email" | "site_production" | "boite" | "paiements" | "coco";
export type TaskStatus = "en_attente" | "en_cours" | "terminee" | "echouee" | "annulee";
export type EventLevel = "info" | "warning" | "error";
export type CostCategory = "api" | "hebergement" | "domaine" | "email" | "autre";
export type WebsiteQuality = "aucun" | "reseau_social" | "date" | "correct" | "moderne";
export type OppositionReason = "desinscription" | "refus" | "plainte" | "adresse_invalide" | "manuel";

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  target_city: string | null;
  target_category: string | null;
  budget_eur: number | null;
  started_at: string | null;
  ended_at: string | null;
  is_demo: boolean;
  created_at: string;
}

export interface Prospect {
  id: string;
  campaign_id: string | null;
  name: string;
  category: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  current_website: string | null;
  has_website: boolean;
  source: string | null;
  score: number | null;
  status: ProspectStatus;
  notes: string | null;
  // Champs remplis par l'agent de prospection (phase 2) ; absents des anciennes données.
  siret?: string | null;
  naf_code?: string | null;
  google_place_id?: string | null;
  website_quality?: WebsiteQuality | null;
  email_source?: string | null;
  score_reason?: string | null;
  last_checked_at?: string | null;
  is_demo: boolean;
  created_at: string;
}

export interface Website {
  id: string;
  prospect_id: string;
  kind: WebsiteKind;
  status: WebsiteStatus;
  template: string | null;
  url: string | null;
  published_at: string | null;
  // Démos (phase 3) : textes rédigés par l'agent des démos ; absents des anciennes données.
  content?: unknown | null;
  slug?: string | null;
  is_demo: boolean;
  created_at: string;
}

export interface Email {
  id: string;
  prospect_id: string;
  campaign_id: string | null;
  website_id: string | null;
  subject: string;
  body: string;
  status: EmailStatus;
  /** Version du message testée (A ou B), rédigée par Valérie ; absente des anciennes données. */
  variant?: "A" | "B" | "C" | null;
  /** Envoyé avec l'image de la maquette (true) ou sans (false) : second test, en plus de A/B. */
  with_image?: boolean | null;
  /** Suivi chez Resend : sent, delivered, bounced, complained… */
  delivery_status?: string | null;
  /** Canal d'envoi : adresse de la boîte de prospection, ou « resend » (vide = ancien envoi par Resend). */
  sender?: string | null;
  /** Relance (30/10) : l'e-mail d'origine auquel celui-ci fait suite. */
  relance_de?: string | null;
  // Coco (30/10) : ok = validé tel quel, corrige = corrigé puis validé, garde = laissé à Broise (raison dans coco_avis).
  coco_verdict?: "ok" | "corrige" | "garde" | "annule" | null;
  coco_avis?: string | null;
  coco_le?: string | null;
  sent_at: string | null;
  is_demo: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  agent: AgentName;
  title: string;
  status: TaskStatus;
  priority: number;
  parent_task_id: string | null;
  campaign_id: string | null;
  prospect_id: string | null;
  website_id: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  tokens_input: number;
  tokens_output: number;
  scheduled_at: string;
  started_at: string | null;
  finished_at: string | null;
  is_demo: boolean;
  created_at: string;
}

export interface TaskEvent {
  id: number;
  task_id: string;
  level: EventLevel;
  message: string;
  details: Record<string, unknown> | null;
  is_demo: boolean;
  created_at: string;
}

export interface Cost {
  id: string;
  task_id: string | null;
  campaign_id: string | null;
  provider: string;
  category: CostCategory;
  amount_eur: number;
  description: string | null;
  incurred_at: string;
  is_demo: boolean;
  created_at: string;
}

/** Personne ou domaine à ne plus jamais contacter. */
export interface OppositionEntry {
  id: string;
  email: string | null;
  domain: string | null;
  business_name: string | null;
  reason: OppositionReason;
  notes: string | null;
  is_demo: boolean;
  created_at: string;
}

/** Réglages d'un agent (page « Loïc » pour l'agent de prospection). */
export interface AgentSettings {
  agent: AgentName;
  display_name: string;
  enabled: boolean;
  auto_enabled: boolean;
  metiers: string[];
  /** Communes prospectées en automatique (codes INSEE) ; null = toutes. */
  communes?: string[] | null;
  default_limit: number;
  max_google_day: number;
  max_google_month: number;
  score_qualified: number;
  score_discarded: number;
  instructions: string | null;
  /** Signature des e-mails (Valérie uniquement). */
  signature?: string | null;
  /** Envoi des e-mails validés activé (Valérie uniquement). */
  send_enabled?: boolean;
  send_max_per_day?: number;
  /** Réponses simples envoyées sans validation (boîte mail uniquement). */
  auto_reply_enabled?: boolean;
  auto_reply_max_per_day?: number;
  /** Contacts de chauffe des boîtes de prospection (boîte mail uniquement, 3/11). */
  contacts_chauffe?: string[];
  updated_at: string | null;
}

/** Réglages de l'agence (une seule ligne). */
export interface AppSettings {
  ai_monthly_budget_eur: number;
  ai_alert_ratio: number;
}

/** Toutes les données dont le tableau de bord a besoin. */
export interface DashboardData {
  campaigns: Campaign[];
  prospects: Prospect[];
  websites: Website[];
  emails: Email[];
  tasks: Task[];
  taskEvents: TaskEvent[];
  costs: Cost[];
  opposition: OppositionEntry[];
  settings: AppSettings;
}

export type MailCategory =
  | "interesse" | "question" | "rendez_vous" | "pas_interesse" | "stop" | "automatique" | "client" | "spam" | "chauffe" | "autre";
export type MailStatus =
  | "nouveau" | "traite" | "a_traiter" | "ignore" | "a_valider" | "valide" | "envoye" | "rejete" | "erreur";

/** Un message de la boîte mail : reçu (« entrant ») ou réponse (« sortant »). */
export interface MailboxMessage {
  id: string;
  direction: "entrant" | "sortant";
  thread_id: string | null;
  prospect_id: string | null;
  email_id: string | null;
  reply_to_id: string | null;
  from_email: string | null;
  from_name: string | null;
  to_email: string | null;
  subject: string;
  body_text: string;
  attachments: { nom: string; type?: string; taille?: number }[];
  auto_submitted: boolean;
  category: MailCategory | null;
  summary: string | null;
  status: MailStatus;
  review_reason: string | null;
  sent_by: "agent" | "broise" | null;
  received_at: string | null;
  sent_at: string | null;
  error_message: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}
