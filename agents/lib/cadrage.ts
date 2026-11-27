// Cadrage des photos d'illustration (27/11, demande de Broise : « fais attention à ce que les photos soient bien cadrées »).
// Chaque photo Unsplash a un point à garder visible (visages, sujet), en % de sa largeur et de sa hauteur. Une seule feuille
// de style (`cssCadrage`) est ajoutée à toutes les maquettes : elle vise les images et les fonds par l'identifiant de la photo
// dans l'adresse, donc elle marche partout (haut de page, galeries, cartes, cadres en image de fond), quel que soit le modèle.
// Vérification : /demo/planche (chaque photo entière, puis recadrée en large, 4:5 et carré avec ce point).
// Une photo absente d'ici reste centrée (50 % 50 %). Ce fichier n'importe rien.

/** Identifiant Unsplash → [x %, y %] du point à garder. */
export const CADRAGE: Record<string, [number, number]> = {
};

export function pointDe(id: string): [number, number] {
  return CADRAGE[id] ?? [50, 50];
}

/** Feuille de style à mettre dans le <head> de chaque maquette. */
export function cssCadrage(): string {
  return Object.entries(CADRAGE).map(([id, [x, y]]) =>
    `img[src*="photo-${id}"]{object-position:${x}% ${y}%!important}[style*="photo-${id}"]{background-position:${x}% ${y}%!important}`).join("\n");
}

/** Ajoute la feuille de style de cadrage juste avant </head>. */
export function avecCadrage(html: string): string {
  const css = cssCadrage();
  return css && html.includes("</head>") ? html.replace("</head>", `<style id="cadrage">${css}</style></head>`) : html;
}
