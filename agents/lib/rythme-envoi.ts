// Rythme d'envoi des e-mails de prospection : montée progressive pour ne jamais passer pour un spammeur.
// Lu par l'agent d'envoi (agents/envoi.ts) ET par le tableau de bord (page « Valérie ») : il n'importe rien.
//
// • Première demi-semaine : 10 e-mails par jour ouvré, en 4 vagues (vers 9 h, 11 h, 14 h et 16 h).
// • Ensuite, un palier de plus chaque DEMI-SEMAINE (le lundi et le jeudi, heure de Paris) SI les envois sont sains :
//   10 → 15 → 20 → 30 → 40 → 50 (choisi par Broise le 27/10 ; avant : un palier par semaine, 10 → … → 35 → 50).
// • Santé (7 derniers jours) : au moins un signalement de spam, ou plus de 3 % de rebonds → rythme divisé par deux.

export const PALIERS = [10, 15, 20, 30, 40, 50];
export const VAGUES_PAR_JOUR = 4;
/** Heure de Paris (décimale) où commence chaque vague : 8 h 30, 10 h, 12 h 30, 15 h (même découpage que vagueDuMoment). */
export const DEBUT_VAGUES = [8.5, 10, 12.5, 15];
export const SEUIL_REBONDS = 0.03;

export interface Sante {
  envoyes7j: number;
  rebonds7j: number;
  plaintes7j: number;
}

export interface Rythme {
  /** Demi-semaines (lundi → mercredi, jeudi → dimanche) depuis celle du premier envoi (0 = la première). */
  semaine: number;
  palier: number;
  /** E-mails autorisés aujourd'hui. */
  quota: number;
  ralenti: boolean;
  raison: string;
}

export function sain(s: Sante): boolean {
  return s.plaintes7j === 0 && !(s.envoyes7j >= 20 && s.rebonds7j / s.envoyes7j > SEUIL_REBONDS);
}

/** Numéro de la demi-semaine d'une date, à l'heure de Paris : elles commencent le lundi et le jeudi. */
export function demiSemaine(d: Date): number {
  const [a, m, j] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d).split("-").map(Number);
  const jours = Math.floor(Date.UTC(a, m - 1, j) / 86_400_000); // jours depuis le 1/1/1970 (un jeudi)
  const depuisLundi = (jours + 3) % 7;                            // 0 = lundi … 6 = dimanche
  const semaine = Math.floor((jours + 3) / 7);
  return semaine * 2 + (depuisLundi >= 3 ? 1 : 0);
}

export function rythmeDuJour(premierEnvoi: Date | null, maintenant: Date, sante: Sante, maxParJour: number): Rythme {
  const semaine = premierEnvoi ? Math.max(0, demiSemaine(maintenant) - demiSemaine(premierEnvoi)) : 0;
  const palier = Math.min(PALIERS[Math.min(semaine, PALIERS.length - 1)], maxParJour);
  if (!sain(sante)) {
    const raison = sante.plaintes7j > 0
      ? `${sante.plaintes7j} signalement(s) de spam ces 7 derniers jours`
      : `${Math.round((100 * sante.rebonds7j) / sante.envoyes7j)} % de rebonds ces 7 derniers jours`;
    return { semaine, palier, quota: Math.max(5, Math.floor(palier / 2)), ralenti: true, raison };
  }
  return { semaine, palier, quota: palier, ralenti: false, raison: "Envois sains" };
}

// ---------------------------------------------------------------------
// Boîtes d'envoi (28/10) : chaque boîte de prospection (voir boites-envoi.ts) a SA montée, depuis SON premier envoi :
// 5 → 10 → 15 → 20 → 25 e-mails par jour, un palier chaque lundi et jeudi, divisé par deux si ses envois vont mal.
// 2 boîtes = 10 par jour au départ, 50 au bout de deux semaines et demie.
// Resend (l'ancien canal) ne fait plus de prospection dès qu'il existe au moins une boîte (choix de Broise le 28/10 :
// ses conditions l'interdisent) ; il ne sert plus qu'aux réponses d'Inès. Sans aucune boîte : au plus RESEND_MAX par jour.
export const PALIERS_BOITE = [5, 10, 15, 20, 25];
export const RESEND_MAX = 15;

export function rythmeBoite(premierEnvoi: Date | null, maintenant: Date, sante: Sante): Rythme {
  const semaine = premierEnvoi ? Math.max(0, demiSemaine(maintenant) - demiSemaine(premierEnvoi)) : 0;
  const palier = PALIERS_BOITE[Math.min(semaine, PALIERS_BOITE.length - 1)];
  if (!sain(sante)) {
    const raison = sante.plaintes7j > 0
      ? `${sante.plaintes7j} signalement(s) de spam ces 7 derniers jours`
      : `${Math.round((100 * sante.rebonds7j) / sante.envoyes7j)} % de rebonds ces 7 derniers jours`;
    return { semaine, palier, quota: Math.max(2, Math.floor(palier / 2)), ralenti: true, raison };
  }
  return { semaine, palier, quota: palier, ralenti: false, raison: "Envois sains" };
}

/** Quota de Resend pour la prospection : zéro dès qu'il y a une boîte (nbBoites > 0), sinon au plus RESEND_MAX. */
export function quotaResend(rythmeResend: Rythme, nbBoites: number): number {
  return nbBoites > 0 ? 0 : Math.min(RESEND_MAX, rythmeResend.quota);
}

/** Vague du jour (0 à 3) d'après l'heure de Paris : avant 10 h, avant 12 h 30, avant 15 h, après. */
export function vagueDuMoment(heureParis: number): number {
  if (heureParis < 10) return 0;
  if (heureParis < 12.5) return 1;
  if (heureParis < 15) return 2;
  return 3;
}
