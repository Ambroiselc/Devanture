// Visites du site vitrine retrouvées dans les journaux Cloudflare (12/11, demande de Broise) : du 5 au 12/11, le compteur
// plantait (site_vue, corrigée le 12/11 à 10 h 26) ; chaque visite avait quand même appelé /api/visite, noté par
// Cloudflare (agents/diag-visites-perdues.ts). On les ajoute à site_visites, page d'accueil, provenance « journaux
// cloudflare » (la vraie provenance n'est pas connue). 12/11 : sans les visites d'essai de Claude.
// Sans effet si on le relance : remplace les lignes « journaux cloudflare » au lieu de les ajouter.
import { connecter } from "./lib/db.ts";

const SOURCE = "journaux cloudflare";
const VISITES: [string, number][] = [
  ["2026-11-05", 1], ["2026-11-06", 10], ["2026-11-07", 1], ["2026-11-08", 1],
  ["2026-11-09", 25], ["2026-11-10", 13], ["2026-11-11", 5], ["2026-11-12", 5],
];

const sql = connecter();
try {
  await sql.begin(async (t) => {
    await t`delete from public.site_visites where source = ${SOURCE}`;
    for (const [jour, n] of VISITES) {
      await t`insert into public.site_visites (jour, page, source, visites) values (${jour}, '/', ${SOURCE}, ${n})`;
    }
  });
  const [r] = await sql<{ n: number }[]>`select coalesce(sum(visites), 0)::int n from public.site_visites where source = ${SOURCE}`;
  console.log(`Visites retrouvées ajoutées : ${r.n}`);
  console.log(`::notice title=Visites retrouvées::${r.n} visites ajoutées au site vitrine (provenance « ${SOURCE} »)`);
} catch (err) {
  console.log(`::error title=Visites retrouvées::${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
