// 13/11, EN LECTURE SEULE : appels du compteur du site vitrine (/api/visite) et des maquettes (POST /m/<slug>) venus
// du réseau Microsoft (AS8075 : Azure, mais aussi les robots de sécurité de Microsoft 365 qui ouvrent les liens des
// e-mails pour les vérifier). Par jour, avec l'heure, l'appareil annoncé et la page.
import "./lib/sortie-publique.ts"; // journaux publics (18/11)
const cle = process.env.CLOUDFLARE_API_TOKEN, compte = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!cle || !compte) throw new Error("CLOUDFLARE_API_TOKEN ou CLOUDFLARE_ACCOUNT_ID manquant.");
const DEBUT = Date.parse("2026-11-02T00:00:00+01:00");
async function evenements(motif: string) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${compte}/workers/observability/telemetry/query`, {
    method: "POST", headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
    body: JSON.stringify({ queryId: "diag-azure-" + motif.replace(/\W/g, ""), view: "events", limit: 2000, timeframe: { from: DEBUT, to: Date.now() },
      parameters: { filters: [
        { key: "$metadata.service", operation: "eq", type: "string", value: "devanture-app" },
        { key: "$workers.event.request.url", operation: "includes", type: "string", value: motif },
      ] } }),
  });
  const j = (await r.json().catch(() => null)) as any;
  if (!j?.success) { console.log(`Journaux indisponibles pour ${motif} (${r.status})`); return []; }
  return (j.result?.events?.events ?? []) as any[];
}
const quand = (t: number) => new Date(t).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
for (const motif of ["/api/visite", "/m/"]) {
  const evs = (await evenements(motif)).filter((e) => (e.$workers?.event?.request?.method ?? "") === "POST");
  const parAsn = new Map<string, number>();
  const lignes: string[] = [];
  for (const e of evs) {
    const req = e.$workers?.event?.request ?? {};
    const cf = req.cf ?? {};
    const asn = `${cf.asn ?? "?"} ${cf.asOrganization ?? ""}`.trim();
    parAsn.set(asn, (parAsn.get(asn) ?? 0) + 1);
    if (Number(cf.asn) === 8075) {
      const h = req.headers ?? {};
      let chemin = "";
      try { chemin = new URL(String(req.url)).pathname; } catch { /* rien */ }
      lignes.push(`${quand(Number(e.timestamp ?? e.$metadata?.timestamp ?? 0))} | ${cf.city ?? "?"} ${cf.country ?? ""} | ${String(h["user-agent"] ?? "").slice(0, 90)} | ${motif === "/m/" ? chemin.slice(0, 50) : (h.referer ?? "")}`);
    }
  }
  console.log(`\n## ${motif} : ${evs.length} appels POST, par réseau (AS)`);
  for (const [a, n] of [...parAsn].sort((x, y) => y[1] - x[1]).slice(0, 15)) console.log(`${n} | ${a}`);
  console.log(`## ${motif} : détail des appels depuis Microsoft (AS8075)`);
  for (const l of lignes.sort()) console.log(l);
}
export {};
