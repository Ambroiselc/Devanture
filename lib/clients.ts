// Étapes d'un client, de la signature à l'abonnement (procédure complète : docs/apres-signature.md).
// Chaque étape dit ce qu'il faut faire pour passer à la suivante, et qui le fait.
import type { Tone } from "./format";

export type EtapeClient =
  | "paye" | "contenu_demande" | "contenu_recu" | "site_en_preparation" | "apercu_envoye"
  | "valide" | "domaine_achete" | "en_ligne" | "abonne" | "abandonne" | "resilie";

export interface Etape { label: string; tone: Tone; qui: "Broise" | "Claude" | "Le client"; faire: string }

/** Dans l'ordre du parcours. « abandonne » et « resilie » sont des sorties, hors parcours. */
export const etapes: Record<EtapeClient, Etape> = {
  paye: { label: "Payé", tone: "info", qui: "Broise",
    faire: "La création est payée (ou, avec 0 € de départ, le premier des 12 mois). Valider l'e-mail de bienvenue préparé dans la boîte mail (page Inès) : il contient son lien d'accueil, où il dépose ses photos et ses infos. Photographe ou coach : caler l'appel de lancement (15-20 min, le soir) pour créer avec lui son compte de réservation Cal.com (guide docs/reservation-en-ligne.md) ; il colle ensuite son lien sur sa page d'accueil. La fiche passe seule à « Contenu reçu » quand il les envoie." },
  contenu_demande: { label: "Contenu demandé", tone: "progress", qui: "Le client",
    faire: "Attendre ses photos, son logo et ses infos sur sa page d'accueil (15 jours prévus par les CGV). Relancer gentiment au bout d'une semaine, avec le même lien." },
  contenu_recu: { label: "Contenu reçu", tone: "progress", qui: "Claude",
    faire: "Pedro prépare son site tout seul chaque matin de semaine (vers 9 h 45), ou tout de suite avec le bouton « Préparer le site » : sa maquette, dans le style qu'il a choisi, avec ses infos et ses photos. Rien ne part au client sans toi." },
  site_en_preparation: { label: "Site en préparation", tone: "progress", qui: "Claude",
    faire: "Ouvrir l'aperçu et le relire (10 min) : textes, photos, téléphone, horaires. À corriger ? Note-le et dis-le-moi, ou complète sa page d'accueil puis « Refaire le site ». Ensuite, valider l'e-mail d'aperçu sur la page Inès et passer la fiche à « Aperçu envoyé »." },
  apercu_envoye: { label: "Aperçu envoyé", tone: "warning", qui: "Le client",
    faire: "Le client regarde son site sur le lien d'aperçu. Inès trie ses corrections ; on corrige jusqu'à son « c'est bon » écrit (un e-mail suffit)." },
  valide: { label: "Validé par le client", tone: "warning", qui: "Broise",
    faire: "Acheter le domaine chez OVH, au nom du client (contact propriétaire = le client, ton compte en admin et technique), puis le brancher sur Cloudflare. Noter le domaine ici." },
  domaine_achete: { label: "Domaine acheté", tone: "warning", qui: "Claude",
    faire: "Une fois le domaine actif sur Cloudflare (serveurs DNS recopiés chez OVH), bouton « Mettre en ligne » : Pedro relie le site au domaine et passe la fiche à « En ligne ». Le client doit cliquer sur l'e-mail de vérification de l'AFNIC." },
  en_ligne: { label: "En ligne", tone: "success", qui: "Broise",
    faire: "Formule avec création : valider la réponse d'Inès qui contient le lien d'abonnement (19 € ou 39 €/mois). Avec 0 € de départ, l'abonnement tourne déjà. Penser à la fiche Google du client." },
  abonne: { label: "Abonné", tone: "success", qui: "Broise",
    faire: "Rien d'autre : modifications à la demande (1 ou 2 par mois selon la formule). Demander un avis Google au bout de 2 semaines, sans rien offrir en échange (interdit par Google)." },
  abandonne: { label: "Abandonné", tone: "muted", qui: "Broise",
    faire: "Le client a renoncé avant la mise en ligne. Rien n'a été acheté à son nom si le domaine attendait la validation." },
  resilie: { label: "Résilié", tone: "muted", qui: "Broise",
    faire: "Transférer le domaine gratuitement au client s'il le demande, une fois les sommes dues réglées (article 9 des CGV)." },
};

export const ordreEtapes: EtapeClient[] = [
  "paye", "contenu_demande", "contenu_recu", "site_en_preparation", "apercu_envoye",
  "valide", "domaine_achete", "en_ligne", "abonne",
];

export const formules = { essentiel: "Essentiel", pro: "Pro" } as const;
export const paiements = { creation: "Création payée", sans_frais: "0 € de départ (12 mois, 1er mois payé)" } as const;

export interface Client {
  id: string;
  prospect_id: string;
  formule: keyof typeof formules;
  paiement: keyof typeof paiements;
  lancement: boolean;
  etape: EtapeClient;
  domaine: string | null;
  signe_le: string;
  en_ligne_le: string | null;
  fin_engagement: string | null;
  notes: string | null;
  updated_at: string;
  jeton: string;
  contenu: Record<string, string>;
  fichiers: { chemin: string; nom: string; sorte: string; taille: number; legende?: string }[];
  contenu_recu_le: string | null;
  prospects: { name: string; city: string | null; email: string | null; category: string | null } | null;
}

/** Libellés des infos envoyées par le client sur sa page d'accueil (components/accueil-form.tsx). */
export const champsContenu: [string, string][] = [
  ["prestations", "Prestations"], ["zone", "Zone d'intervention"], ["horaires", "Horaires"], ["telephone", "Téléphone"],
  ["domaine_souhaite", "Adresse souhaitée"], ["reservation", "Page de réservation"], ["style", "Style préféré"], ["message", "Message"],
];

export interface PaiementStripe {
  id: string;
  session_id: string;
  paye_le: string;
  cle: string | null;
  email: string | null;
  entreprise: string | null;
  montant_cents: number;
  remise_cents: number;
}
