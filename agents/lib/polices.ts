// Polices du site définitif hébergées avec le site (Pedro, 30/10), au lieu d'être chargées chez Google Fonts :
// aucune adresse IP de visiteur envoyée à Google (RGPD), et une requête de moins.
// On garde les alphabets latins (le français), les autres sont retirés.
import { createHash } from "node:crypto";
import { http } from "./http.ts";

// Google Fonts ne renvoie des fichiers WOFF2 qu'à un navigateur récent.
const NAVIGATEUR = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const LIEN = /<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)">/;

export interface Polices {
  /** Fichiers à publier : « polices/<empreinte>.woff2 » et « polices/polices-<empreinte>.css ». */
  fichiers: Map<string, Buffer>;
  /** Chemin de la feuille de style, depuis la racine du site. */
  css: string;
}

export async function heberger(html: string): Promise<Polices | null> {
  const m = LIEN.exec(html);
  if (!m) return null;
  const adresse = m[1].replace(/&amp;/g, "&");
  const res = await http(adresse, { headers: { "user-agent": NAVIGATEUR } }, 30_000);
  if (!res.ok) throw new Error(`Google Fonts : erreur ${res.status}`);
  const feuille = await res.text();

  const fichiers = new Map<string, Buffer>();
  // Un bloc par alphabet, précédé d'un commentaire : /* latin */ @font-face { … }
  const blocs = feuille.split(/(?=\/\*\s*[\w-]+\s*\*\/)/).filter((b) => /\/\*\s*latin(-ext)?\s*\*\//.test(b));
  const sortie: string[] = [];
  for (const bloc of blocs) {
    let b = bloc;
    for (const [, src] of bloc.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/g)) {
      const f = await http(src, { headers: { "user-agent": NAVIGATEUR } }, 30_000);
      if (!f.ok) throw new Error(`Google Fonts : fichier ${f.status}`);
      const donnees = Buffer.from(await f.arrayBuffer());
      const nom = `${createHash("sha256").update(donnees).digest("hex").slice(0, 12)}.woff2`;
      fichiers.set(`polices/${nom}`, donnees);
      b = b.replace(src, nom);
    }
    sortie.push(b.trim());
  }
  if (!sortie.length) throw new Error("Google Fonts : aucune police latine trouvée.");
  const css = Buffer.from(`${sortie.join("\n")}\n`);
  const nomCss = `polices/polices-${createHash("sha256").update(css).digest("hex").slice(0, 10)}.css`;
  fichiers.set(nomCss, css);
  return { fichiers, css: nomCss };
}

/** Remplace, dans une page, le lien Google Fonts par la feuille hébergée. `prefixe` : « » ou « ../ ». */
export function relier(html: string, polices: Polices | null, prefixe: string): string {
  if (!polices) return html;
  return html
    .replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\n?/, "")
    .replace(LIEN, `<link rel="stylesheet" href="${prefixe}${polices.css}">`);
}
