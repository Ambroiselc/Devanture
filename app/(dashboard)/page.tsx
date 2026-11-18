// Page « Vue d'ensemble » : l'état de l'agence en un coup d'œil.
import { LigneOuverture } from "@/components/ligne-ouverture";
import Link from "@/components/lien";
import { Badge, DemoTag, EmptyState, PageHeader, Panel } from "@/components/ui";
import { updateAiBudget } from "../admin-actions";
import { VisitesSite } from "@/components/visites-site";
import { ArtisansInteresses } from "@/components/artisans-interesses";
import { getBoiteSettings, getBudgetIa, getComptesProspects, getData, getLoicSettings, getValerieSettings, getVueEnsemble } from "@/lib/data";
import { ProchainesTaches } from "@/components/prochaines-taches";
import { getPassagesGithub, getProchainesTaches } from "@/lib/prochaines-taches";
import { diagnostiquer, graviteStyle, pageAgent } from "@/lib/erreurs";
import {
  agentLabel, aiBudget, formatDate, formatEur, niveauBudget, pipelineOrder, prospectStatus, sum, taskStatus, formatSecondes } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { AgentName } from "@/lib/types";

const budgetNotices: Record<string, string> = {
  ok: "Budget enregistré.",
  demo: "Mode démo : le budget n'est pas enregistré.",
  invalide: "Indique un montant en euros, par exemple 20.",
  echec: "L'enregistrement a échoué. As-tu exécuté la migration « opposition_et_budget » ?",
};

