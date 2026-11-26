// Visite du site actuel d'un artisan : quelques indices sur son âge, et son adresse e-mail.
// On ne lit que 3 pages au maximum (accueil, contact, mentions légales), poliment.
import { http, USER_AGENT } from "./http.ts";

export interface AnalyseSite {
  /** Adresse réellement visitée (après redirections), ou null si le site ne répond pas. */
  url: string | null;
  reseauSocial: boolean;
  repond: boolean;
  indices: {
    https: boolean;
    mobile: boolean; // balise « viewport » présente
    titre: string | null;
    description: string | null;
    generateur: string | null;
    derniereAnnee: number | null; // année la plus récente vue (©, copyright…)
    extrait: string; // début du texte visible, pour que Claude juge le site
  } | null;
  email: string | null;
  emailSource: string | null;
}

/** Pages Facebook, Pages Jaunes… : pas un vrai site, et on ne les visite pas. */
const SOCIAUX = [
  "facebook.com", "fb.com", "instagram.com", "linkedin.com", "pagesjaunes.fr", "linktr.ee",
  "tiktok.com", "x.com", "twitter.com", "youtube.com", "google.com", "business.site", "g.page",
];

/** Messageries grand public : une adresse chez eux appartient bien à l'artisan. */
const WEBMAILS = [
  "gmail.com", "hotmail.fr", "hotmail.com", "outlook.fr", "outlook.com", "live.fr", "live.com",
  "yahoo.fr", "yahoo.com", "orange.fr", "wanadoo.fr", "free.fr", "sfr.fr", "neuf.fr", "bbox.fr",
  "laposte.net", "icloud.com", "aol.com", "numericable.fr",
];

/** Adresses de service (support, administration…) : jamais celles de la personne. Aussi vérifié à l'envoi (envoi.ts). */
export const ADRESSE_GENERIQUE = /^(support|help|aide|assistance|admin|administrat\w*|webmaster|hostmaster|postmaster|no-?reply|privacy|dpo|rgpd|legal|abuse|billing|sales)@/i;

