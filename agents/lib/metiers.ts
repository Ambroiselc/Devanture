// Les métiers et les communes visés par la prospection.
// • `recherches` : ce que Loïc tape dans Google (suivi du nom de la ville). Plusieurs recherches par
//   métier, car Google renvoie au plus 60 résultats par recherche.
// • `naf` : les codes d'activité officiels, pour reconnaître l'entreprise dans l'annuaire.
// Ce fichier est aussi lu par le tableau de bord (listes de la page « Loïc ») : il n'importe rien.

export interface Metier {
  /** Identifiant court, utilisé au lancement de l'agent. */
  id: string;
  /** Nom lisible, enregistré dans la colonne « category » des prospects. */
  label: string;
  recherches: string[];
  naf: string[];
}

export const METIERS: Metier[] = [
  { id: "plombier", label: "Plombier-chauffagiste", recherches: ["plombier", "chauffagiste", "dépannage plomberie"], naf: ["43.22A", "43.22B"] },
  { id: "electricien", label: "Électricien", recherches: ["électricien", "dépannage électricité"], naf: ["43.21A"] },
  { id: "couvreur", label: "Couvreur", recherches: ["couvreur", "toiture", "zingueur"], naf: ["43.91A", "43.91B"] },
  { id: "peintre", label: "Peintre en bâtiment", recherches: ["peintre en bâtiment", "peintre décorateur"], naf: ["43.34Z"] },
  { id: "menuisier", label: "Menuisier", recherches: ["menuisier", "menuiserie fenêtres"], naf: ["43.32A", "16.23Z"] },
  { id: "serrurier", label: "Serrurier", recherches: ["serrurier", "dépannage serrurerie"], naf: ["43.32B"] },
  { id: "macon", label: "Maçon", recherches: ["maçon", "maçonnerie"], naf: ["43.99C", "41.20A"] },
  { id: "carreleur", label: "Carreleur", recherches: ["carreleur", "pose carrelage"], naf: ["43.33Z"] },
  { id: "plaquiste", label: "Plaquiste-plâtrier", recherches: ["plaquiste", "plâtrier"], naf: ["43.31Z"] },
  { id: "climatisation", label: "Climatisation et pompe à chaleur", recherches: ["climatisation installation", "pompe à chaleur installateur"], naf: ["43.22B"] },
  { id: "paysagiste", label: "Paysagiste", recherches: ["paysagiste", "entretien de jardin"], naf: ["81.30Z"] },
  // 17/11 : métiers très présents dans la liste RGE et qui manquaient (Loïc les rangeait en plaquiste, électricien,
  // maçon ou plombier, et Coco écartait les maquettes qui ne correspondaient pas).
  { id: "isolation", label: "Isolation", recherches: ["isolation combles", "isolation thermique maison"], naf: ["43.29A"] },
  { id: "solaire", label: "Panneaux solaires", recherches: ["installateur panneaux solaires", "installateur photovoltaïque"], naf: [] },
  { id: "facadier", label: "Façadier", recherches: ["façadier", "ravalement de façade"], naf: [] },
  { id: "poele", label: "Poêles et cheminées", recherches: ["installateur poêle à bois", "poêle à granulés installation"], naf: [] },
];

/**
 * Communes prospectées : les 10 plus peuplées de la métropole lilloise (code INSEE, nom), de la plus
 * peuplée à la moins peuplée (source : geo.api.gouv.fr, octobre 2026). Leur zone et leurs codes postaux
 * sont lus à chaque lancement sur geo.api.gouv.fr (voir geo.ts).
 */
export const LISTE_COMMUNES: [code: string, nom: string][] = [
  ["59350", "Lille"], ["59599", "Tourcoing"], ["59512", "Roubaix"], ["59009", "Villeneuve-d'Ascq"],
  ["59650", "Wattrelos"], ["59378", "Marcq-en-Barœul"], ["59328", "Lambersart"], ["59017", "Armentières"],
  ["59360", "Loos"], ["59368", "La Madeleine"],
];

/**
 * Pour plus tard (décision du 22/10 : 10 communes pour commencer) : les autres communes de la métropole
 * de 5 000 habitants et plus. Pour les ajouter, les déplacer dans LISTE_COMMUNES ci-dessus.
 */
export const COMMUNES_PLUS_TARD: [code: string, nom: string][] = [
  ["59410", "Mons-en-Barœul"], ["59646", "Wasquehal"], ["59279", "Halluin"], ["59163", "Croix"],
  ["59507", "Ronchin"], ["59220", "Faches-Thumesnil"], ["59299", "Hem"], ["59648", "Wattignies"],
  ["59286", "Haubourdin"], ["59508", "Roncq"], ["59367", "Lys-lez-Lannoy"], ["59421", "Mouvaux"],
  ["59560", "Seclin"], ["59527", "Saint-André-lez-Lille"], ["59152", "Comines"], ["59386", "Marquette-lez-Lille"],
  ["59636", "Wambrechies"], ["59011", "Annœullin"], ["59426", "Neuville-en-Ferrain"], ["59090", "Bondues"],
  ["59343", "Lesquin"], ["59339", "Leers"], ["59143", "La Chapelle-d'Armentières"], ["59457", "Pérenchies"],
  ["59161", "Linselles"], ["59317", "Houplines"], ["59653", "Wavrin"], ["59482", "Quesnoy-sur-Deûle"],
  ["59051", "La Bassée"], ["59553", "Santes"], ["59523", "Sainghin-en-Weppes"], ["59044", "Baisieux"],
  ["59656", "Wervicq-Sud"], ["59202", "Erquinghem-Lys"], ["59052", "Bauvin"],
];

/** Code INSEE → nom. (Attention : un objet range les clés « numériques » par ordre croissant, d'où la liste ci-dessus pour garder l'ordre.) */
export const COMMUNES: Record<string, string> = Object.fromEntries(LISTE_COMMUNES);

/** Toutes les communes de la métropole connues (les 10 premières + les autres), code INSEE → nom. */
export const TOUTES_COMMUNES_MEL: Record<string, string> = Object.fromEntries([...LISTE_COMMUNES, ...COMMUNES_PLUS_TARD]);

/** Codes INSEE, de la commune la plus peuplée à la moins peuplée. */
export const CODES_COMMUNES = LISTE_COMMUNES.map(([code]) => code);

export function findMetier(id: string): Metier {
  const metier = METIERS.find((m) => m.id === id);
  if (!metier) {
    throw new Error(`Métier inconnu « ${id} ». Choix possibles : ${METIERS.map((m) => m.id).join(", ")}.`);
  }
  return metier;
}
