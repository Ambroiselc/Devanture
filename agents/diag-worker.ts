// Diagnostic EN LECTURE SEULE du tableau de bord sur Cloudflare (3/11, erreur 1102) : lit les journaux du Worker
// « devanture-app » des dernières 24 h (Workers Observability) et ses statistiques (GraphQL), puis les affiche
// dans le résumé du workflow et en annotations. Ne modifie rien. Lancé quand tests/diag-worker.txt change.
import { ajouterResume } from "./lib/sortie-publique.ts";

const cle = process.env.CLOUDFLARE_API_TOKEN;
const compte = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!cle || !compte) throw new Error("CLOUDFLARE_API_TOKEN ou CLOUDFLARE_ACCOUNT_ID manquant.");
const lignes: string[] = [];
const dire = (s: string) => { console.log(s); lignes.push(s); };
const maintenant = Date.now();
const depuis = maintenant - 24 * 3600_000;

async function api(chemin: string, corps: unknown) {
  const r = await fetch(`https://api.cloudflare.com/client/v4${chemin}`, {
    method: "POST", headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" }, body: JSON.stringify(corps),
  });
  return { status: r.status, json: await r.json().catch(() => null) as any };
}

// 1. Statistiques par heure et par statut (GraphQL Analytics).
{
  const q = `query($a: String!, $d: Time!, $f: Time!) { viewer { accounts(filter: {accountTag: $a}) {
    workersInvocationsAdaptive(limit: 200, filter: {scriptName: "devanture-app", datetime_geq: $d, datetime_leq: $f},
      orderBy: [datetimeHour_ASC]) {
      sum { requests errors subrequests } quantiles { cpuTimeP50 cpuTimeP99 wallTimeP50 }
      dimensions { datetimeHour status } } } } }`;
  const r = await api("/graphql", { query: q, variables: { a: compte, d: new Date(depuis).toISOString(), f: new Date(maintenant).toISOString() } });
  const rows = r.json?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive;
  if (!rows) dire(`Statistiques : indisponibles (${r.status}) ${JSON.stringify(r.json?.errors ?? r.json).slice(0, 300)}`);
  else {
    dire("Statistiques par heure (UTC) : heure | statut | requêtes | sous-requêtes | CPU p50 / p99 (ms)");
    for (const x of rows) dire(`${x.dimensions.datetimeHour.slice(5, 16)} | ${x.dimensions.status} | ${x.sum.requests} | ${x.sum.subrequests} | ${(x.quantiles.cpuTimeP50 / 1000).toFixed(1)} / ${(x.quantiles.cpuTimeP99 / 1000).toFixed(1)}`);
  }
}

// 2. Derniers événements (journaux du Worker).
{
  const r = await api(`/accounts/${compte}/workers/observability/telemetry/query`, {
    queryId: "diag-1102", view: "events", limit: 100, timeframe: { from: depuis, to: maintenant },
    parameters: { filters: [{ key: "$metadata.service", operation: "eq", type: "string", value: "devanture-app" }] },
  });
  const evs: any[] = r.json?.result?.events?.events ?? [];
  if (!r.json?.success) dire(`Journaux : indisponibles (${r.status}) ${JSON.stringify(r.json?.errors ?? r.json).slice(0, 300)}`);
  else {
    dire(`Journaux : ${evs.length} événement(s). Exemple brut (clés) : ${JSON.stringify(Object.keys(evs[0] ?? {}))} ${JSON.stringify(evs[0]?.$workers ?? {}).slice(0, 400)}`);
    for (const e of evs) {
      const w = e.$workers ?? {}; const m = e.$metadata ?? {};
      const url = w.event?.request?.url ?? m.url ?? "";
      const issue = w.outcome ?? m.error ?? "";
      if (issue === "ok" && !m.error) continue;
      dire(`${new Date(e.timestamp ?? m.timestamp ?? 0).toISOString().slice(5, 19)} | ${issue} | cpu ${w.cpuTimeMs ?? "?"} ms | mur ${w.wallTimeMs ?? "?"} ms | ${String(url).replace(/^https?:\/\/[^/]+/, "")} | ${String(m.message ?? m.error ?? "").slice(0, 160)}`);
    }
  }
}

// 3. Maquettes publiques (/m/) : chaque requête des 24 h, avec son issue (3/11 : compteur de visites suspect).
{
  const r = await api(`/accounts/${compte}/workers/observability/telemetry/query`, {
    // 5/11 : remonte jusqu'au début du compteur (30/10 midi), ou aussi loin que Cloudflare garde les journaux.
    queryId: "diag-maquettes", view: "events", limit: 2000, timeframe: { from: Math.min(depuis, Date.parse("2026-10-30T11:00:00Z")), to: maintenant },
    parameters: { filters: [
      { key: "$metadata.service", operation: "eq", type: "string", value: "devanture-app" },
      { key: "$workers.event.request.url", operation: "includes", type: "string", value: "/m/" },
    ] },
  });
  const evs: any[] = r.json?.result?.events?.events ?? [];
  if (!r.json?.success) dire(`Maquettes : journaux indisponibles (${r.status}) ${JSON.stringify(r.json?.errors ?? r.json).slice(0, 300)}`);
  else {
    const bilan = new Map<string, number>();
    dire(`Maquettes /m/ : ${evs.length} requête(s) depuis le 30/10 (heure UTC | méthode | issue | statut | cpu | chemin | navigateur)`);
    for (const e of evs) {
      const w = e.$workers ?? {}; const m = e.$metadata ?? {};
      const req = w.event?.request ?? {};
      const meth = req.method ?? "?"; const issue = w.outcome ?? m.error ?? "?";
      const statut = w.event?.response?.status ?? "?";
      const cle = `${meth} ${issue} ${statut}`; bilan.set(cle, (bilan.get(cle) ?? 0) + 1);
      const ua = String(req.headers?.["user-agent"] ?? "").slice(0, 140);
      dire(`${new Date(e.timestamp ?? m.timestamp ?? 0).toISOString().slice(5, 19)} | ${meth} | ${issue} | ${statut} | ${w.cpuTimeMs ?? "?"} ms | ${String(req.url ?? m.url ?? "").replace(/^https?:\/\/[^/]+/, "").slice(0, 90)} | ${ua}`);
    }
    dire("Maquettes, total par méthode / issue / statut :");
    for (const [k, n] of bilan) dire(`  ${k} : ${n}`);
  }
}

const texte = lignes.join("\n");
ajouterResume("```\n" + texte + "\n```\n");
for (let i = 0; i < lignes.length; i += 25) console.log(`::notice title=Diag ${i / 25 + 1}::${lignes.slice(i, i + 25).join("%0A").replace(/::/g, ": :")}`);
