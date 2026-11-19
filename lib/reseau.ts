// Réseau d'où vient une visite (13/11), lu dans les propriétés Cloudflare de la requête (numéro AS et nom de
// l'opérateur), JAMAIS l'adresse IP. Sert à reconnaître les robots qui se font passer pour des navigateurs :
// diagnostic du 13/11 (agents/diag-azure.ts) : Microsoft 365 ouvre les liens de chaque e-mail reçu depuis ses
// serveurs (Dublin, San José, Paris), exécute la page (maquette ET site vitrine) et était compté comme une visite.
// Une vraie personne navigue depuis un fournisseur d'accès (Orange, Free, SFR, Bouygues, Starlink…), pas un hébergeur.
export const RESEAUX_ROBOTS: Record<number, string> = {
  8075: "Microsoft (vérification des liens des e-mails)", 8068: "Microsoft", 8069: "Microsoft",
  15169: "Google", 396982: "Google Cloud", 16509: "Amazon", 14618: "Amazon", 16276: "OVH (hébergeur)",
  24940: "Hetzner", 14061: "DigitalOcean", 212238: "Datacamp (hébergeur)", 60068: "CDN77", 13335: "Cloudflare",
  20473: "Vultr", 63949: "Linode", 12876: "Scaleway", 31898: "Oracle Cloud", 45102: "Alibaba Cloud",
  202425: "IP Volume (hébergeur)", 41564: "hébergeur", 9009: "M247 (hébergeur)",
  4134: "Chinanet (robots)", 4837: "China Unicom (robots)", 132203: "Tencent Cloud", 136907: "Huawei Cloud",
};

/**
 * 19/11 (visites « CHINANET henan », 4 et 11 s, Linux, la même minute) : nos artisans sont en France. Une visite venue
 * d'un pays qui n'est ni la France (outre-mer compris) ni un voisin proche est comptée comme un robot.
 * Pays inconnu : on la garde.
 */
export const PAYS_HUMAINS = new Set(["FR", "GP", "MQ", "GF", "RE", "YT", "PM", "NC", "PF", "BL", "MF",
  "BE", "LU", "CH", "MC", "AD", "DE", "ES", "IT", "NL", "GB", "PT", "IE"]);

export interface Reseau { reseau: string | null; pays: string | null; robot: boolean; motif: string | null }

export function lireReseau(cf: { asn?: unknown; asOrganization?: unknown; country?: unknown } | undefined | null): Reseau {
  const asn = Number(cf?.asn ?? 0);
  const org = typeof cf?.asOrganization === "string" ? cf.asOrganization.slice(0, 60) : null;
  const pays = typeof cf?.country === "string" ? cf.country.slice(0, 2) : null;
  const motif = RESEAUX_ROBOTS[asn] ?? (pays && !PAYS_HUMAINS.has(pays.toUpperCase()) ? `visite depuis l'étranger (${pays})` : null);
  return { reseau: org, pays, robot: Boolean(motif), motif };
}
