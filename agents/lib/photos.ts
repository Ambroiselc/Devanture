// Photos et logo du client pour son site (Pedro, 30/10) : remis droit, réduits, en WebP (deux tailles).
// Outil : « sharp », installé seulement dans le workflow de Pedro (npm i --no-save sharp), d'où l'import dynamique.
// Photos d'iPhone (HEIC) : converties d'abord en JPEG par « heif-convert » (paquet libheif-examples du workflow).
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

interface Image {
  rotate(): Image;
  resize(o: { width?: number; height?: number; fit?: string; withoutEnlargement?: boolean }): Image;
  webp(o: { quality: number; effort?: number; alphaQuality?: number }): Image;
  png(o?: { compressionLevel?: number }): Image;
  jpeg(o: { quality: number }): Image;
  flatten(o: { background: string }): Image;
  trim(o?: { threshold?: number }): Image;
  metadata(): Promise<{ width?: number; height?: number; format?: string; hasAlpha?: boolean }>;
  toBuffer(o: { resolveWithObject: true }): Promise<{ data: Buffer; info: { width: number; height: number } }>;
  toBuffer(): Promise<Buffer>;
}
type Sharp = (entree: Buffer, o?: { density?: number; failOn?: string; limitInputPixels?: number }) => Image;

let sharpCharge: Sharp | null = null;
async function sharp(): Promise<Sharp> {
  if (sharpCharge) return sharpCharge;
  const nom = "sharp"; // nom dans une variable : la construction du tableau de bord n'a pas besoin de ce paquet
  try {
    sharpCharge = ((await import(nom)) as { default: Sharp }).default;
  } catch {
    throw new Error("Le paquet « sharp » manque (il s'installe dans le workflow de Pedro : npm i --no-save sharp).");
  }
  return sharpCharge;
}

const HEIC = /\.(heic|heif)$/i;

/** HEIC (iPhone) → JPEG. Les autres formats ressortent tels quels. */
async function lisible(nom: string, donnees: Buffer): Promise<Buffer> {
  if (!HEIC.test(nom) && !(donnees.length > 12 && donnees.subarray(4, 12).toString("latin1").match(/ftyp(heic|heix|mif1|msf1)/))) {
    return donnees;
  }
  const dossier = await mkdtemp(join(tmpdir(), "pedro-heic-"));
  try {
    await writeFile(join(dossier, "entree.heic"), donnees);
    await exec("heif-convert", ["-q", "92", join(dossier, "entree.heic"), join(dossier, "sortie.jpg")], { timeout: 60_000 });
    return await readFile(join(dossier, "sortie.jpg"));
  } catch (err) {
    throw new Error(`photo HEIC illisible (${(err as Error).message.split("\n")[0]})`);
  } finally {
    await rm(dossier, { recursive: true, force: true });
  }
}

export interface PhotoPrete {
  grande: Buffer;
  petite: Buffer;
  largeur: number;
  hauteur: number;
  /** Miniature JPEG (384 px) pour que Claude regarde la photo. */
  miniature: Buffer;
}

export async function preparerPhoto(nom: string, donnees: Buffer): Promise<PhotoPrete> {
  const s = await sharp();
  const entree = await lisible(nom, donnees);
  const opts = { failOn: "none", limitInputPixels: 120_000_000 };
  const grande = await s(entree, opts).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 78, effort: 5 }).toBuffer({ resolveWithObject: true });
  const petite = await s(entree, opts).rotate().resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 74, effort: 5 }).toBuffer();
  const miniature = await s(entree, opts).rotate().resize({ width: 384, height: 384, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }).jpeg({ quality: 70 }).toBuffer();
  return { grande: grande.data, petite, largeur: grande.info.width, hauteur: grande.info.height, miniature };
}

/**
 * Logo : bords vides retirés, 96 px de haut (deux fois la taille affichée, pour les écrans fins), fond transparent gardé.
 * Un logo SVG est redessiné en image (un SVG peut contenir du code : on ne le publie jamais tel quel).
 */
export async function preparerLogo(nom: string, donnees: Buffer): Promise<{ image: Buffer; largeur: number; hauteur: number }> {
  if (/\.pdf$/i.test(nom) || donnees.subarray(0, 5).toString("latin1") === "%PDF-") {
    throw new Error("logo en PDF : demander une image (PNG ou JPEG) au client");
  }
  const s = await sharp();
  const entree = await lisible(nom, donnees);
  let base = s(entree, { density: 300, failOn: "none" }).rotate();
  try {
    base = s(await base.trim({ threshold: 12 }).toBuffer(), { failOn: "none" });
  } catch {
    // Logo uni ou déjà sans marge : on le garde tel quel.
    base = s(entree, { density: 300, failOn: "none" }).rotate();
  }
  const r = await base.resize({ height: 96, withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 95 })
    .toBuffer({ resolveWithObject: true });
  // Affiché à 48 px de haut : on donne la taille d'affichage.
  return { image: r.data, largeur: Math.round((r.info.width * 48) / r.info.height), hauteur: 48 };
}
