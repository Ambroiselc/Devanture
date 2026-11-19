// Diagnostic (19/11) : compteur du site vitrine jour par jour, comparé aux visites détaillées (humaines et robots).
// Lancé par diag-compteur.yml (« site-jours » en 1re ligne de tests/compteur.txt). Lecture seule.
import { connecter } from "./lib/db.ts";
const sql = connecter();
try {
  const compteur = await sql<{ jour: string; page: string; source: string; visites: number }[]>`
    select jour::text, page, source, visites from public.site_visites where jour >= current_date - 8 order by jour`;
  const detail = await sql<{ jour: string; heure: string; source: string; robot: boolean; retrouvee: boolean; pays: string | null; reseau: string | null; duree_s: number | null }[]>`
    select ((debut at time zone 'Europe/Paris')::date)::text as jour, to_char(debut at time zone 'Europe/Paris', 'HH24:MI') as heure,
           source, robot, retrouvee, pays, reseau, duree_s
    from public.site_visites_detail where debut >= now() - interval '9 days' order by debut`;
  const l = [
    "## Compteur (site_visites)", ...compteur.map((c) => `${c.jour} ${c.page} ${c.source} : ${c.visites}`),
    "## Visites détaillées", ...detail.map((d) => `${d.jour} ${d.heure} ${d.source} ${d.robot ? "ROBOT" : "humain"}${d.retrouvee ? " retrouvée" : ""} ${d.pays ?? "?"} ${d.reseau ?? "?"} ${d.duree_s ?? "?"} s`),
  ];
  for (const ligne of l) console.log(`SJ ${ligne}`);
} finally { await sql.end(); }
