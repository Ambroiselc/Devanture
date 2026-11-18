// Détail des visites du site vitrine d'avant le nouveau compteur (13/11 vers 15 h 08), retrouvé dans les journaux du
// Worker devanture-app (13/11, demande de Broise) : chaque appel POST /api/visite y est noté avec son heure, son
// User-Agent (appareil, système, navigateur), le réseau d'origine (cf.asn, cf.asOrganization, cf.country ; jamais l'IP)
// et la page (en-tête Referer). Durée et provenance ne sont pas dans les journaux.
// Classement : Broise (cookie de session « sb-… ») et robots déclarés écartés ; essais de Claude depuis GitHub Actions
// (12/11 10 h 15-10 h 35, réseau Azure) écartés ; réseau d'hébergeur (Microsoft 365 qui vérifie les liens des e-mails,
// Google, Amazon…, lib/reseau.ts) → ligne « robot » ; le reste → vraie visite.
// Compteurs par jour (site_visites) remis d'accord avec ce classement :
//  - avant la correction du compteur (12/11 10 h 26) : lignes « journaux cloudflare » = vraies visites seulement ;
//  - après : on retire les robots de « direct ou e-mail » (une seule fois : seulement si aucune ligne retrouvée n'a
//    encore de réseau noté).
// Relançable : remplace les lignes « retrouvee ». Lancé par diag-compteur.yml (« detail-site »).
import { connecter } from "./lib/db.ts";
import { lireAppareil } from "../lib/appareil.ts";
import { lireReseau } from "../lib/reseau.ts";

const cle = process.env.CLOUDFLARE_API_TOKEN;
const compte = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!cle || !compte) throw new Error("CLOUDFLARE_API_TOKEN ou CLOUDFLARE_ACCOUNT_ID manquant.");
const DEBUT = Date.parse("2026-11-02T00:00:00+01:00");
const CORRECTION = Date.parse("2026-11-12T10:26:00+01:00");
const NOUVEAU = Date.parse("2026-11-13T14:08:30Z");
const ESSAIS = [Date.parse("2026-11-12T10:15:00+01:00"), Date.parse("2026-11-12T10:35:00+01:00")];
const ROBOT = /bot|crawl|spider|preview|headless|lighthouse|monitor/i;

const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${compte}/workers/observability/telemetry/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    queryId: "visites-site-detail-2", view: "events", limit: 2000, timeframe: { from: DEBUT, to: NOUVEAU },
    parameters: { filters: [
      { key: "$metadata.service", operation: "eq", type: "string", value: "devanture-app" },
      { key: "$workers.event.request.url", operation: "includes", type: "string", value: "/api/visite" },
    ] },
  }),
});
const json = (await r.json().catch(() => null)) as any;
if (!json?.success) {
  console.log(`::error title=Visites du site::journaux indisponibles (${r.status}) ${JSON.stringify(json?.errors ?? json).slice(0, 300)}`);
  process.exit(1);
}
const evs: any[] = json.result?.events?.events ?? [];
type Ligne = { t: number; page: string; ua: string; cf: any; robot: boolean };
const lignes: Ligne[] = [];
let broise = 0, declares = 0, essais = 0;
for (const e of evs) {
  const req = e.$workers?.event?.request ?? {};
  if ((req.method ?? "") !== "POST") continue;
  const t = Number(e.timestamp ?? e.$metadata?.timestamp ?? 0);
  if (!t || t >= NOUVEAU) continue;
  const h = req.headers ?? {};
  const ua = String(h["user-agent"] ?? "");
  if (!ua || ROBOT.test(ua)) { declares++; continue; }
  if (/(^|;\s*)sb-/.test(String(h.cookie ?? h.Cookie ?? ""))) { broise++; continue; }
  const cf = req.cf ?? {};
  if (Number(cf.asn) === 8075 && t >= ESSAIS[0] && t <= ESSAIS[1]) { essais++; continue; }
  let page = "/";
  try { page = new URL(String(h.referer ?? h.Referer ?? "")).pathname || "/"; } catch { /* rien */ }
  lignes.push({ t, page: page.toLowerCase().slice(0, 80), ua, cf, robot: lireReseau(cf).robot });
}
lignes.sort((a, b) => a.t - b.t);
const jour = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
const parJour = new Map<string, { vraies: number; robots: number; vraiesAvant: number; robotsApres: number }>();
for (const l of lignes) {
  const d = parJour.get(jour(l.t)) ?? { vraies: 0, robots: 0, vraiesAvant: 0, robotsApres: 0 };
  if (l.robot) { d.robots++; if (l.t >= CORRECTION) d.robotsApres++; } else { d.vraies++; if (l.t < CORRECTION) d.vraiesAvant++; }
  parJour.set(jour(l.t), d);
}
console.log(`Appels : ${lignes.length} (${lignes.filter((l) => !l.robot).length} vraies visites, ${lignes.filter((l) => l.robot).length} robots) ; écartés : ${broise} de Broise, ${declares} robots déclarés, ${essais} essais de Claude`);
console.log("jour | vraies visites | robots | dont vraies avant la correction | dont robots après la correction");
for (const [j, d] of [...parJour].sort()) console.log(`${j} | ${d.vraies} | ${d.robots} | ${d.vraiesAvant} | ${d.robotsApres}`);