export function hote(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function estReseauSocial(url: string): boolean {
  const h = hote(url);
  return !!h && SOCIAUX.some((s) => h === s || h.endsWith(`.${s}`));
}

/** Domaine « principal » : plomberie-dupont.fr pour contact.plomberie-dupont.fr. */
function domainePrincipal(h: string): string {
  return h.split(".").slice(-2).join(".");
}

/** Remet en clair les adresses masquées (&#64;, [at], (arobase)…). */
function decoder(html: string): string {
  return html
    .replace(/&#64;|&#x40;|&commat;/gi, "@")
    .replace(/&#46;|&#x2e;|&period;/gi, ".")
    .replace(/\s*[[(]\s*(?:at|arobase)\s*[\])]\s*/gi, "@")
    .replace(/\s*[[(]\s*(?:dot|point)\s*[\])]\s*/gi, ".");
}

/**
 * Cherche les adresses e-mail d'une page et ne garde que celles qui appartiennent
 * à l'artisan : même domaine que son site, ou messagerie grand public.
 * (Ça écarte l'adresse de l'agence web qui a fait le site, souvent en bas de page.)
 */
export function extraireEmails(html: string, siteHote: string | null): string[] {
  const texte = decoder(html);
  const trouves = new Set<string>();
  for (const m of texte.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) {
    const email = m[0].toLowerCase().replace(/^mailto:/, "").replace(/\.+$/, "");
    if (/\.(png|jpe?g|gif|svg|webp|css|js)$/.test(email)) continue;
    if (/^(no-?reply|ne-pas-repondre|example|exemple|test|email|nom|votre|your)@/.test(email)) continue;
    // 26/11 : adresse de la plateforme qui héberge le site (« support@strivee.app » sur train.strivee.app), pas la sienne.
    if (ADRESSE_GENERIQUE.test(email)) continue;
    trouves.add(email);
  }

  const principal = siteHote ? domainePrincipal(siteHote) : null;
  return [...trouves].filter((email) => {
    const domaine = email.split("@")[1];
    if (/^(example|exemple|domain|email)\.[a-z]+$|sentry|wixpress/.test(domaine)) return false;
    return WEBMAILS.includes(domaine) || (!!principal && domainePrincipal(domaine) === principal);
  });
}

/** Choisit la meilleure adresse : contact@ > devis@ > autre du domaine > webmail. */
export function choisirEmail(emails: string[], siteHote: string | null): string | null {
  if (emails.length === 0) return null;
  const principal = siteHote ? domainePrincipal(siteHote) : null;
  const rang = (e: string) => {
    const [local, domaine] = e.split("@");
    const sienne = !!principal && domainePrincipal(domaine) === principal;
    return (sienne ? 0 : 10) + (/^(contact|info|devis|accueil|bonjour)$/.test(local) ? 0 : 1);
  };
  return [...emails].sort((a, b) => rang(a) - rang(b))[0];
}

function texteVisible(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const meta = (html: string, nom: string) =>
  html.match(new RegExp(`<meta[^>]+name=["']${nom}["'][^>]*content=["']([^"']*)["']`, "i"))?.[1]?.trim() ||
  html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*name=["']${nom}["']`, "i"))?.[1]?.trim() ||
  null;

export function indicesPage(html: string, url: string): NonNullable<AnalyseSite["indices"]> {
  const texte = texteVisible(html);
  const annees = [...texte.matchAll(/(?:©|copyright|&copy;)\s*(?:\d{4}\s*[-–]\s*)?((?:19|20)\d{2})/gi)]
    .map((m) => Number(m[1]))
    .filter((a) => a <= new Date().getFullYear());
  return {
    https: url.startsWith("https://"),
    mobile: /<meta[^>]+name=["']viewport["']/i.test(html),
    titre: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim().slice(0, 150) || null,
    description: meta(html, "description")?.slice(0, 250) ?? null,
    generateur: meta(html, "generator")?.slice(0, 80) ?? null,
    derniereAnnee: annees.length ? Math.max(...annees) : null,
    extrait: texte.slice(0, 900),
  };
}

async function lirePage(url: string): Promise<{ html: string; url: string } | null> {
  try {
    const res = await http(url, { headers: { "user-agent": USER_AGENT, accept: "text/html" }, redirect: "follow" }, 10_000);
    if (!res.ok || !(res.headers.get("content-type") ?? "text/html").includes("html")) return null;
    const html = (await res.text()).slice(0, 600_000);
    return { html, url: res.url || url };
  } catch {
    return null;
  }
}

/** Liens internes vers les pages où l'adresse e-mail se trouve souvent. */
function pagesContact(html: string, base: string): string[] {
  const liens = new Set<string>();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const [, href, label] = m;
    if (!/contact|mention|legal|l[ée]gales|a-propos|qui-sommes/i.test(`${href} ${label}`)) continue;
    try {
      const u = new URL(href, base);
      if (u.hostname === new URL(base).hostname) liens.add(u.toString());
    } catch {
      /* lien invalide : ignoré */
    }
  }
  return [...liens].slice(0, 2);
}

export async function analyserSite(site: string | null): Promise<AnalyseSite> {
  const vide = { url: null, reseauSocial: false, repond: false, indices: null, email: null, emailSource: null };
  if (!site) return vide;
  if (estReseauSocial(site)) return { ...vide, reseauSocial: true };

  const accueil = await lirePage(site);
  if (!accueil) return { ...vide, url: site };

  const siteHote = hote(accueil.url);
  let emails = extraireEmails(accueil.html, siteHote);
  let source = accueil.url;

  if (emails.length === 0) {
    for (const page of pagesContact(accueil.html, accueil.url)) {
      const p = await lirePage(page);
      if (!p) continue;
      emails = extraireEmails(p.html, siteHote);
      if (emails.length) {
        source = p.url;
        break;
      }
    }
  }

  const email = choisirEmail(emails, siteHote);
  return {
    url: accueil.url,
    reseauSocial: false,
    repond: true,
    indices: indicesPage(accueil.html, accueil.url),
    email,
    emailSource: email ? source : null,
  };
}
