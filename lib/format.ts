// Libellés en français et petites fonctions de mise en forme.
import type {
  AgentName, AppSettings, CampaignStatus, Cost, EmailStatus, MailCategory, MailStatus, OppositionReason, ProspectStatus, TaskStatus,
  WebsiteKind,
  WebsiteQuality, WebsiteStatus,
} from "./types";

export type Tone = "neutral" | "info" | "progress" | "success" | "warning" | "danger" | "muted";

type LabelMap<K extends string> = Record<K, { label: string; tone: Tone }>;

export const prospectStatus: LabelMap<ProspectStatus> = {
  nouveau: { label: "Nouveau", tone: "neutral" },
  qualifie: { label: "Qualifié", tone: "info" },
  demo_prete: { label: "Démo prête", tone: "progress" },
  contacte: { label: "Contacté", tone: "progress" },
  interesse: { label: "Intéressé", tone: "warning" },
  client: { label: "Client", tone: "success" },
  refuse: { label: "Refusé", tone: "danger" },
  ecarte: { label: "Écarté", tone: "muted" },
};

/** Ordre du parcours commercial, du premier repérage au client. */
export const pipelineOrder: ProspectStatus[] = [
  "nouveau", "qualifie", "demo_prete", "contacte", "interesse", "client",
];

export const websiteStatus: LabelMap<WebsiteStatus> = {
  brouillon: { label: "Brouillon", tone: "neutral" },
  en_generation: { label: "En génération", tone: "progress" },
  pret: { label: "Prêt", tone: "info" },
  publie: { label: "En ligne", tone: "success" },
  archive: { label: "Archivé", tone: "muted" },
  erreur: { label: "Erreur", tone: "danger" },
};

/** Qualité du site actuel d'un prospect, estimée par l'agent de prospection. */
export const websiteQuality: Record<WebsiteQuality, string> = {
  aucun: "Aucun site",
  reseau_social: "Réseau social seulement",
  date: "Site daté",
  correct: "Site correct",
  moderne: "Site moderne",
};

export const websiteKind: Record<WebsiteKind, string> = {
  demo: "Démonstration",
  production: "Site définitif",
};

export const campaignStatus: LabelMap<CampaignStatus> = {
  brouillon: { label: "Brouillon", tone: "neutral" },
  planifiee: { label: "Planifiée", tone: "info" },
  en_cours: { label: "En cours", tone: "progress" },
  en_pause: { label: "En pause", tone: "warning" },
  terminee: { label: "Terminée", tone: "success" },
  annulee: { label: "Annulée", tone: "muted" },
};

export const emailStatus: LabelMap<EmailStatus> = {
  brouillon: { label: "Brouillon", tone: "neutral" },
  a_valider: { label: "À valider", tone: "warning" },
  valide: { label: "Validé", tone: "info" },
  envoye: { label: "Envoyé", tone: "success" },
  repondu: { label: "Répondu", tone: "success" },
  erreur: { label: "Erreur", tone: "danger" },
  annule: { label: "Annulé par Coco", tone: "neutral" },
};

export const taskStatus: LabelMap<TaskStatus> = {
  en_attente: { label: "En attente", tone: "neutral" },
  en_cours: { label: "En cours", tone: "progress" },
  terminee: { label: "Terminée", tone: "success" },
  echouee: { label: "Échouée", tone: "danger" },
  annulee: { label: "Annulée", tone: "muted" },
};

export const agentLabel: Record<AgentName, string> = {
  orchestrateur: "Orchestrateur",
  prospection: "Loïc (prospection)",
  site_demo: "Sid (maquettes)",
  email: "Valérie (e-mails)",
  site_production: "Pedro · site définitif",
  boite: "Inès (boîte mail)",
  paiements: "Paiements Stripe",
  coco: "Coco (supervision)",
};

export const mailCategory: LabelMap<MailCategory> = {
  interesse: { label: "Intéressé", tone: "success" },
  question: { label: "Question", tone: "info" },
  rendez_vous: { label: "Veut un appel", tone: "warning" },
  pas_interesse: { label: "Pas intéressé", tone: "muted" },
  stop: { label: "STOP", tone: "danger" },
  automatique: { label: "Automatique", tone: "muted" },
  client: { label: "Client", tone: "success" },
  spam: { label: "Spam", tone: "muted" },
  chauffe: { label: "Chauffe", tone: "muted" },
  autre: { label: "Autre", tone: "neutral" },
};

export const mailStatus: LabelMap<MailStatus> = {
  nouveau: { label: "Nouveau", tone: "info" },
  traite: { label: "Traité", tone: "muted" },
  a_traiter: { label: "À regarder", tone: "warning" },
  ignore: { label: "Rangé", tone: "muted" },
  a_valider: { label: "À valider", tone: "warning" },
  valide: { label: "Part bientôt", tone: "progress" },
  envoye: { label: "Envoyé", tone: "success" },
  rejete: { label: "Rejeté", tone: "muted" },
  erreur: { label: "Erreur", tone: "danger" },
};

export const oppositionReason: Record<OppositionReason, string> = {
  desinscription: "Désinscription",
  refus: "A dit non",
  plainte: "Plainte",
  adresse_invalide: "Adresse invalide",
  manuel: "Ajout manuel",
};

const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const eurPrecise = new Intl.NumberFormat("fr-FR", {
  style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 4,
});
const num = new Intl.NumberFormat("fr-FR");
const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
});
const dayFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

export const formatEur = (v: number) => eur.format(v);
export const formatEurPrecise = (v: number) => eurPrecise.format(v);
export const formatNumber = (v: number) => num.format(v);
export const formatDate = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : "—");
export const formatDay = (iso: string) => dayFmt.format(new Date(iso));

export function formatDuration(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const s = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ${String(s % 60).padStart(2, "0")}` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Additionne une liste de nombres. */
export const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export type BudgetLevel = "ok" | "alerte" | "depasse";

/**
 * Dépenses IA (catégorie « api ») du mois en cours, comparées au budget.
 * Les données fictives ne comptent pas, sauf en mode démo.
 */
/** Niveau du budget à partir des chiffres calculés par la base (vue ai_budget_status). */
export function niveauBudget(spent: number, budget: number, alerte: number) {
  const ratio = budget > 0 ? spent / budget : spent > 0 ? Infinity : 0;
  const level: BudgetLevel = ratio >= 1 ? "depasse" : ratio >= alerte ? "alerte" : "ok";
  return { spent, budget, ratio, level };
}

export function aiBudget(costs: Cost[], settings: AppSettings, includeDemo: boolean, now = new Date()) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const spent = sum(costs
    .filter((c) => c.category === "api" && (includeDemo || !c.is_demo) && new Date(c.incurred_at) >= monthStart)
    .map((c) => c.amount_eur));
  const budget = settings.ai_monthly_budget_eur;
  const ratio = budget > 0 ? spent / budget : spent > 0 ? Infinity : 0;
  const level: BudgetLevel = ratio >= 1 ? "depasse" : ratio >= settings.ai_alert_ratio ? "alerte" : "ok";
  return { spent, budget, ratio, level };
}

/** Durée d'une ouverture de maquette (5/11) : « 8 s », « 1 min 05 », « 12 min ». */
export function formatSecondes(s: number): string {
  const n = Math.max(0, Math.round(s));
  if (n < 60) return `${n} s`;
  const m = Math.floor(n / 60), r = n % 60;
  return m >= 10 || r === 0 ? `${m} min` : `${m} min ${String(r).padStart(2, "0")}`;
}
