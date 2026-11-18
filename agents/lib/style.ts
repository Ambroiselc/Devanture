// Style d'écriture commun aux e-mails rédigés par les agentes (Valérie, Inès) :
// simple, fluide, phrases courtes mais reliées entre elles (27/10 : « une idée par phrase » donnait un texte haché,
// qui faisait liste lui aussi). Longueur et énumérations vérifiées aussi par le code après la rédaction.

export const STYLE_SIMPLE = `Style (très important) : écris simplement, comme si tu parlais à l'artisan.
- Des phrases courtes : 15 mots environ, jamais plus de 20.
- Mais le texte doit COULER, pas ressembler à une suite de phrases posées les unes après les autres. Relie les idées avec des mots simples : mais, donc, alors, du coup, en plus, d'ailleurs. Deux idées liées peuvent partager une phrase. Exemple à éviter : « Votre site actuel fait bien le travail. Il ne s'affiche pas très bien sur téléphone. » Écris plutôt : « Votre site actuel fait bien le travail, mais il ne s'affiche pas très bien sur téléphone. »
- Jamais plus de deux phrases très courtes d'affilée sans mot de liaison.
- Jamais d'énumération de plus de deux éléments dans une même phrase. Exemple interdit : « Elle présente vos prestations, votre zone d'intervention et un bouton pour demander un devis, et elle s'affiche bien sur téléphone. » Écris plutôt : « On y trouve vos prestations et votre zone d'intervention. Vos clients peuvent vous demander un devis en un clic. Elle s'affiche aussi très bien sur téléphone. »
- Des mots de tous les jours, sans jargon (pas de « responsive », « référencement », « visibilité en ligne », « digital »).
- Le texte doit se lire d'une traite, à voix haute, sans reprendre son souffle.`;

const MAX_MOTS = 20;

/**
 * Phrases à couper : plus de 20 mots, une énumération (deux virgules ou plus) de plus de 14 mots, ou une
 * énumération de 3 éléments ou plus, même courte (« votre métier, Roubaix, vos prestations et votre zone »,
 * repérée le 27/10 : deux virgules et un « et »). Les lignes de lien sont ignorées.
 */
export function phrasesTropLongues(texte: string): string[] {
  return texte
    .split("\n")
    .filter((l) => !/\{\{lien_demo\}\}|https?:\/\//.test(l))
    .join(" ")
    .split(/(?<=[.?!…])\s+/)
    .map((p) => p.trim())
    .filter((p) => {
      const mots = p.split(/\s+/).filter(Boolean).length;
      const virgules = (p.match(/,/g) ?? []).length;
      // « A, B, C et D » : deux virgules et un « et » / « ou », quelle que soit la longueur de la phrase.
      const enumeration = virgules >= 2 && /\s(et|ou)\s/i.test(p);
      return mots > MAX_MOTS || (mots > 14 && virgules >= 2) || enumeration;
    });
}
