// L'« habillage » d'une maquette : la combinaison de variantes qui rend chaque site différent (27/10).
//
// Pour chaque style (sobre et chaleureux), on choisit une variante de :
//   palette de couleurs · polices · en-tête · bloc des prestations · bloc des réalisations.
// Ça donne plusieurs centaines de combinaisons par style, toutes prêtes et testées.
//
// Règle anti-doublon : deux artisans du même métier dans le même département (et deux clients de la même
// commune) ne reçoivent jamais un site qui se ressemble trop. Sid choisit la combinaison la plus éloignée
// de celles déjà données à ces « voisins » (voir choisirHabillage).
//
// L'habillage est rangé dans le contenu de la maquette (websites.content.habillage) : aucune migration.
// Une maquette sans habillage garde l'apparence d'avant (toutes les variantes à 0).
// Ce fichier est lu par l'agent des maquettes ET par le tableau de bord : il n'importe rien.

export interface VariantesStyle {
  palette: number;
  police: number;
  entete: number;
  prestations: number;
  realisations: number;
}

export interface Habillage {
  pro: VariantesStyle;
  chaleureux: VariantesStyle;
}

type Dimension = keyof VariantesStyle;
const DIMENSIONS: Dimension[] = ["palette", "police", "entete", "prestations", "realisations"];

/** Nombre de variantes disponibles pour chaque partie, par style. À tenir à jour avec les modèles. */
export const NB_VARIANTES: Record<keyof Habillage, VariantesStyle> = {
  pro: { palette: 7, police: 4, entete: 3, prestations: 3, realisations: 2 },
  chaleureux: { palette: 6, police: 3, entete: 3, prestations: 3, realisations: 2 },
};

/** Ce qui se voit le plus compte le plus : couleurs et en-tête d'abord. */
const POIDS: VariantesStyle = { palette: 3, police: 2, entete: 3, prestations: 1, realisations: 1 };
const DISTANCE_MAX = DIMENSIONS.reduce((s, d) => s + POIDS[d], 0);

const ZERO: VariantesStyle = { palette: 0, police: 0, entete: 0, prestations: 0, realisations: 0 };
export const HABILLAGE_PAR_DEFAUT: Habillage = { pro: { ...ZERO }, chaleureux: { ...ZERO } };

/** Variantes d'un style pour une maquette (valeurs hors limites ou absentes → 0, l'apparence d'origine). */
export function variantes(c: { habillage?: Partial<Habillage> | null }, style: keyof Habillage): VariantesStyle {
  const v = (c.habillage?.[style] ?? {}) as Partial<VariantesStyle>;
  const r = { ...ZERO };
  for (const d of DIMENSIONS) {
    const n = Number(v[d]);
    r[d] = Number.isInteger(n) && n >= 0 && n < NB_VARIANTES[style][d] ? n : 0;
  }
  return r;
}

/** Plus c'est grand, plus les deux sites sont différents (0 = identiques). */
export function distance(a: VariantesStyle, b: VariantesStyle): number {
  return DIMENSIONS.reduce((s, d) => s + (a[d] === b[d] ? 0 : POIDS[d]), 0);
}

function toutesLesCombinaisons(style: keyof Habillage): VariantesStyle[] {
  const n = NB_VARIANTES[style];
  const liste: VariantesStyle[] = [];
  for (let palette = 0; palette < n.palette; palette++)
    for (let police = 0; police < n.police; police++)
      for (let entete = 0; entete < n.entete; entete++)
        for (let prestations = 0; prestations < n.prestations; prestations++)
          for (let realisations = 0; realisations < n.realisations; realisations++)
            liste.push({ palette, police, entete, prestations, realisations });
  return liste;
}

/** Combien de parties une combinaison partage avec les sites déjà faits (pour bien répartir les variantes). */
function usure(c: VariantesStyle, autres: VariantesStyle[]): number {
  let s = 0;
  for (const a of autres) s += DISTANCE_MAX - distance(c, a);
  return s;
}

function choisirStyle(
  style: keyof Habillage,
  voisins: VariantesStyle[],
  autres: VariantesStyle[],
  hasard: () => number,
): VariantesStyle {
  let meilleurs: VariantesStyle[] = [];
  let meilleurEcart = -1;
  let meilleureUsure = Infinity;
  for (const c of toutesLesCombinaisons(style)) {
    // 1. Le plus loin possible du voisin le plus ressemblant.
    const ecart = voisins.length ? Math.min(...voisins.map((v) => distance(c, v))) : DISTANCE_MAX;
    // 2. À écart égal, la combinaison la moins utilisée ailleurs.
    const u = usure(c, autres);
    if (ecart > meilleurEcart || (ecart === meilleurEcart && u < meilleureUsure)) {
      meilleurEcart = ecart;
      meilleureUsure = u;
      meilleurs = [c];
    } else if (ecart === meilleurEcart && u === meilleureUsure) {
      meilleurs.push(c);
    }
  }
  return meilleurs[Math.floor(hasard() * meilleurs.length)] ?? { ...ZERO };
}

/**
 * Choisit l'habillage d'une nouvelle maquette.
 * `voisins` : habillages des sites à ne surtout pas imiter (même métier et même département, clients de la même commune).
 * `autres` : tous les autres habillages déjà donnés (pour varier aussi d'un métier à l'autre).
 */
export function choisirHabillage(
  voisins: Partial<Habillage>[],
  autres: Partial<Habillage>[] = [],
  hasard: () => number = Math.random,
): Habillage {
  const lire = (liste: Partial<Habillage>[], s: keyof Habillage) =>
    liste.filter((h) => h?.[s]).map((h) => variantes({ habillage: h }, s));
  return {
    pro: choisirStyle("pro", lire(voisins, "pro"), lire(autres, "pro"), hasard),
    chaleureux: choisirStyle("chaleureux", lire(voisins, "chaleureux"), lire(autres, "chaleureux"), hasard),
  };
}

/** Un habillage tiré au hasard (page d'exemple). */
export function habillageAuHasard(hasard: () => number = Math.random): Habillage {
  const tirer = (s: keyof Habillage) =>
    Object.fromEntries(DIMENSIONS.map((d) => [d, Math.floor(hasard() * NB_VARIANTES[s][d])])) as unknown as VariantesStyle;
  return { pro: tirer("pro"), chaleureux: tirer("chaleureux") };
}

/** « 2.1.0.2.1-4.0.2.1.0 » : l'habillage en une courte chaîne (adresse de la page d'exemple, journal de Sid). */
export function codeHabillage(h: Habillage): string {
  const s = (v: VariantesStyle) => DIMENSIONS.map((d) => v[d]).join(".");
  return `${s(h.pro)}-${s(h.chaleureux)}`;
}

export function lireCodeHabillage(code: string | null | undefined): Habillage | null {
  const m = /^(\d\.\d\.\d\.\d\.\d)-(\d\.\d\.\d\.\d\.\d)$/.exec(code ?? "");
  if (!m) return null;
  const lire = (t: string) =>
    Object.fromEntries(t.split(".").map((n, i) => [DIMENSIONS[i], Number(n)])) as unknown as VariantesStyle;
  const brut = { pro: lire(m[1]), chaleureux: lire(m[2]) };
  return { pro: variantes({ habillage: brut }, "pro"), chaleureux: variantes({ habillage: brut }, "chaleureux") };
}
