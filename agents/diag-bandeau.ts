// 13/11, EN LECTURE SEULE : vérifie que le bandeau « Ce site m'intéresse » est bien en haut d'une vraie maquette
// (lien d'aperçu : la visite n'est pas comptée). Lancé par diag-compteur.yml (« bandeau » dans tests/compteur.txt).
import { connecter } from "./lib/db.ts";
const sql = connecter();
try {
  const [w] = await sql<{ slug: string }[]>`select slug from public.websites where kind = 'demo' and status = 'pret' and slug is not null order by created_at desc limit 1`;
  for (const base of ["https://app.devanture-artisans.fr", "https://devanture-sites.fr"]) {
    const r = await fetch(`${base}/m/${w.slug}?apercu=1`);
    const html = await r.text();
    const i = html.indexOf('id="dv-interet"'), b = html.indexOf("<body>");
    console.log(`${base} : ${r.status} · bandeau ${i > 0 ? `présent, ${i - b} caractères après <body>` : "ABSENT"}`);
  }
} finally { await sql.end(); }
