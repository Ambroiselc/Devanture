// Traduit une erreur d'agent en consigne claire pour Broise (27/10) : faut-il faire quelque chose, et quoi ?
// Trois niveaux :
//   • « rien »    : ce n'est pas un problème (comportement normal, garde-fou qui a joué son rôle) ;
//   • « attendre »: panne passagère, l'agent réessaie tout seul à son prochain passage ;
//   • « agir »    : il faut faire quelque chose ; `conseil` dit quoi, `lien` mène au bon endroit.
// Les règles sont essayées dans l'ordre : la première qui reconnaît le message gagne.
import type { AgentName } from "./types";

export type Gravite = "rien" | "attendre" | "agir";

export interface Diagnostic {
  gravite: Gravite;
  /** Une phrase : ce qui s'est passé, en clair. */
  explication: string;
  /** Une phrase : ce qu'il faut faire (ou pourquoi il n'y a rien à faire). */
  conseil: string;
  lien?: { href: string; label: string };
}

const DEPOT = "Ambroiselc/Devanture";
const secrets = { href: `https://github.com/${DEPOT}/settings/secrets/actions`, label: "Ouvrir les secrets GitHub" };
const workflow = (fichier: string, label: string) => ({ href: `https://github.com/${DEPOT}/actions/workflows/${fichier}`, label });

/** Page du tableau de bord de chaque agent. */
export const pageAgent: Partial<Record<AgentName, { href: string; nom: string }>> = {
  prospection: { href: "/loic", nom: "Loïc" },
  site_demo: { href: "/sid", nom: "Sid" },
  email: { href: "/valerie", nom: "Valérie" },
  boite: { href: "/ines", nom: "Inès" },
  coco: { href: "/coco", nom: "Coco" },
};

type Regle = { test: RegExp; diag: (agent: AgentName | undefined) => Diagnostic };

const ENVOYER_MOI = "Si ça revient plusieurs fois, copie-moi le message : je regarde.";

