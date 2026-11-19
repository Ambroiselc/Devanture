// « Prochaines tâches » : ce que les agents vont faire tout seuls, et quand.
// Les horaires viennent des « cron » des workflows GitHub Actions (.github/workflows/*.yml, en heure UTC).
// Si on change un horaire dans un workflow, il faut le changer ici aussi.
// 4/11 : GitHub lance les tâches planifiées en retard (30 à 65 min en général). `retards` = retard habituel de chaque
// créneau (médiane des passages du 29/10 au 3/11) : l'heure affichée est l'heure RÉELLE attendue.
// Une tâche reste affichée tant que GitHub ne l'a pas vraiment lancée (dernier passage du workflow, lu par
// getPassagesGithub) : « en retard » si elle tarde, « en cours » pendant qu'elle tourne, puis le créneau suivant.
import type { AgentName, AgentSettings } from "@/lib/types";

interface Planning {
  cle: string;
  agent: AgentName | null;
  titre: string;
  /** Ce que fait la tâche, en une phrase. */
  description: string;
  /** Rythme lisible par un humain. */
  rythme: string;
  /** Heures UTC, minute, et jours de la semaine (0 = dimanche) ; vide = tous les jours. */
  heuresUtc: number[];
  minute: number;
  /** Retard habituel de GitHub pour chaque heure de `heuresUtc`, en minutes. */
  retards: number[];
  jours: number[];
  /** Fichier du workflow (.github/workflows/…), pour savoir s'il est vraiment passé. */
  workflow: string;
  href?: string;
}

const PLANNINGS: Planning[] = [
  {
    cle: "loic", agent: "prospection", titre: "Loïc : prospection",
    description: "Trouve et note de nouveaux artisans, puis Sid prépare leurs maquettes et Valérie rédige leurs e-mails.",
    rythme: "2 fois par jour, 7 jours sur 7", heuresUtc: [6, 12], minute: 17, retards: [50, 45], jours: [], workflow: "agent-prospection.yml", href: "/loic",
  },
  {
    cle: "envoi", agent: "email", titre: "Valérie : envoi des e-mails",
    description: "Coco relit d'abord les e-mails à valider, puis Valérie envoie les validés dans la limite du quota du jour.",
    rythme: "4 vagues par jour ouvré (passage de secours toutes les 30 min si GitHub en saute une), puis un rattrapage en fin d'après-midi", heuresUtc: [7, 9, 12, 14, 16], minute: 37, retards: [50, 50, 60, 45, 45], jours: [1, 2, 3, 4, 5], workflow: "agent-envoi.yml", href: "/valerie",
  },
  {
    cle: "ines", agent: "boite", titre: "Inès : boîte mail",
    description: "Trie les réponses reçues et répond aux messages simples (elle passe aussi à chaque e-mail reçu).",
    rythme: "toutes les 2 heures en journée", heuresUtc: [7, 9, 11, 13, 15, 17, 19], minute: 23, retards: [55, 40, 35, 50, 40, 35, 35], jours: [], workflow: "agent-boite.yml", href: "/ines",
  },
  {
    cle: "pedro", agent: "site_production", titre: "Pedro : sites des clients",
    description: "Prépare le site des clients dont les photos et infos sont arrivées ; l'aperçu attend ta validation.",
    rythme: "chaque jour ouvré, le matin", heuresUtc: [8], minute: 47, retards: [50], jours: [1, 2, 3, 4, 5], workflow: "agent-site.yml", href: "/pedro",
  },
  {
    cle: "coco", agent: "coco", titre: "Coco : bilan du jour",
    description: "Fait le point de la journée et signale ce qui demande ton attention (sa relecture des e-mails a lieu à chaque vague d'envoi).",
    rythme: "chaque soir, 7 jours sur 7", heuresUtc: [17], minute: 13, retards: [35], jours: [], workflow: "agent-coco.yml", href: "/coco",
  },
  {
    cle: "spam", agent: null, titre: "Contrôle anti-spam",
    description: "Vérifie que les e-mails ne tombent pas en spam. N'envoie rien.",
    rythme: "chaque lundi", heuresUtc: [6], minute: 41, retards: [75], jours: [1], workflow: "controle-spam.yml",
  },
  {
    cle: "sauvegarde", agent: null, titre: "Sauvegarde de la base",
    description: "Copie de sécurité de toutes les données.",
    rythme: "chaque lundi, la nuit", heuresUtc: [2], minute: 17, retards: [40], jours: [1], workflow: "sauvegarde-supabase.yml",
  },
];