export default async function OverviewPage({ searchParams }: {
  searchParams: Promise<{ budget?: string; mdp?: string }>;
}) {
  // 2/11 : en ligne, données légères (getVueEnsemble) ; getData() seulement en mode démo ou si la lecture légère échoue.
  const [leger, comptes, budgetBase, loic, valerie, ines, passages] =
    await Promise.all([getVueEnsemble(), getComptesProspects(), getBudgetIa(), getLoicSettings(), getValerieSettings(), getBoiteSettings(), getPassagesGithub()]);
  const complet = leger ? null : await getData();
  const prospects = complet?.prospects ?? [];
  const websites = complet?.websites ?? [];
  const emails = complet?.emails ?? [];
  const tasks = leger?.tasks ?? complet?.tasks ?? [];
  const taskEvents = leger?.taskEvents ?? complet?.taskEvents ?? [];
  const costs = leger?.costs ?? complet?.costs ?? [];
  const settings = leger?.settings ?? complet!.settings;
  const prochaines = getProchainesTaches({
    loic: loic.settings, valerie: valerie.settings, ines: ines.settings, passages,
    emailsValides: leger ? leger.emailsValides : emails.filter((e) => e.status === "valide").length,
  });
  const { budget: budgetParam, mdp } = await searchParams;
  const ai = budgetBase ? niveauBudget(budgetBase.spent, budgetBase.budget, budgetBase.alerte)
    : aiBudget(costs, settings, !isSupabaseConfigured);

  // --- Parcours commercial ------------------------------------------------
  // Comptes justes calculés par la base ; en mode démo, à partir des données fictives.
  const byStatus = (s: string) => comptes ? comptes.parStatut[s as keyof typeof comptes.parStatut] ?? 0 : prospects.filter((p) => p.status === s).length;
  const stages = pipelineOrder.map((s) => ({ status: s, count: byStatus(s), ...prospectStatus[s] }));
  const maxStage = Math.max(1, ...stages.map((s) => s.count));
  const setAside = byStatus("refuse") + byStatus("ecarte");

  // --- Chiffres clés --------------------------------------------------------
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthCosts = sum(costs.filter((c) => new Date(c.incurred_at) >= monthStart).map((c) => c.amount_eur));
  const liveDemos = leger ? leger.demosEnLigne : websites.filter((w) => w.kind === "demo" && (w.status === "pret" || w.status === "publie")).length;
  const failed = tasks.filter((t) => t.status === "echouee");
  const running = leger ? leger.enCours : tasks.filter((t) => t.status === "en_cours" || t.status === "en_attente").length;
  const toReview = leger ? leger.emailsAValider : emails.filter((e) => e.status === "a_valider").length;

  // --- Coûts par agent ------------------------------------------------------
  const agentOfTask = new Map(tasks.map((t) => [t.id, t.agent]));
  const costByAgent = new Map<AgentName | "hors", number>();
  for (const c of costs) {
    // L'agent vient de la base (coûts du mois, getVueEnsemble) ou, en secours, de la liste des tâches.
    const key = ((c as { agent?: AgentName | null }).agent ?? (c.task_id && agentOfTask.get(c.task_id))) || "hors";
    costByAgent.set(key, (costByAgent.get(key) ?? 0) + c.amount_eur);
  }
  const costRows = [...costByAgent.entries()].sort((a, b) => b[1] - a[1]);
  const maxCost = Math.max(0.01, ...costRows.map(([, v]) => v));
  const totalCost = sum(costs.map((c) => c.amount_eur));

  const recentTasks = [...tasks]
    .sort((a, b) => (b.started_at ?? b.created_at).localeCompare(a.started_at ?? a.created_at))
    .slice(0, 6);
  // Erreurs à regarder : les lignes « erreur » des journaux et les tâches échouées (sans doublon),
  // chacune avec un lien qui ouvre directement la tâche, journal déplié et erreur surlignée.
  const taskTitle = new Map(tasks.map((t) => [t.id, t.title]));
  const agentDe = new Map(tasks.map((t) => [t.id, t.agent]));
  // « Réglé depuis » : le même agent a terminé une tâche normalement après l'erreur.
  const dernierSucces = new Map<AgentName, string>();
  for (const t of tasks) {
    const fin = t.finished_at ?? t.started_at;
    if (t.status === "terminee" && fin && fin > (dernierSucces.get(t.agent) ?? "")) dernierSucces.set(t.agent, fin);
  }
  const depuis14j = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const toutesErreurs = [
    ...taskEvents.filter((e) => e.level === "error").map((e) => ({
      cle: e.id, tacheId: e.task_id, message: e.message, date: e.created_at,
      lien: `/taches?tache=${e.task_id}&evt=${e.id}#evt-${e.id}`,
    })),
    ...failed.map((t) => ({
      cle: t.id, tacheId: t.id, message: t.error_message ?? "La tâche a échoué.", date: t.finished_at ?? t.created_at,
      lien: `/taches?tache=${t.id}#tache-${t.id}`,
    })),
  ].filter((x) => x.date >= depuis14j)
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((x, i, tout) => tout.findIndex((y) => y.tacheId === x.tacheId) === i) // une ligne par tâche
    .map((x) => {
      const agent = agentDe.get(x.tacheId);
      const succes = agent ? dernierSucces.get(agent) : undefined;
      return { ...x, agent, diag: diagnostiquer(x.message, agent), regle: Boolean(succes && succes > x.date) };
    });
  // D'abord ce qui demande d'agir, puis ce qui se règle seul ; les erreurs réglées depuis sont juste comptées.
  const ordre = { agir: 0, attendre: 1, rien: 2 };
  const erreurs = toutesErreurs.filter((x) => !x.regle && x.diag.gravite !== "rien")
    .sort((a, b) => ordre[a.diag.gravite] - ordre[b.diag.gravite] || b.date.localeCompare(a.date))
    .slice(0, 6);
  const erreursReglees = toutesErreurs.length - erreurs.length;
  const aFaire = erreurs.filter((x) => x.diag.gravite === "agir").length;

  // --- Site vitrine (2/11) : visites par jour, provenance et page d'arrivée -------------------------------
  const jourParis = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  const auj = jourParis(new Date());
  const il7 = jourParis(new Date(Date.now() - 6 * 86_400_000));
  const siteLignes = leger?.site ?? null;
  const site7 = (siteLignes ?? []).filter((l) => l.jour >= il7);
  const totalSite = (ls: { visites: number }[]) => ls.reduce((t, l) => t + l.visites, 0);
  const regrouper = (cle: "source" | "page") => [...site7.reduce((m, l) => m.set(l[cle], (m.get(l[cle]) ?? 0) + l.visites), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]).slice(0, 5);
  const joursSite = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86_400_000);
    const j = jourParis(d);
    return { j, label: d.toLocaleDateString("fr-FR", { weekday: "short", timeZone: "Europe/Paris" }), n: totalSite(site7.filter((l) => l.jour === j)) };
  });
  const maxJourSite = Math.max(1, ...joursSite.map((x) => x.n));

  const facts = [
    { label: "démos prêtes ou en ligne", value: String(liveDemos), href: "/sid" },
    { label: "e-mails à valider", value: String(toReview), href: "/campagnes" },
    ...(leger ? [{ label: "maquettes ouvertes", value: String(leger.nbOuvertes), href: "#maquettes-ouvertes" }] : []),
    { label: "tâches en attente ou en cours", value: String(running), href: "/taches" },
    { label: budgetBase ? "dépensés en IA ce mois-ci" : "dépensés ce mois-ci", value: formatEur(budgetBase ? budgetBase.spent : monthCosts), href: "#budget" },
  ];

  return (
    <>
      <PageHeader title="Vue d'ensemble" description="Où en sont les commerces suivis, ce que font les agents et ce que ça coûte." />

      {mdp === "ok" && (
        <p role="status" className="mb-6 rounded-xl bg-[var(--t-success-bg)] px-4 py-3 text-sm text-[var(--t-success-fg)]">
          Ton nouveau mot de passe est enregistré.
        </p>
      )}

      {leger && <ArtisansInteresses interets={leger.interets} />}

      {/* Le parcours : du commerce repéré au client */}
      <Panel className="mb-6">
        <div className="px-4 pt-4 sm:px-5">
          <h2 className="font-display text-lg font-semibold">Parcours des prospects</h2>
          <p className="text-sm text-muted">
            {comptes?.total ?? prospects.length} commerces suivis · {setAside} refusés ou écartés
          </p>
        </div>
        <ol className="grid grid-cols-3 gap-px overflow-hidden sm:grid-cols-6">
          {stages.map((s) => (
            <li key={s.status}>
              <Link href={`/prospects?statut=${s.status}`} className="group block px-4 pb-4 pt-5 hover:bg-shop-soft/50 sm:px-5">
                <div className="flex h-20 items-end">
                  <div
                    className="w-full rounded-t-md bg-shop/80 transition-colors group-hover:bg-shop"
                    style={{ height: `${Math.max(6, (s.count / maxStage) * 100)}%` }}
                    aria-hidden
                  />
                </div>
                <p className="tabular mt-3 font-display text-2xl font-semibold">{s.count}</p>
                <p className="text-sm text-muted">{s.label}</p>
              </Link>
            </li>
          ))}
        </ol>
      </Panel>

      <dl className={`mb-6 grid grid-cols-2 gap-3 ${facts.length > 4 ? "sm:grid-cols-3 lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        {facts.map((f) => (
          <Link key={f.label} href={f.href} className="rounded-xl border border-line bg-surface px-4 py-3 hover:border-shop">
            <dd className="tabular font-display text-2xl font-semibold">{f.value}</dd>
            <dt className="text-sm text-muted">{f.label}</dt>
          </Link>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Activité récente des agents"
          action={<Link href="/taches" className="text-sm font-medium text-shop hover:underline">Toutes les tâches</Link>}>
          {recentTasks.length === 0 ? (
            <EmptyState>Aucune tâche pour l&apos;instant. Elles apparaîtront quand les agents seront branchés.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {recentTasks.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.title}<DemoTag show={t.is_demo} /></p>
                    <p className="text-sm text-muted">{agentLabel[t.agent]} · {formatDate(t.started_at ?? t.scheduled_at)}</p>
                  </div>
                  <Badge tone={taskStatus[t.status].tone}>{taskStatus[t.status].label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <ProchainesTaches taches={prochaines} compact />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Erreurs à regarder"
          action={aFaire > 0 ? <Badge tone="danger">{aFaire} à faire</Badge> : undefined}>
          {erreurs.length === 0 ? (
            <EmptyState>
              Rien à faire, tout va bien.
              {erreursReglees > 0 && ` (${erreursReglees} erreur(s) ces 14 derniers jours, déjà réglée(s) ou sans conséquence.)`}
            </EmptyState>
          ) : (
            <>
              <ul className="divide-y divide-line">
                {erreurs.map((e) => {
                  const g = graviteStyle[e.diag.gravite];
                  const page = e.agent ? pageAgent[e.agent] : undefined;
                  return (
                    <li key={e.cle} className="space-y-2 px-4 py-3 sm:px-5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 text-sm font-medium">{taskTitle.get(e.tacheId) ?? "Tâche inconnue"}</p>
                        <Badge tone={g.tone}>{g.label}</Badge>
                      </div>
                      <p className="text-sm">{e.diag.explication}</p>
                      <p className="break-words font-mono text-xs text-muted">Message : {e.message}</p>
                      <p className={`rounded-lg px-3 py-2 text-sm ${e.diag.gravite === "agir"
                        ? "bg-[var(--t-danger-bg)] text-[var(--t-danger-fg)]" : "bg-paper text-muted"}`}>
                        <span className="font-semibold">Que faire ? </span>{e.diag.conseil}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                        <span>{formatDate(e.date)}</span>
                        {e.diag.lien && (
                          e.diag.lien.href.startsWith("http")
                            ? <a href={e.diag.lien.href} target="_blank" rel="noreferrer" className="font-medium text-shop hover:underline">{e.diag.lien.label} ↗</a>
                            : <Link href={e.diag.lien.href} className="font-medium text-shop hover:underline">{e.diag.lien.label}</Link>
                        )}
                        {page && <Link href={page.href} className="font-medium text-shop hover:underline">Page de {page.nom}</Link>}
                        <Link href={e.lien} className="font-medium text-shop hover:underline">Détail technique</Link>
                      </p>
                    </li>
                  );
                })}
              </ul>
              {erreursReglees > 0 && (
                <p className="border-t border-line px-4 py-2 text-xs text-muted sm:px-5">
                  + {erreursReglees} autre(s) erreur(s) ces 14 derniers jours, déjà réglée(s) (l&apos;agent a retravaillé normalement depuis) ou sans conséquence.
                </p>
              )}
            </>
          )}
        </Panel>
        {leger && (
          <Panel title="Maquettes ouvertes"
            action={<Link href="/valerie" className="text-sm font-medium text-shop hover:underline">Page Valérie</Link>}>
            <div id="maquettes-ouvertes">
              <p className="px-4 pt-3 text-sm sm:px-5">
                <span className="tabular font-semibold">{leger.nbOuvertes}</span> maquette(s) ouverte(s)
                {leger.nbContactes > 0 && <> pour <span className="tabular font-semibold">{leger.nbContactes}</span> artisans contactés</>}
                {leger.nbContactes > 0 && <span className="text-muted"> ({Math.round((leger.nbOuvertes / leger.nbContactes) * 100)} %)</span>}.
              </p>
              {leger.ouvertes.length > 0 ? (
                <ul className="mt-2 divide-y divide-line border-t border-line text-sm">
                  {leger.ouvertes.map((o, i) => (
                    <LigneOuverture key={i} o={o} />
                  ))}
                </ul>
              ) : (
                <p className="px-4 pb-4 pt-1 text-sm text-muted sm:px-5">Aucune pour l&apos;instant. Tes propres aperçus ne comptent pas.</p>
              )}
            </div>
          </Panel>
        )}
      </div>

      {leger && !siteLignes && (
        <Panel title="Site vitrine" className="mt-6">
          <p className="px-4 py-3 text-sm text-muted sm:px-5">
            Les visites du site ne peuvent pas encore être lues : {leger.siteErreur ?? "raison inconnue"}.
            Si la migration 20261102020000_visites_site.sql vient d&apos;être appliquée, réessaie dans une minute.
          </p>
        </Panel>
      )}
      {siteLignes && (
        <Panel title="Site vitrine" className="mt-6"
          action={<a href="https://devanture-artisans.fr/?apercu=1" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-shop hover:underline">devanture-artisans.fr</a>}>
          <div className="grid gap-5 px-4 py-4 sm:px-5 md:grid-cols-3">
            <div>
              <p className="text-sm">
                <span className="tabular font-display text-2xl font-semibold">{totalSite(site7)}</span> visite(s) sur 7 jours
              </p>
              <p className="text-sm text-muted">
                {totalSite(site7.filter((l) => l.jour === auj))} aujourd&apos;hui · {totalSite(siteLignes)} sur 30 jours
              </p>
              <div className="mt-3 flex h-16 items-end gap-1" aria-label="Visites par jour, 7 derniers jours">
                {joursSite.map((x) => (
                  <div key={x.j} className="flex flex-1 flex-col items-center gap-1" title={`${x.n} visite(s)`}>
                    <div className="w-full rounded-sm bg-shop" style={{ height: `${Math.max(2, (x.n / maxJourSite) * 48)}px`, opacity: x.n ? 1 : 0.25 }} />
                    <span className="text-[10px] text-muted">{x.label}</span>
                  </div>
                ))}
              </div>
            </div>
            {(["source", "page"] as const).map((cle) => (
              <div key={cle}>
                <h3 className="text-sm font-semibold">{cle === "source" ? "D'où viennent les visiteurs" : "Page d'arrivée"}</h3>
                {regrouper(cle).length ? (
                  <ul className="mt-1 divide-y divide-line text-sm">
                    {regrouper(cle).map(([nom, n]) => (
                      <li key={nom} className="flex justify-between gap-3 py-1.5">
                        <span className="min-w-0 truncate">{nom}</span><span className="tabular text-muted">{n}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-1 text-sm text-muted">Aucune visite cette semaine.</p>}
              </div>
            ))}
          </div>
          {leger?.siteDetail && (() => {
            const tous7 = leger.siteDetail.filter((v) => v.debut >= new Date(Date.now() - 7 * 86_400_000).toISOString());
            const robots7 = tous7.filter((v) => v.robot).length;
            const d7 = tous7.filter((v) => !v.robot && !v.retrouvee);
            const durees = d7.map((v) => v.duree_s ?? 0).sort((a, b) => a - b);
            const tel = d7.filter((v) => v.appareil === "telephone" || v.appareil === "tablette").length;
            const plusieurs = d7.filter((v) => v.pages.length > 1).length;
            return (
              <div id="visites-site" className="border-t border-line">
                <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3 sm:px-5">
                  <h3 className="text-sm font-semibold">Dernières visites, une par une</h3>
                  {d7.length > 0 && (
                    <p className="tabular text-xs text-muted">
                      7 jours : durée médiane {formatSecondes(durees[Math.floor(durees.length / 2)])} · {tel} sur {d7.length} sur téléphone
                      · {plusieurs} ont vu plusieurs pages
                    </p>
                  )}
                  {robots7 > 0 && <p className="tabular text-xs text-muted">{robots7} visite(s) de robots écartée(s) sur 7 jours</p>}
                </div>
                <VisitesSite visites={leger.siteDetail} />
              </div>
            );
          })()}
          {leger && leger.siteDetail === null && (
            <p className="border-t border-line px-4 py-2 text-xs text-muted sm:px-5">
              Le détail de chaque visite (heure, durée, appareil) apparaîtra ici une fois la migration 20261113000000_visites_site_detail.sql appliquée.
            </p>
          )}
          <p className="border-t border-line px-4 py-2 text-xs text-muted sm:px-5">
            Comptée quand la page reste ouverte 4 secondes. Sans cookie ni adresse IP : impossible de savoir qui c&apos;est, seulement des indices.
            Les robots (visites venues d&apos;un hébergeur, surtout Microsoft 365 qui ouvre les liens de chaque e-mail reçu pour les vérifier)
            ne sont plus comptés depuis le 13/11 ; ceux d&apos;avant ont été retirés des chiffres grâce aux journaux Cloudflare.
            « e-mail de prospection » = clic sur un lien d&apos;un e-mail de Valérie ; « direct ou e-mail » = adresse tapée, favori ou clic dans
            une messagerie qui ne dit rien (réponses d&apos;Inès, lien partagé…), et toi si tu n&apos;es pas connecté ici ; « journaux cloudflare » =
            vraies visites du 5 au 12/11 retrouvées après la panne du compteur, provenance perdue. Tes visites ne comptent pas quand tu es connecté ici.
          </p>
        </Panel>
      )}

      <Panel title={leger ? "Coûts par agent ce mois-ci" : "Coûts par agent"} className="mt-6" action={<span className="tabular text-sm text-muted">Total {formatEur(totalCost)}</span>}>
        <div id="couts" className="space-y-3 px-4 py-4 sm:px-5">
          {costRows.length === 0 && <EmptyState>Aucune dépense enregistrée.</EmptyState>}
          {costRows.map(([agent, value]) => (
            <div key={agent} className="grid grid-cols-[8.5rem_1fr_4.5rem] items-center gap-3 text-sm sm:grid-cols-[10rem_1fr_5rem]">
              <span className="truncate">{agent === "hors" ? "Hébergement, domaines…" : agentLabel[agent]}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-paper">
                <span className="block h-full rounded-full bg-shop" style={{ width: `${(value / maxCost) * 100}%` }} />
              </span>
              <span className="tabular text-right">{formatEur(value)}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Budget IA du mois" className="mt-6">
        <div id="budget" className="grid gap-5 px-4 py-4 sm:px-5 md:grid-cols-[1fr_18rem]">
          <div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Dépensé en API (Claude, recherche…) depuis le 1er</span>
              <span className="tabular">{formatEur(ai.spent)} / {formatEur(ai.budget)}</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-paper" role="img"
              aria-label={`${Math.round(ai.ratio * 100)} % du budget utilisé`}>
              <div className={`h-full rounded-full ${ai.level === "depasse" ? "bg-[var(--t-danger-fg)]"
                : ai.level === "alerte" ? "bg-[var(--t-warning-fg)]" : "bg-shop"}`}
                style={{ width: `${Math.min(1, ai.ratio) * 100}%` }} />
            </div>
            <p className="mt-2 text-sm text-muted">
              Une alerte s&apos;affiche en haut de chaque page à {Math.round(settings.ai_alert_ratio * 100)} %.
              Les agents liront ce budget et s&apos;arrêteront à 100 %. La vraie barrière reste la limite de
              dépense réglée dans la console Anthropic.
            </p>
          </div>
          <form action={updateAiBudget} className="space-y-2 text-sm">
            <label className="block">
              <span className="mb-1 block font-medium">Budget mensuel (€)</span>
              <input name="budget" inputMode="decimal" defaultValue={String(settings.ai_monthly_budget_eur).replace(".", ",")}
                className="tabular w-full rounded-lg border border-line bg-paper px-3 py-2" />
            </label>
            <button type="submit" className="rounded-lg border border-shop px-3 py-1.5 font-medium text-shop hover:bg-shop-soft">
              Enregistrer
            </button>
            {budgetParam && budgetNotices[budgetParam] && <p role="status" className="text-muted">{budgetNotices[budgetParam]}</p>}
          </form>
        </div>
      </Panel>
    </>
  );
}