const REGLES: Regle[] = [
  // --- Contrôle anti-spam hebdomadaire (agents/controle-spam.ts) ---
  {
    test: /Contrôle anti-spam : .*liste noire/i,
    diag: () => ({
      gravite: "agir",
      explication: "Ton domaine est sur une liste noire anti-spam : tes e-mails risquent d'arriver en spam.",
      conseil: "Mets l'envoi en pause sur la page Valérie et copie-moi le message : on regarde ensemble comment en sortir.",
      lien: { href: "/valerie", label: "Page de Valérie" },
    }),
  },
  {
    test: /Contrôle anti-spam : (?!note).*(DMARC|DKIM|SPF)[^;]*introuvable/i,
    diag: () => ({
      gravite: "agir",
      explication: "Un réglage du domaine d'envoi manque (DMARC, DKIM ou SPF) : sans lui, les e-mails passent plus souvent en spam.",
      conseil: "Le message dit quel domaine. Pour mail.devanture-artisans.fr : vérifie dans Resend › Domains qu'il est « Verified ». Pour un domaine de prospection : vérifie dans la console Google Workspace que DKIM est « activé », et chez OVH que les lignes DMARC et SPF sont toujours là.",
    }),
  },
  {
    test: /Contrôle anti-spam : (note|aucun e-mail)/i,
    diag: () => ({
      gravite: "agir",
      explication: "La note anti-spam des e-mails de Valérie a baissé (sous 8,5/10).",
      conseil: "Copie-moi le message (il liste les règles qui ont coûté des points) : je corrige le contenu avant les prochains envois.",
    }),
  },
  {
    test: /Contrôle anti-spam impossible/i,
    diag: () => ({ gravite: "attendre", explication: "Le contrôle anti-spam n'a pas pu tourner cette semaine.", conseil: `Il réessaiera lundi prochain. ${ENVOYER_MOI}` }),
  },
  // --- Garde-fous et cas normaux : rien à faire ---
  {
    test: /liste d'opposition/i,
    diag: () => ({ gravite: "rien", explication: "L'adresse est sur la liste d'opposition : l'agent a bien refusé de lui écrire.", conseil: "Rien à faire, le garde-fou a fonctionné." }),
  },
  {
    test: /existe déjà dans les prospects/i,
    diag: () => ({ gravite: "rien", explication: "Ce test avait déjà été créé : rien n'a été fait en double.", conseil: "Rien à faire." }),
  },
  {
    test: /quota du jour atteint|plafond de fiches google atteint/i,
    diag: () => ({ gravite: "rien", explication: "La limite du jour est atteinte : c'est voulu.", conseil: "Rien à faire, ça reprend demain tout seul." }),
  },
  // --- Budget ---
  {
    test: /budget ia/i,
    diag: () => ({
      gravite: "agir",
      explication: "Le budget IA du mois est atteint : les agents se sont arrêtés.",
      conseil: "Attends le 1er du mois, ou augmente le budget si tu veux qu'ils continuent.",
      lien: { href: "/#budget", label: "Voir le budget" },
    }),
  },
  // --- Clés et réglages manquants ou refusés : à toi d'agir ---
  {
    test: /ANTHROPIC_API_KEY|API Claude : erreur 40[13]/i,
    diag: () => ({
      gravite: "agir",
      explication: "La clé de l'API Claude est absente, expirée ou refusée.",
      conseil: "Crée une nouvelle clé sur console.anthropic.com, puis remplace le secret ANTHROPIC_API_KEY dans GitHub.",
      lien: secrets,
    }),
  },
  {
    test: /GOOGLE_PLACES_API_KEY|Google Places : erreur 40[13]/i,
    diag: () => ({
      gravite: "agir",
      explication: "La clé Google est absente ou refusée (souvent : facturation coupée dans Google Cloud).",
      conseil: "Vérifie le projet « devanture » dans Google Cloud, puis le secret GOOGLE_PLACES_API_KEY dans GitHub.",
      lien: secrets,
    }),
  },
  {
    // Boîtes de prospection (28/10) : mot de passe d'application refusé, ou secret mal rempli.
    test: /BOITES_ENVOI|Invalid login|Username and Password not accepted|535[- ]5\.7\.8|AUTHENTICATIONFAILED|Relève de la boîte/i,
    diag: () => ({
      gravite: "agir",
      explication: "Une boîte de prospection refuse la connexion : son mot de passe d'application est faux, expiré ou mal recopié.",
      conseil: "Recrée un mot de passe d'application pour cette boîte (compte Google › Sécurité › Mots de passe des applications) et remplace sa ligne dans le secret BOITES_ENVOI sur GitHub.",
      lien: secrets,
    }),
  },
  {
    test: /Resend : erreur 40[13]|RESEND_API_KEY|EMAIL_FROM|DEMO_BASE_URL/i,
    diag: () => ({
      gravite: "agir",
      explication: "L'envoi d'e-mails est refusé : clé Resend, expéditeur ou lien des maquettes à vérifier.",
      conseil: "Vérifie les secrets RESEND_API_KEY, EMAIL_FROM et DEMO_BASE_URL dans GitHub.",
      lien: secrets,
    }),
  },
  {
    test: /Resend : erreur 422|domain.*not verified|not verified/i,
    diag: () => ({
      gravite: "agir",
      explication: "Resend refuse l'e-mail (domaine pas vérifié ou adresse d'expéditeur invalide).",
      conseil: "Ouvre resend.com › Domains : mail.devanture-artisans.fr doit être « Verified ». Sinon, copie-moi le message.",
    }),
  },
  {
    test: /SUPABASE_DB_URL/i,
    diag: () => ({ gravite: "agir", explication: "L'agent n'a pas l'adresse de la base de données.", conseil: "Vérifie le secret SUPABASE_DB_URL dans GitHub.", lien: secrets }),
  },
  {
    test: /migration|n'existe pas|does not exist|introuvables/i,
    diag: () => ({ gravite: "agir", explication: "Il manque quelque chose dans la base de données (une migration pas lancée).", conseil: "Copie-moi le message : je te dis quel fichier lancer dans Supabase." }),
  },
  // --- Maquettes ---
  {
    test: /capture/i,
    diag: () => ({
      gravite: "agir",
      explication: "La maquette est bien faite, mais sa photo pour l'e-mail n'a pas pu être prise.",
      conseil: "Relance Sid en cochant « captures » : il refait seulement les photos manquantes, sans coût d'IA.",
      lien: workflow("agent-demos.yml", "Relancer Sid (captures)"),
    }),
  },
  {
    test: /slug manquant|sans adresse publique/i,
    diag: () => ({ gravite: "agir", explication: "La maquette de ce prospect n'a pas d'adresse publique : l'e-mail ne peut pas partir.", conseil: "Copie-moi le nom du prospect : je refais sa maquette." }),
  },
  // --- Pannes passagères : ça se règle tout seul ---
  {
    test: /erreur (429|5\d\d)|overloaded|rate.?limit|timeout|timed out|délai|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|fetch failed|socket|network|aborted/i,
    diag: () => ({
      gravite: "attendre",
      explication: "Un service extérieur n'a pas répondu à temps, ou était surchargé (panne passagère).",
      conseil: `Rien à faire : l'agent réessaie à son prochain passage. ${ENVOYER_MOI}`,
    }),
  },
  {
    test: /API Claude : (réponse sans|e-mail trop court|pas assez)/i,
    diag: () => ({
      gravite: "attendre",
      explication: "Claude a donné une réponse incomplète pour ce prospect (ça arrive de temps en temps).",
      conseil: `Rien à faire : il sera repris au prochain passage. ${ENVOYER_MOI}`,
    }),
  },
  {
    test: /erreurs de suite/i,
    diag: () => ({
      gravite: "attendre",
      explication: "Trois erreurs d'affilée : l'agent s'est arrêté par prudence. Les vraies causes sont les erreurs juste avant.",
      conseil: `En général c'est une panne passagère et il repart au prochain passage. ${ENVOYER_MOI}`,
    }),
  },
  {
    test: /Annuaire des entreprises|Liste RGE|geo\.api\.gouv\.fr/i,
    diag: () => ({
      gravite: "attendre",
      explication: "Un service public de données (annuaire, liste RGE) n'a pas répondu.",
      conseil: `Rien à faire : l'agent réessaie au prochain passage. ${ENVOYER_MOI}`,
    }),
  },
];

export function diagnostiquer(message: string | null | undefined, agent?: AgentName): Diagnostic {
  const m = message ?? "";
  for (const r of REGLES) if (r.test.test(m)) return r.diag(agent);
  return {
    gravite: "agir",
    explication: "Erreur que je n'ai pas encore classée.",
    conseil: "Copie-moi le message (et le nom de la tâche) : je te dis si c'est grave et je corrige.",
  };
}

export const graviteStyle: Record<Gravite, { label: string; tone: "muted" | "info" | "danger" }> = {
  rien: { label: "Rien à faire", tone: "muted" },
  attendre: { label: "Se règle tout seul", tone: "info" },
  agir: { label: "À faire", tone: "danger" },
};
