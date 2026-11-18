// Version HTML des e-mails de prospection (27/10) : partagée par l'envoi (agents/envoi.ts) et par le contrôle
// anti-spam hebdomadaire (agents/controle-spam.ts), pour que le contrôle teste exactement ce qui part.

const echapper = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Version HTML sobre de l'e-mail : paragraphes, le lien cliquable, et l'image de la maquette si prévue. */
export function versHtml(texte: string, lien: string, avecImage: boolean): string {
  const blocs = texte.split(/\n{2,}/).map((bloc) => {
    if (bloc.trim() === lien) {
      // Image NON cliquable (27/10, test mail-tester) : une image-lien dans un e-mail court coûte des points
      // anti-spam (HTML_SHORT_LINK_IMG). Le lien reste juste en dessous, en texte.
      const image = avecImage
        ? `<img src="cid:maquette" alt="Aperçu des deux styles de votre site, côte à côte" width="420" style="display:block;max-width:100%;border:1px solid #ddd;border-radius:8px;margin:0 0 8px">`
        : "";
      return `<p>${image}<a href="${lien}">${echapper(lien)}</a></p>`;
    }
    return `<p>${echapper(bloc).replace(/\n/g, "<br>")}</p>`;
  });
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222">${blocs.join("\n")}</div>`;
}
