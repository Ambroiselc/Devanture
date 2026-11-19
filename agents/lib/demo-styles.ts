// Les deux styles de maquette proposés à chaque artisan, et le petit sélecteur affiché en haut de la page.
// Lu par l'agent des maquettes ET par le tableau de bord (et plus tard la page publique des maquettes).
import { renderArtisanChaleureux } from "./demo-artisan-chaleureux.ts";
import { renderArtisanPro, type ContenuDemo } from "./demo-artisan-pro.ts";

export type StyleDemo = "pro" | "chaleureux";

export const STYLES: { id: StyleDemo; nom: string; rendu: (c: ContenuDemo) => string }[] = [
  // 19/11 (demande de Broise) : le style chaleureux s'affiche en premier (style par défaut des maquettes).
  { id: "chaleureux", nom: "Style 1 · chaleureux", rendu: renderArtisanChaleureux },
  { id: "pro", nom: "Style 2 · sobre", rendu: renderArtisanPro },
];

export const estStyle = (s: unknown): s is StyleDemo => s === "pro" || s === "chaleureux";

/**
 * Page d'une maquette avec, tout en haut, le choix entre les deux styles.
 * `lien(style)` donne l'adresse de la même maquette dans l'autre style.
 */
export function renderAvecSelecteur(
  c: ContenuDemo,
  style: StyleDemo,
  lien: (s: StyleDemo) => string,
  /** Facultatif (page d'exemple) : lien « Autre combinaison » qui tire un nouvel habillage. */
  lienAutre?: string,
): string {
  const html = STYLES.find((s) => s.id === style)!.rendu(c);
  const boutons = STYLES.map((s) => s.id === style
    ? `<span aria-current="page" style="background:#fff;color:#111;border-radius:999px;padding:6px 14px;font-weight:700">${s.nom}</span>`
    : `<a href="${lien(s.id)}" style="color:#fff;text-decoration:none;border-radius:999px;padding:6px 14px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.5)">${s.nom}</a>`).join("");
  const barre = `<div style="position:relative;z-index:50;background:#111;color:#fff;font:600 14px/1.2 system-ui,sans-serif;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px;padding:8px 16px">
<span style="opacity:.75">Deux styles pour votre site :</span>${boutons}${lienAutre
    ? `<a href="${lienAutre}" style="color:#111;background:#FFD866;text-decoration:none;border-radius:999px;padding:6px 14px;font-weight:700">🎲 Autre combinaison</a>`
    : ""}</div>`;
  return html.replace("<body>", `<body>\n${barre}`);
}
