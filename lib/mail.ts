// Outils communs à la boîte mail (/boite) et à la page d'Inès (/ines).

/** Le message reçu, sans l'historique cité en dessous (affichage seulement). */
export function sansCitation(texte: string): string {
  const lignes = texte.replace(/\r/g, "").split("\n");
  const fin = lignes.findIndex((l) => /^\s*>/.test(l) || /^\s*(le|on)\s.{3,120}(a écrit|wrote)\s*:?\s*$/i.test(l));
  return (fin === -1 ? lignes : lignes.slice(0, fin)).join("\n").trim() || texte.trim();
}

/** Première ligne utile d'un texte, pour l'aperçu dans la liste. */
export function extrait(texte: string, max = 110): string {
  const t = sansCitation(texte).replace(/\s+/g, " ").replace(/^(bonjour|bonsoir|hello)[^,.!]{0,40}[,.!]\s*/i, "").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Le corps d'un e-mail de prospection tel qu'il est parti (le marqueur du lien est remplacé à l'envoi). */
export const corpsProspection = (texte: string) => texte.replace(/\{\{\s*lien_demo\s*\}\}/g, "[lien vers sa maquette]");
