// Diagnostic du compteur de visites du SITE VITRINE devanture-artisans.fr (12/11, demande de Broise).
// 1. Chiffres en base (site_visites) par jour et par provenance.
// 2. Essai réel : un « visiteur » arrive de Google sur la page d'accueil, comme un vrai téléphone, reste 7 s ;
//    on regarde si le petit script envoie bien la visite à /api/visite et si elle arrive en base.
//    La visite de l'essai est ensuite retirée (aucune trace dans tes chiffres).
// Workflow diag-compteur.yml (modifier tests/compteur.txt avec « site » en 1re ligne).
import { appendFileSync } from "node:fs";
import { chromium } from "playwright";
import { connecter } from "./lib/db.ts";

const sql = connecter();
const sortie: string[] = [];
const dire = (l: string) => { sortie.push(l); console.log(l); };
const SOURCE_ESSAI = "essai-compteur";

try {
  dire("## Visites du site vitrine par jour (jour | visites | détail par provenance)");
  const jours = await sql<{ j: string; n: number; detail: string }[]>`
    select to_char(jour, 'DD/MM') j, sum(visites)::int n,
           string_agg(source || ' ' || visites || ' (' || page || ')', ', ' order by visites desc) detail
    from public.site_visites where source <> ${SOURCE_ESSAI} group by jour order by jour`;
  if (jours.length === 0) dire("Aucune visite enregistrée depuis la mise en place du compteur (2/11).");
  for (const r of jours) dire(`${r.j} | ${r.n} | ${r.detail}`);

  dire("## Essai réel (téléphone arrivant de Google sur devanture-artisans.fr)");
  const navigateur = await chromium.launch();
  const page = await navigateur.newPage({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  await page.addInitScript(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
  const envois: string[] = [];
  const reponses: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/visite")) envois.push(`${r.method()} ${r.url()}`); });
  page.on("response", (r) => { if (r.url().includes("/api/visite")) reponses.push(`${r.status()}${r.headers()["location"] ? ` → ${r.headers()["location"]}` : ""}`); });
  page.on("requestfailed", (r) => { if (r.url().includes("/api/visite")) reponses.push(`ÉCHEC ${r.failure()?.errorText ?? ""}`); });
  const erreurs: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") erreurs.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => erreurs.push(e.message.slice(0, 160)));

  const res = await page.goto(`https://devanture-artisans.fr/?src=${SOURCE_ESSAI}`, { waitUntil: "load", timeout: 30_000, referer: "https://www.google.com/" });
  const html = await page.content();
  const script = html.includes("/api/visite");
  const adresse = html.match(/["'`](https?:\/\/[^"'`]*\/api\/visite)["'`]/)?.[1] ?? (script ? "(adresse relative)" : "—");
  await page.waitForTimeout(7_000);
  dire(`Page : ${res?.status() ?? "?"} · script du compteur dans la page : ${script ? "oui" : "NON"} · adresse appelée : ${adresse}`);
  dire(`Envois : ${envois.join(" ; ") || "AUCUN"} · réponses : ${reponses.join(" ; ") || "aucune"}${erreurs.length ? ` · erreurs : ${erreurs.join(" / ")}` : ""}`);
  await navigateur.close();

  await new Promise((r) => setTimeout(r, 2_000));
  const [essai] = await sql<{ n: number }[]>`select coalesce(sum(visites), 0)::int n from public.site_visites where source = ${SOURCE_ESSAI}`;
  dire(`Résultat en base : ${essai.n} visite(s) d'essai enregistrée(s) → ${essai.n > 0 ? "LE COMPTEUR MARCHE" : "RIEN N'EST ARRIVÉ EN BASE"}`);

  // 3. Où ça se perd : la fonction en base, puis l'appel par l'API Supabase (comme le fait le serveur), puis le serveur.
  dire("## Étapes une par une");
  const [f] = await sql<{ fonction: boolean; table: boolean; droit: boolean }[]>`
    select exists (select 1 from pg_proc where proname = 'site_vue') fonction,
           to_regclass('public.site_visites') is not null "table",
           coalesce((select has_function_privilege('anon', 'public.site_vue(text, text)', 'execute')), false) droit`.catch(() => [{ fonction: false, table: false, droit: false }]);
  dire(`En base : fonction site_vue ${f.fonction ? "oui" : "NON"} · table site_visites ${f.table ? "oui" : "NON"} · droit du public ${f.droit ? "oui" : "NON"}`);
  try {
    await sql`select public.site_vue('/essai', ${SOURCE_ESSAI})`;
    dire("Appel direct en base : OK");
  } catch (err) { dire(`Appel direct en base : ERREUR ${(err as Error).message}`); }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const cle = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (url && cle) {
    const r = await fetch(`${url}/rest/v1/rpc/site_vue`, {
      method: "POST", headers: { apikey: cle, Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_page: "/essai-api", p_source: SOURCE_ESSAI }),
    });
    dire(`Appel par l'API Supabase (clé publique) : ${r.status} ${r.ok ? "OK" : (await r.text()).slice(0, 200)}`);
  } else dire("Appel par l'API Supabase : clés absentes du workflow");

  for (const [nom, ua] of [["iPhone", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"], ["Chrome Windows", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"]]) {
    const r = await fetch("https://app.devanture-artisans.fr/api/visite", {
      method: "POST", headers: { "Content-Type": "text/plain", "User-Agent": ua, Origin: "https://devanture-artisans.fr" },
      body: JSON.stringify({ page: `/essai-${nom.split(" ")[0].toLowerCase()}`, ref: "https://www.google.com/", src: SOURCE_ESSAI }), redirect: "manual",
    });
    dire(`Appel du serveur (${nom}) : ${r.status}${r.headers.get("location") ? ` → ${r.headers.get("location")}` : ""}`);
  }
  await new Promise((r) => setTimeout(r, 1_500));
  const detail = await sql<{ page: string; visites: number }[]>`select page, visites from public.site_visites where source = ${SOURCE_ESSAI} order by page`;
  dire(`Arrivé en base : ${detail.map((d) => `${d.page} (${d.visites})`).join(", ") || "rien"}`);

  await sql`delete from public.site_visites where source = ${SOURCE_ESSAI}`;
  dire("Visites d'essai retirées des chiffres.");
} catch (err) {
  dire(`ERREUR : ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, sortie.join("\n") + "\n");
}
