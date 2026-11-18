// Les versions du premier e-mail testées par Valérie.
// 13/11 (bilan sans les robots, décision de Broise) : B (1 maquette ouverte sur 108) arrêtée ; A (9 sur 66 sans photo)
// gardée ; nouvelle C, encore plus courte, testée contre A. Plus aucune photo dans les e-mails.
// Lu par l'agente (redaction-email.ts) ET par le tableau de bord (page « Valérie ») : il n'importe rien.

export type Variante = "A" | "B" | "C";

/** Versions que Valérie écrit aujourd'hui (B n'est plus écrite : ses e-mails pas encore partis sont réécrits en C). */
export const VARIANTES_ACTIVES: Variante[] = ["A", "C"];

/** Les approches testées (A et B depuis le 23/10, C depuis le 13/11). */
export const VARIANTES: Record<Variante, { nom: string; consigne: string }> = {
  A: {
    nom: "La maquette d'abord",
    consigne: `Approche A, « la maquette d'abord » : commence directement par la maquette déjà préparée pour son entreprise, propose-lui d'y jeter un œil (le lien), puis une phrase sur ce qu'un site lui apporterait. Ton simple et sans pression.`,
  },
  B: {
    nom: "Ses futurs clients d'abord",
    consigne: `Approche B, « ses futurs clients d'abord » : commence par la situation de ses clients (un particulier de sa commune qui cherche un artisan de son métier sur Google compare les entreprises et choisit souvent celle qui a un site clair), relie-la à ce qu'on a observé de sa présence en ligne, puis présente la maquette (le lien). Rappelle qu'un seul chantier décroché grâce au site peut le rembourser.`,
  },
  C: {
    nom: "Très court, réponse en un mot",
    consigne: `Approche C, « très court, réponse en un mot » : CETTE VERSION REMPLACE la règle des 70 à 130 mots et celle des deux styles : le texte fait 35 à 60 mots, en 3 ou 4 phrases courtes. Dis que tu as préparé une maquette de site pour son entreprise, donne le lien, puis au plus UNE phrase sur ce qu'elle apporte à ses clients. Ne parle pas des deux styles. Termine par une question à laquelle on répond en un mot, sur la maquette (par exemple « Elle vous plaît ? » ou « Je vous en dis plus ? »), jamais sur un prix ni une mise en ligne. Objet très court (25 à 45 caractères), avec le nom de l'entreprise (par exemple « Une maquette de site pour Dupont Couverture »).`,
  },
};
