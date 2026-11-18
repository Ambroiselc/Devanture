// Captures d'une maquette en vue téléphone : une par style, et une image « duo » (les deux côte à côte)
// pour l'e-mail. Utilise Chromium via Playwright (installé dans GitHub Actions : voir les workflows).
// Images volontairement légères (≈ 50 à 80 Ko) : elles sont gardées dans la base, limitée à 500 Mo.
import { chromium, type Browser } from "playwright";
import type { ContenuDemo } from "./demo-artisan-pro.ts";
import { STYLES, type StyleDemo } from "./demo-styles.ts";

export interface Capture {
  image: Buffer;
  width: number;
  height: number;
}

const LARGEUR = 390;
const HAUTEUR = 780;
const ECHELLE = 1.5; // 585 × 1170 pixels : net sur téléphone, deux fois plus léger qu'avant
const QUALITE = 62;

export class Photographe {
  private navigateur: Browser | null = null;

  private async ouvrir() {
    this.navigateur ??= await chromium.launch();
    return this.navigateur;
  }

  /** Capture d'un style (vue téléphone, haut de la page). */
  async capturer(contenu: ContenuDemo, style: StyleDemo = "pro"): Promise<Capture> {
    const nav = await this.ouvrir();
    const page = await nav.newPage({ viewport: { width: LARGEUR, height: HAUTEUR }, deviceScaleFactor: ECHELLE });
    try {
      const rendu = STYLES.find((s) => s.id === style)!.rendu;
      await page.setContent(rendu(contenu), { waitUntil: "networkidle", timeout: 30_000 });
      await page.evaluate(() => document.fonts.ready);
      const image = await page.screenshot({ type: "jpeg", quality: QUALITE });
      return { image, width: Math.round(LARGEUR * ECHELLE), height: Math.round(HAUTEUR * ECHELLE) };
    } finally {
      await page.close();
    }
  }

  /** Les deux styles côte à côte, avec leur nom dessous : l'image glissée dans l'e-mail. */
  async duo(pro: Capture, chaleureux: Capture): Promise<Capture> {
    const nav = await this.ouvrir();
    const page = await nav.newPage({ viewport: { width: 600, height: 640 }, deviceScaleFactor: 1.25 });
    try {
      const img = (c: Capture) => `data:image/jpeg;base64,${c.image.toString("base64")}`;
      await page.setContent(`<!doctype html><html><body style="margin:0;background:#f4f4f2;font:600 15px system-ui,sans-serif;color:#333">
        <div style="display:flex;gap:20px;justify-content:center;padding:18px 16px 10px">
          ${[pro, chaleureux].map((c, i) => `<figure style="margin:0;text-align:center">
            <img src="${img(c)}" style="width:270px;height:540px;object-fit:cover;object-position:top;border-radius:18px;border:6px solid #1d1d1d;display:block">
            <figcaption style="margin-top:8px">${i === 0 ? "Style 1 · sobre" : "Style 2 · chaleureux"}</figcaption></figure>`).join("")}
        </div></body></html>`, { waitUntil: "load" });
      const image = await page.screenshot({ type: "jpeg", quality: QUALITE, fullPage: true });
      return { image, width: 750, height: 800 };
    } finally {
      await page.close();
    }
  }

  async fermer() {
    await this.navigateur?.close();
    this.navigateur = null;
  }
}
