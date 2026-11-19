// Retire du compteur du site vitrine les visites venues de l'étranger (19/11, demande de Broise : « les trucs
// CHINANET, c'est pas des bots ? »). Depuis ce jour, lib/reseau.ts les reconnaît comme robots à l'arrivée ; ce script
// nettoie celles d'avant : la visite détaillée passe « robot » et le compteur du jour perd 1.
// Relançable sans danger (une visite déjà marquée robot n'est plus touchée). Lancé par diag-compteur.yml
// (« robots-site » en 1re ligne de tests/compteur.txt).
import { connecter } from "./lib/db.ts";
import { PAYS_HUMAINS } from "../lib/reseau.ts";

const sql = connecter();
try {
  const pays = [...PAYS_HUMAINS];
  const lignes = await sql<{ id: string; jour: string; page: string; source: string; pays: string; reseau: string | null }[]>`
    select id, ((debut at time zone 'Europe/Paris')::date)::text as jour, page, source, pays, reseau
    from public.site_visites_detail
    where robot = false and retrouvee = false and pays is not null and upper(pays) <> all(${pays})`;
  await sql.begin(async (t) => {
    for (const l of lignes) {
      await t`update public.site_visites_detail set robot = true where id = ${l.id}`;
      await t`update public.site_visites set visites = greatest(visites - 1, 0)
              where jour = ${l.jour} and page = ${l.page} and source = ${l.source}`;
    }
  });
  // 19/11 (feu vert de Broise à 12 h 18) : le compteur du jour gardait 1 visite de robot en trop. Depuis le 12/11, chaque
  // visite a sa ligne détaillée : le compteur de ces jours-là est recalculé à partir des visites humaines détaillées.
  await sql.begin(async (t) => {
    await t`delete from public.site_visites where jour >= '2026-11-12'`;
    await t`insert into public.site_visites (jour, page, source, visites)
            select (debut at time zone 'Europe/Paris')::date, page, source, count(*)::int
            from public.site_visites_detail
            where robot = false and (debut at time zone 'Europe/Paris')::date >= '2026-11-12'
            group by 1, 2, 3`;
  });
  console.log("SJ Compteur recalculé depuis le 12/11 à partir des visites humaines détaillées.");
  const parPays: Record<string, number> = {};
  for (const l of lignes) parPays[`${l.pays} (${l.reseau ?? "?"})`] = (parPays[`${l.pays} (${l.reseau ?? "?"})`] ?? 0) + 1;
  const texte = `${lignes.length} visite(s) de l'étranger retirée(s) du compteur%0A${Object.entries(parPays).map(([k, n]) => `${k} : ${n}`).join("%0A")}`;
  console.log(`::notice title=Robots du site::${texte}`);
} finally {
  await sql.end();
}