export interface ProchaineTache {
  cle: string;
  agent: AgentName | null;
  titre: string;
  description: string;
  rythme: string;
  /** Date ISO du prochain passage (heure réelle attendue, retard de GitHub compris). */
  prochaine: string;
  /** « prevue » : à venir ; « retard » : l'heure attendue est passée et GitHub ne l'a pas encore lancée ;
   *  « en_cours » : elle tourne en ce moment. */
  etape: "prevue" | "retard" | "en_cours";
  /** Le passage précédent n'a jamais eu lieu (GitHub saute parfois une vague). */
  sautee?: boolean;
  /** false : la tâche passera mais ne fera rien (agent en pause, envoi coupé…). */
  active: boolean;
  /** Pourquoi elle ne fera rien, et quoi faire. */
  raison?: string;
  /** Détail utile (ex. nombre d'e-mails validés prêts). */
  detail?: string;
  href?: string;
}

/** Dernier passage connu d'un workflow (GitHub Actions). */
export interface Passage {
  /** Heure de création du passage par GitHub (ISO). */
  debut: string;
  /** true tant qu'il tourne ou attend une machine. */
  enCours: boolean;
}

interface Creneau { cron: Date; attendu: Date }

/** Les créneaux d'un planning, du plus ancien au plus récent, de `j0` jours avant à `j1` jours après aujourd'hui. */
function creneaux(p: Planning, maintenant: Date, j0: number, j1: number): Creneau[] {
  const liste: Creneau[] = [];
  for (let j = -j0; j <= j1; j++) {
    const jour = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate() + j));
    if (p.jours.length && !p.jours.includes(jour.getUTCDay())) continue;
    p.heuresUtc.forEach((h, i) => {
      const cron = new Date(Date.UTC(jour.getUTCFullYear(), jour.getUTCMonth(), jour.getUTCDate(), h, p.minute));
      liste.push({ cron, attendu: new Date(cron.getTime() + (p.retards[i] ?? 45) * 60_000) });
    });
  }
  return liste;
}

/**
 * Le créneau à afficher. Avec le dernier passage du workflow : le dernier créneau déjà déclenché reste affiché tant que
 * GitHub ne l'a pas lancé (retard) ou qu'il tourne (en cours) ; sinon, le suivant. Sans (clé GitHub absente, GitHub
 * injoignable) : on se fie à l'heure attendue, avec 20 min de marge.
 */
function aAfficher(p: Planning, maintenant: Date, passage: Passage | null | undefined):
  { creneau: Creneau; etape: ProchaineTache["etape"]; sautee: boolean } | null {
  const liste = creneaux(p, maintenant, 8, 8);
  const suivant = liste.find((c) => c.cron > maintenant);
  const passes = liste.filter((c) => c.cron <= maintenant);
  const dernier = passes.at(-1);
  if (passage === undefined || passage === null) {
    const c = liste.find((x) => x.attendu.getTime() + 20 * 60_000 > maintenant.getTime());
    return c ? { creneau: c, etape: c.attendu < maintenant ? "retard" : "prevue", sautee: false } : null;
  }
  const debut = new Date(passage.debut);
  // Marge de 2 min : un lancement manuel juste avant l'heure du cron ne compte pas pour ce créneau.
  const lance = (c: Creneau) => debut.getTime() >= c.cron.getTime() - 2 * 60_000;
  if (dernier && !lance(dernier)) {
    const avant = passes.at(-2);
    return {
      creneau: dernier, etape: dernier.attendu < maintenant ? "retard" : "prevue",
      sautee: !!avant && !lance(avant) && maintenant.getTime() - avant.cron.getTime() < 36 * 3_600_000,
    };
  }
  if (dernier && passage.enCours) return { creneau: dernier, etape: "en_cours", sautee: false };
  return suivant ? { creneau: suivant, etape: "prevue", sautee: false } : null;
}

/**
 * Dernier passage de chaque workflow planifié, lu sur GitHub (une petite requête par workflow, en parallèle).
 * null pour tous si la clé GitHub manque ou si GitHub ne répond pas : l'affichage se fie alors aux horaires.
 */
