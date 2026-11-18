// Visites du site vitrine perdues (2/11 → 12/11, site_vue plantait) : ce qu'on peut retrouver ailleurs, EN LECTURE SEULE.
// 1. Journaux du Worker devanture-app (Workers Logs, gardés quelques jours) : chaque appel POST /api/visite = une visite
//    de plus de 4 s ; la page visitée est dans l'en-tête Referer. La provenance (Google…) n'est pas dans les journaux.
// 2. Statistiques Cloudflare de la zone devanture-artisans.fr (GraphQL, par jour) : visiteurs uniques et pages vues,
//    robots compris (beaucoup plus que de vraies personnes).
// Lancé par diag-worker.yml quand la 1re ligne de tests/diag-worker.txt est « visites ».
import { appendFileSync } from "node:fs";

const cle = process.env.CLOUDFLARE_API_TOKEN;
const compte = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!cle || !compte) throw new Error("CLOUDFLARE_API_TOKEN ou CLOUDFLARE_ACCOUNT_ID manquant.");
const lignes: string[] = [];
const dire = (s: string) => { console.log(s); lignes.push(s); };
const maintenant = Date.now();
const DEBUT = Date.parse("2026-11-02T00:00:00+01:00");
const ROBOT = /bot|crawl|spider|preview|headless|lighthouse|monitor/i;

async function api(chemin: string, corps?: unknown) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${chemin}`, {
    method: corps ? "POST" : "GET",
    headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  let json: any = null;
  try { json = await r.json(); } catch { /* vide */ }
  return { status: r.status, json };
}
const jourParis = (t: number) => new Date(t).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" });

// 1. Journaux du Worker : appels du compteur.
{
  const r = await api(`/accounts/${compte}/workers/observability/telemetry/query`, {
    queryId: "visites-perdues", view: "events", limit: 2000, timeframe: { from: DEBUT, to: maintenant },
    parameters: { filters: [
      { key: "$metadata.service", operation: "eq", type: "string", value: "devanture-app" },
      { key: "$workers.event.request.url", operation: "includes", type: "string", value: "/api/visite" },
    ] },
  });
  const evs: any[] = r.json?.result?.events?.events ?? [];
  if (!r.json?.success) dire(`Journaux : indisponibles (${r.status}) ${JSON.stringify(r.json?.errors ?? r.json).slice(0, 300)}`);
  else {
    const parJour = new Map<string, { n: number; robots: number; pages: Map<string, number> }>();
    let plusAncien = maintenant;
    for (const e of evs) {
      const w = e.$workers ?? {}; const m = e.$metadata ?? {};
      const req = w.event?.request ?? {};
      if ((req.method ?? "") !== "POST") continue;
      const t = Number(e.timestamp ?? m.timestamp ?? 0);
      if (!t) continue;
      plusAncien = Math.min(plusAncien, t);
      const h = req.headers ?? {};
      const ua = String(h["user-agent"] ?? "");
      let page = "?";
      try { page = new URL(String(h.referer ?? h.Referer ?? "")).pathname || "/"; } catch { /* rien */ }
      const j = jourParis(t);
      const d = parJour.get(j) ?? { n: 0, robots: 0, pages: new Map() };
      if (!ua || ROBOT.test(ua)) d.robots++;
      else { d.n++; d.pages.set(page, (d.pages.get(page) ?? 0) + 1); }
      parJour.set(j, d);
    }
    dire(`## Journaux du Worker : appels du compteur (gardés depuis le ${evs.length ? jourParis(plusAncien) : "?"})`);
    dire("jour | visites (> 4 s, hors robots) | robots | pages");
    if (parJour.size === 0) dire("Aucun appel du compteur dans les journaux encore gardés.");
    for (const [j, d] of [...parJour].sort()) {
      dire(`${j} | ${d.n} | ${d.robots} | ${[...d.pages].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p} ${n}`).join(", ")}`);
    }
    dire("(Tes propres visites sont comprises ici si tu n'étais pas connecté au tableau de bord.)");
  }
}

// 2. Statistiques de la zone devanture-artisans.fr.
{
  const z = await api(`/zones?name=devanture-artisans.fr`);
  const zone = z.json?.result?.[0]?.id;
  if (!zone) dire(`## Statistiques Cloudflare : zone introuvable ou clé sans droit de lecture (${z.status})`);
  else {
    const q = `query($z: String!, $d: Date!, $f: Date!) { viewer { zones(filter: {zoneTag: $z}) {
      httpRequests1dGroups(limit: 40, orderBy: [date_ASC], filter: {date_geq: $d, date_leq: $f}) {
        dimensions { date } sum { pageViews requests } uniq { uniques } } } } }`;
    const r = await api("/graphql", { query: q, variables: { z: zone, d: "2026-11-02", f: new Date(maintenant).toISOString().slice(0, 10) } });
    const groupes: any[] = r.json?.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? [];
    if (r.json?.errors?.length) dire(`## Statistiques Cloudflare : indisponibles (${JSON.stringify(r.json.errors).slice(0, 300)})`);
    else {
      dire("## Statistiques Cloudflare de devanture-artisans.fr (robots compris)");
      dire("jour | visiteurs uniques | pages vues");
      for (const g of groupes) dire(`${g.dimensions.date.slice(8, 10)}/${g.dimensions.date.slice(5, 7)} | ${g.uniq.uniques} | ${g.sum.pageViews}`);
    }
  }
}

const texte = lignes.join("\n");
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, "```\n" + texte + "\n```\n");