const sql = connecter();
try {
  await sql.begin(async (tx) => {
    const [dejaFait] = await tx`select 1 from public.site_visites_detail where retrouvee and reseau is not null limit 1`;
    await tx`delete from public.site_visites_detail where retrouvee`;
    for (const l of lignes) {
      const a = lireAppareil(l.ua);
      const res = lireReseau(l.cf);
      await tx`insert into public.site_visites_detail
        (visite, debut, fin, duree_s, page, pages, source, appareil, systeme, navigateur, reseau, pays, robot, retrouvee)
        values (${"cf" + l.t.toString(36) + Math.random().toString(36).slice(2, 8)}, ${new Date(l.t)}, ${new Date(l.t)}, null,
                ${l.page}, ${[l.page]}, ${l.t < CORRECTION ? "journaux cloudflare" : "direct ou e-mail"},
                ${a.appareil}, ${a.systeme}, ${a.navigateur}, ${res.reseau}, ${res.pays}, ${res.robot}, true)`;
    }
    // Compteurs d'avant la correction : vraies visites seulement.
    await tx`delete from public.site_visites where source = 'journaux cloudflare'`;
    for (const [j, d] of parJour) {
      if (d.vraiesAvant > 0) await tx`insert into public.site_visites (jour, page, source, visites) values (${j}, '/', 'journaux cloudflare', ${d.vraiesAvant})`;
    }
    // Après la correction : retirer les robots comptés (sans provenance, donc « direct ou e-mail »), une seule fois.
    if (!dejaFait) {
      for (const [j, d] of parJour) {
        if (d.robotsApres > 0) await tx`update public.site_visites set visites = greatest(visites - ${d.robotsApres}, 0)
          where jour = ${j} and source = 'direct ou e-mail'`;
      }
      await tx`delete from public.site_visites where visites = 0`;
    }
  });
  const rows = await sql<{ jour: string; source: string; n: number }[]>`select jour::text, source, sum(visites)::int n
    from public.site_visites group by 1, 2 order by 1, 2`;
  console.log("Compteurs par jour après remise d'accord :");
  for (const x of rows) console.log(`${x.jour} | ${x.source} | ${x.n}`);
  console.log(`::notice title=Visites du site::${lignes.filter((l) => !l.robot).length} vraies visites et ${lignes.filter((l) => l.robot).length} robots retrouvés ; compteurs remis d'accord`);
} catch (err) {
  console.log(`::error title=Visites du site::${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
