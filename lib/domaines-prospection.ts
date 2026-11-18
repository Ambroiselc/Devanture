// Domaines de prospection (9/11) : ceux des boîtes d'envoi de Valérie (devanture-sites.fr, puis le 2e domaine).
// Ils servent AUSSI les maquettes (/m/<slug>), pour qu'un e-mail de prospection ne mélange pas deux domaines
// (expéditeur devanture-sites.fr mais lien, réponse et désabonnement vers devanture-artisans.fr : un schéma que
// les filtres anti-spam associent au hameçonnage, et qui exposait le domaine principal à la réputation de la prospection).
// Tout le reste de ces domaines renvoie vers le site vitrine. Ajouter ici le 2e domaine quand il sera branché
// (et le relier au Worker devanture-app dans Cloudflare, voir docs/mise-en-ligne.md).
export const DOMAINES_PROSPECTION = ["devanture-sites.fr"];

export const SITE_VITRINE = "https://devanture-artisans.fr";

export function estDomaineProspection(hote: string): boolean {
  const h = hote.toLowerCase().replace(/^www\./, "");
  return DOMAINES_PROSPECTION.includes(h);
}