export async function getPassagesGithub(): Promise<Record<string, Passage | null>> {
  const token = process.env.GITHUB_ACTIONS_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY_DEVANTURE || "Ambroiselc/Devanture";
  const vide = Object.fromEntries(PLANNINGS.map((p) => [p.workflow, null]));
  if (!token) return vide;
  const lus = await Promise.all(PLANNINGS.map(async (p) => {
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${p.workflow}/runs?per_page=1&exclude_pull_requests=true`, {
        headers: {
          Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "devanture-tableau-de-bord",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return [p.workflow, null] as const;
      const run = ((await res.json()) as { workflow_runs?: { created_at: string; status: string }[] }).workflow_runs?.[0];
      if (!run) return [p.workflow, null] as const;
      return [p.workflow, { debut: run.created_at, enCours: run.status !== "completed" }] as const;
    } catch {
      return [p.workflow, null] as const;
    }
  }));
  return { ...vide, ...Object.fromEntries(lus) };
}

/** Les tâches automatiques à venir, de la plus proche à la plus lointaine. */
export function getProchainesTaches(options: {
  loic: AgentSettings; valerie: AgentSettings; ines: AgentSettings;
  /** Nombre d'e-mails validés qui attendent l'envoi. */
  emailsValides: number;
  /** Derniers passages des workflows (getPassagesGithub) ; absent = on se fie aux horaires. */
  passages?: Record<string, Passage | null>;
  maintenant?: Date;
}): ProchaineTache[] {
  const { loic, valerie, ines, emailsValides } = options;
  const maintenant = options.maintenant ?? new Date();

  const etat: Record<string, { active: boolean; raison?: string; detail?: string }> = {
    loic: !loic.enabled ? { active: false, raison: "Loïc est en pause (page Loïc)." }
      : !loic.auto_enabled ? { active: false, raison: "« Lancement automatique » est coupé sur la page Loïc." }
      : { active: true },
    envoi: !valerie.enabled ? { active: false, raison: "Valérie est en pause (page Valérie)." }
      : !valerie.send_enabled ? { active: false, raison: "L'envoi n'est pas activé sur la page Valérie." }
      : {
        active: true,
        detail: emailsValides === 0 ? "Aucun e-mail validé pour l'instant : rien ne partira."
          : `${emailsValides} e-mail${emailsValides > 1 ? "s" : ""} validé${emailsValides > 1 ? "s" : ""} prêt${emailsValides > 1 ? "s" : ""} à partir.`,
      },
    ines: !ines.enabled ? { active: false, raison: "Inès est en pause (page Inès)." } : { active: true },
    coco: { active: true },
    spam: { active: true },
    sauvegarde: { active: true },
  };

  return PLANNINGS.flatMap((p) => {
    const choix = aAfficher(p, maintenant, options.passages?.[p.workflow]);
    if (!choix) return [];
    return [{
      cle: p.cle, agent: p.agent, titre: p.titre, description: p.description, rythme: p.rythme,
      prochaine: choix.creneau.attendu.toISOString(), etape: choix.etape, sautee: choix.sautee || undefined,
      href: p.href, ...etat[p.cle],
    }];
  }).sort((a, b) => Number(b.active) - Number(a.active) || a.prochaine.localeCompare(b.prochaine));
}

const heureFmt = new Intl.DateTimeFormat("fr-FR", { hour: "numeric", minute: "2-digit", timeZone: "Europe/Paris" });
const jourFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "short", timeZone: "Europe/Paris" });
const jourParis = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(d);

/** « dans 25 min », « aujourd'hui vers 14:17 », « demain vers 08:17 », « lundi 2 nov. vers 07:41 ». */
export function quandLisible(iso: string, maintenant = new Date()): string {
  const d = new Date(iso);
  const minutes = Math.round((d.getTime() - maintenant.getTime()) / 60_000);
  if (minutes < 0) return `prévue vers ${heureFmt.format(d).replace(":", " h ")}`;
  if (minutes < 60) return `dans ${Math.max(1, minutes)} min`;
  const heure = heureFmt.format(d).replace(":", " h ");
  const demain = new Date(maintenant.getTime() + 86_400_000);
  if (jourParis(d) === jourParis(maintenant)) return `aujourd'hui vers ${heure}`;
  if (jourParis(d) === jourParis(demain)) return `demain vers ${heure}`;
  return `${jourFmt.format(d)} vers ${heure}`;
}
