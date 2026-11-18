// Statistiques de Loïc (27/10) : combien de fiches, d'e-mails et de qualifiés par jour, lancements automatiques
// seulement, sur les 7 derniers jours. Lancé à la main (workflow stats-prospection.yml) ; n'écrit rien dans la base.
// Le résumé sort aussi en « notice » GitHub, lisible depuis l'API (annotations de la tâche).
import { appendFileSync } from "node:fs";
import { connecter } from "./lib/db.ts";

const sql = connecter();
try {
  const [reglages] = await sql<{ default_limit: number; auto_enabled: boolean; max_google_day: number }[]>`
    select default_limit, auto_enabled, max_google_day from public.agent_settings where agent = 'prospection'`;
  const jours = await sql<{ jour: string; methode: string; lancements: number; fiches: number; avec_email: number;
    qualifies: number; ecartes: number; google: number; cout: number }[]>`
    select to_char(started_at at time zone 'Europe/Paris', 'YYYY-MM-DD') as jour,
           coalesce(input->>'methode', '?') as methode,
           count(*)::int as lancements,
           coalesce(sum((output->>'candidats')::int), 0)::int as fiches,
           coalesce(sum((output->>'avec_email')::int), 0)::int as avec_email,
           coalesce(sum((output->>'qualifies')::int), 0)::int as qualifies,
           coalesce(sum((output->>'ecartes')::int), 0)::int as ecartes,
           coalesce(sum((output->>'requetes_google')::int), 0)::int as google,
           coalesce(sum((output->>'cout_ia_eur')::numeric), 0)::float as cout
    from public.tasks
    where agent = 'prospection' and input->>'mode' = 'automatique' and started_at > now() - interval '7 days'
    group by 1, 2 order by 1, 2`;
  const nouveaux = await sql<{ jour: string; n: number; avec_email: number }[]>`
    select to_char(created_at at time zone 'Europe/Paris', 'YYYY-MM-DD') as jour, count(*)::int as n,
           count(*) filter (where email is not null)::int as avec_email
    from public.prospects where created_at > now() - interval '7 days' and is_demo = false
    group by 1 order by 1`;
  const depuis = await sql<{ lancements: number; fiches: number; qualifies: number; avec_email: number }[]>`
    select count(*)::int as lancements, coalesce(sum((output->>'candidats')::int), 0)::int as fiches,
           coalesce(sum((output->>'qualifies')::int), 0)::int as qualifies,
           coalesce(sum((output->>'avec_email')::int), 0)::int as avec_email
    from public.tasks
    where agent = 'prospection' and input->>'mode' = 'automatique' and started_at > '2026-10-27T09:40:00Z'`;

  const lignes = [
    `Réglages : ${reglages?.default_limit} fiches par lancement, automatique ${reglages?.auto_enabled ? "activé" : "désactivé"}, Google ${reglages?.max_google_day}/jour`,
    "Par jour (automatique) : jour | méthode | lancements | fiches notées | avec e-mail | qualifiés | écartés | fiches Google | coût IA",
    ...jours.map((j) => `${j.jour} | ${j.methode} | ${j.lancements} | ${j.fiches} | ${j.avec_email} | ${j.qualifies} | ${j.ecartes} | ${j.google} | ${j.cout.toFixed(3)} €`),
    "Prospects créés par jour (toutes sources) : " + nouveaux.map((n) => `${n.jour} : ${n.n} (${n.avec_email} avec e-mail)`).join(" ; "),
    `Depuis les nouveaux réglages (27/10, 10 h 40) : ${depuis[0].lancements} lancement(s), ${depuis[0].fiches} fiches, ${depuis[0].avec_email} avec e-mail, ${depuis[0].qualifies} qualifiés`,
  ];
  console.log(lignes.join("\n"));
  // Une seule annotation (GitHub en limite le nombre) : retours à la ligne encodés.
  console.log(`::notice title=Statistiques de Loïc::${lignes.join("%0A")}`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lignes.map((l) => `- ${l}`).join("\n") + "\n");
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
