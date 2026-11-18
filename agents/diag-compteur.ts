// Diagnostic du compteur d'ouvertures des maquettes (12/11, demande de Broise : « personne n'a ouvert, est-ce normal ? »).
// 1. Chiffres : par jour, premiers e-mails partis et maquettes ouvertes (base).
// 2. Essai réel : ouvre la maquette de la fiche de TEST (Colombe, écartée) comme un vrai visiteur, sur les deux domaines
//    (app.devanture-artisans.fr et devanture-sites.fr), et vérifie que la visite arrive bien en base.
//    Puis remet la fiche de test dans son état d'avant (aucune trace dans les chiffres).
// Workflow diag-compteur.yml (modifier tests/compteur.txt). Aucun e-mail, aucun artisan réel touché.
import { appendFileSync } from "node:fs";
import { chromium } from "playwright";
import { connecter } from "./lib/db.ts";

const sql = connecter();
const sortie: string[] = [];
const dire = (l: string) => { sortie.push(l); console.log(l); };

try {
  dire("## Par jour depuis le 2/11 (jour | 1ers e-mails partis | maquettes ouvertes pour la 1re fois | visites enregistrées)");
  const jours = await sql<{ j: string; partis: number; ouvertes: number; visites: number }[]>`
    with j as (select generate_series('2026-11-02'::date, (now() at time zone 'Europe/Paris')::date, '1 day')::date d)
    select to_char(j.d, 'DD/MM') j,
      (select count(*) from public.emails e where e.is_demo = false and e.relance_de is null and e.sent_at is not null
         and (e.sent_at at time zone 'Europe/Paris')::date = j.d)::int partis,
      (select count(*) from public.websites w where w.is_demo = false and w.kind = 'demo'
         and (w.premiere_vue at time zone 'Europe/Paris')::date = j.d)::int ouvertes,
      (select count(*) from public.maquette_visites v where (v.debut at time zone 'Europe/Paris')::date = j.d)::int visites
    from j order by j.d`;
  for (const r of jours) dire(`${r.j} | ${r.partis} | ${r.ouvertes} | ${r.visites}`);
  const [tot] = await sql<{ ouvertes: number; derniere: string | null }[]>`
    select count(*) filter (where vues > 0)::int ouvertes,
           to_char(max(derniere_vue) at time zone 'Europe/Paris', 'DD/MM HH24:MI') derniere
    from public.websites where kind = 'demo' and is_demo = false`;
  dire(`Total : ${tot.ouvertes} maquettes ouvertes au moins une fois ; dernière ouverture : ${tot.derniere ?? "jamais"}.`);

  // 2. Essai réel sur la fiche de test.
  const [test] = await sql<{ id: string; slug: string; vues: number; premiere_vue: Date | null; derniere_vue: Date | null; status: string }[]>`
    select w.id, w.slug, w.vues, w.premiere_vue, w.derniere_vue, w.status
    from public.websites w join public.prospects p on p.id = w.prospect_id
    where p.name ilike 'Colombe%' and w.kind = 'demo' and w.slug is not null
    order by (w.status <> 'archive') desc, w.created_at desc limit 1`;
  if (!test) throw new Error("Fiche de test « Colombe » sans maquette : essai impossible.");
  dire(`## Essai réel sur la maquette de test (${test.slug}, ${test.status})`);

  const debut = new Date();
  const navigateur = await chromium.launch();
  for (const domaine of ["app.devanture-artisans.fr", "devanture-sites.fr"]) {
    const page = await navigateur.newPage({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
    // Un vrai téléphone n'a pas navigator.webdriver : on l'efface, sinon le script ne compte pas (robots exclus).
    await page.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
    const envois: string[] = [];
    page.on("request", (r) => { if (r.method() === "POST" && r.url().includes(`/m/${test.slug}`)) envois.push(r.url()); });
    const reponses: number[] = [];
    page.on("response", (r) => { if (r.request().method() === "POST" && r.url().includes(`/m/${test.slug}`)) reponses.push(r.status()); });
    const erreurs: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text().slice(0, 150)); });
    const url = `https://${domaine}/m/${test.slug}`;
    let statut = 0;
    try {
      const res = await page.goto(url, { waitUntil: "load", timeout: 30_000 });
      statut = res?.status() ?? 0;
    } catch (err) {
      dire(`${domaine} : page impossible à ouvrir (${(err as Error).message.slice(0, 120)})`);
    }
    const script = await page.content().then((h) => h.includes("navigator.webdriver")).catch(() => false);
    await page.waitForTimeout(4_000);
    await page.close(); // déclenche aussi l'envoi de sortie
    await new Promise((r) => setTimeout(r, 1_500));
    dire(`${domaine} : page ${statut} · compteur présent : ${script ? "oui" : "NON"} · envois : ${envois.length} (réponses ${reponses.join(", ") || "aucune"})${erreurs.length ? ` · erreurs : ${erreurs.join(" / ")}` : ""}`);
  }
  await navigateur.close();

  const [apres] = await sql<{ vues: number; visites: number }[]>`
    select (select vues from public.websites where id = ${test.id}) vues,
           (select count(*)::int from public.maquette_visites where website_id = ${test.id} and debut >= ${debut}) visites`;
  const ok = apres.visites > 0;
  dire(`Résultat en base : compteur ${test.vues} → ${apres.vues}, ${apres.visites} visite(s) enregistrée(s) pendant l'essai → ${ok ? "LE COMPTEUR MARCHE" : "RIEN N'EST ARRIVÉ EN BASE"}`);

  // Remise en état de la fiche de test.
  await sql`delete from public.maquette_visites where website_id = ${test.id} and debut >= ${debut}`;
  await sql`update public.websites set vues = ${test.vues}, premiere_vue = ${test.premiere_vue}, derniere_vue = ${test.derniere_vue} where id = ${test.id}`;
  dire("Fiche de test remise dans son état d'avant.");
} catch (err) {
  dire(`ERREUR : ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, sortie.join("\n") + "\n");
}
