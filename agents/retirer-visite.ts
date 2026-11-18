// Retire la DERNIÈRE ouverture d'une maquette quand c'était Broise (12/11 : AB Serruriers).
// Usage : node agents/retirer-visite.ts "<début du nom de l'entreprise>"
// Affiche les visites avant/après. Retire les lignes de maquette_visites des 30 dernières minutes avant la dernière
// ouverture (une « vue » = une visite par 30 min), enlève 1 au compteur et recalcule première / dernière ouverture.
import { connecter } from "./lib/db.ts";

const nom = process.argv[2];
if (!nom) throw new Error("Nom de l'entreprise manquant.");
const sql = connecter();
const fmt = (d: Date | null) => d ? d.toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) : "—";
try {
  const ms = await sql<{ id: string; name: string; vues: number; premiere_vue: Date | null; derniere_vue: Date | null }[]>`
    select w.id, p.name, w.vues, w.premiere_vue, w.derniere_vue
    from public.websites w join public.prospects p on p.id = w.prospect_id
    where w.kind = 'demo' and w.is_demo = false and p.name ilike ${"%" + nom.replace(/\s+/g, "%") + "%"} and w.vues > 0`;
  if (ms.length !== 1) throw new Error(`${ms.length} maquette(s) ouverte(s) trouvée(s) pour « ${nom} » : ${ms.map((m) => m.name).join(", ") || "aucune"}. Rien changé.`);
  const m = ms[0];
  const visites = await sql<{ debut: Date; duree: number | null; appareil: string | null }[]>`
    select debut, duree_s as duree, appareil from public.maquette_visites where website_id = ${m.id} order by debut`;
  console.log(`${m.name} : ${m.vues} ouverture(s), première ${fmt(m.premiere_vue)}, dernière ${fmt(m.derniere_vue)}`);
  for (const v of visites) console.log(`  visite ${fmt(v.debut)}${v.duree != null ? ` · ${v.duree} s` : ""}${v.appareil ? ` · ${v.appareil}` : ""}`);

  await sql.begin(async (t) => {
    const fin = m.derniere_vue ?? new Date();
    await t`delete from public.maquette_visites where website_id = ${m.id} and debut > ${new Date(fin.getTime() - 30 * 60_000)}`;
    await t`update public.websites w set
        vues = greatest(w.vues - 1, 0),
        derniere_vue = case when w.vues - 1 > 0 then coalesce((select max(v.debut) from public.maquette_visites v where v.website_id = w.id), w.premiere_vue) end,
        premiere_vue = case when w.vues - 1 > 0 then w.premiere_vue end
      where w.id = ${m.id}`;
  });
  const [apres] = await sql<{ vues: number; premiere_vue: Date | null; derniere_vue: Date | null }[]>`select vues, premiere_vue, derniere_vue from public.websites where id = ${m.id}`;
  const msg = `${m.name} : dernière ouverture (${fmt(m.derniere_vue)}) retirée → ${apres.vues} ouverture(s), dernière ${fmt(apres.derniere_vue)}`;
  console.log(msg);
  console.log(`::notice title=Visite retirée::${msg}`);
} catch (err) {
  console.log(`::error title=Visite retirée::${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
