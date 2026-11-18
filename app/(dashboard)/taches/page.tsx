// Page « Tâches » : le travail des agents, leurs erreurs et leurs coûts.
import type { Metadata } from "next";
import { diagnostiquer, graviteStyle } from "@/lib/erreurs";
import { Badge, DemoTag, EmptyState, FilterTabs, PageHeader, Panel } from "@/components/ui";
import { getBoiteSettings, getData, getLoicSettings, getValerieSettings } from "@/lib/data";
import { ProchainesTaches } from "@/components/prochaines-taches";
import { getPassagesGithub, getProchainesTaches } from "@/lib/prochaines-taches";
import {
  agentLabel, formatDate, formatDuration, formatEur, formatEurPrecise, formatNumber, sum, taskStatus,
} from "@/lib/format";
import type { EventLevel, TaskStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Tâches" };

const levelStyle: Record<EventLevel, { label: string; className: string }> = {
  info: { label: "Info", className: "text-muted" },
  warning: { label: "Attention", className: "text-[var(--t-warning-fg)]" },
  error: { label: "Erreur", className: "text-[var(--t-danger-fg)]" },
};

export default async function TasksPage({ searchParams }: {
  searchParams: Promise<{ statut?: string; tache?: string; evt?: string }>;
}) {
  // ?tache=<id> : cette tâche s'affiche dépliée et surlignée (lien depuis « Erreurs à regarder » de la vue d'ensemble) ;
  // ?evt=<id> : la ligne du journal en question est surlignée aussi.
  const { statut, tache, evt } = await searchParams;
  const [{ tasks, taskEvents, costs, emails }, loic, valerie, ines, passages] =
    await Promise.all([getData("tasks", "taskEvents", "costs", "emails"), getLoicSettings(), getValerieSettings(), getBoiteSettings(), getPassagesGithub()]);
  const prochaines = getProchainesTaches({
    loic: loic.settings, valerie: valerie.settings, ines: ines.settings, passages,
    emailsValides: emails.filter((e) => e.status === "valide").length,
  });
  const enAttente = tasks.filter((t) => t.status === "en_attente")
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const current = statut && statut in taskStatus ? (statut as TaskStatus) : undefined;

  const list = tasks
    .filter((t) => !current || t.status === current)
    .sort((a, b) => (b.started_at ?? b.scheduled_at).localeCompare(a.started_at ?? a.scheduled_at));

  const costOf = (taskId: string) => sum(costs.filter((c) => c.task_id === taskId).map((c) => c.amount_eur));
  const eventsOf = (taskId: string) =>
    taskEvents.filter((e) => e.task_id === taskId).sort((a, b) => a.created_at.localeCompare(b.created_at));

  const finished = tasks.filter((t) => t.status === "terminee" || t.status === "echouee");
  const failureRate = finished.length ? tasks.filter((t) => t.status === "echouee").length / finished.length : 0;
  const tokens = sum(tasks.map((t) => t.tokens_input + t.tokens_output));
  const agentCosts = sum(costs.filter((c) => c.task_id).map((c) => c.amount_eur));

  const summary = [
    { label: "tâches au total", value: formatNumber(tasks.length) },
    { label: "taux d'échec", value: `${Math.round(failureRate * 100)} %` },
    { label: "tokens consommés", value: formatNumber(tokens) },
    { label: "coût des agents", value: formatEur(agentCosts) },
  ];

  const tabs = [
    { value: undefined, label: "Toutes", count: tasks.length },
    ...(Object.keys(taskStatus) as TaskStatus[]).map((s) => ({
      value: s, label: taskStatus[s].label, count: tasks.filter((t) => t.status === s).length,
    })),
  ];

  return (
    <>
      <PageHeader title="Tâches" description="Chaque travail confié à un agent, avec ses tentatives, ses erreurs et son coût. Clique sur une tâche pour voir son journal." />

      <dl className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summary.map((s) => (
          <div key={s.label} className="rounded-xl border border-line bg-surface px-4 py-3">
            <dd className="tabular font-display text-2xl font-semibold">{s.value}</dd>
            <dt className="text-sm text-muted">{s.label}</dt>
          </div>
        ))}
      </dl>

      <ProchainesTaches taches={prochaines} enAttente={enAttente} className="mb-6" />

      <h2 className="mb-3 font-display text-lg font-semibold">Tâches passées et en cours</h2>
      <FilterTabs basePath="/taches" param="statut" current={current} options={tabs} />

      <Panel>
        {list.length === 0 ? (
          <EmptyState>Aucune tâche avec ce statut.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((t) => {
              const events = eventsOf(t.id);
              const cost = costOf(t.id);
              const ciblee = t.id === tache;
              return (
                <li key={t.id} id={`tache-${t.id}`}
                  className={`scroll-mt-6 ${ciblee ? "bg-[var(--t-danger-bg)]/40 ring-2 ring-inset ring-[var(--t-danger-fg)]/40" : ""}`}>
                  <details className="group" open={ciblee}>
                    <summary className="flex cursor-pointer list-none flex-col gap-2 px-4 py-3 hover:bg-paper/60 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <div className="min-w-0">
                        <p className="font-medium">
                          <span aria-hidden className="mr-1.5 inline-block text-muted transition-transform group-open:rotate-90">›</span>
                          {t.title}<DemoTag show={t.is_demo} />
                        </p>
                        <p className="pl-4 text-sm text-muted">
                          {agentLabel[t.agent]} · {formatDate(t.started_at ?? t.scheduled_at)}
                          {t.status === "en_attente" && " (prévue)"}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 pl-4 text-sm sm:pl-0">
                        <span className="tabular text-muted" title="Tentatives">
                          {t.attempts}/{t.max_attempts} essai{t.max_attempts > 1 ? "s" : ""}
                        </span>
                        <span className="tabular w-16 text-right text-muted">{cost > 0 ? formatEur(cost) : "—"}</span>
                        <Badge tone={taskStatus[t.status].tone}>{taskStatus[t.status].label}</Badge>
                      </div>
                    </summary>

                    <div className="space-y-3 bg-paper/50 px-4 py-4 text-sm sm:px-5 sm:pl-9">
                      {t.error_message && (
                        <p className="rounded-lg bg-[var(--t-danger-bg)] px-3 py-2 text-[var(--t-danger-fg)]">
                          {t.error_message}
                        </p>
                      )}
                      {(() => {
                        // « Que faire ? » : à partir de l'erreur surlignée, sinon de l'erreur de la tâche, sinon de la dernière du journal.
                        const cible = events.find((e) => String(e.id) === evt)?.message ?? t.error_message
                          ?? [...events].reverse().find((e) => e.level === "error")?.message;
                        if (!cible) return null;
                        const d = diagnostiquer(cible, t.agent);
                        return (
                          <div className="space-y-1 rounded-lg border border-line bg-surface px-3 py-2">
                            <p className="flex items-center gap-2"><span className="font-semibold">Que faire ?</span>
                              <Badge tone={graviteStyle[d.gravite].tone}>{graviteStyle[d.gravite].label}</Badge></p>
                            <p>{d.explication}</p>
                            <p className="text-muted">{d.conseil}</p>
                            {d.lien && (d.lien.href.startsWith("http")
                              ? <a href={d.lien.href} target="_blank" rel="noreferrer" className="font-medium text-shop hover:underline">{d.lien.label} ↗</a>
                              : <a href={d.lien.href} className="font-medium text-shop hover:underline">{d.lien.label}</a>)}
                          </div>
                        );
                      })()}
                      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
                        <div><dt className="text-muted">Durée</dt><dd className="tabular">{formatDuration(t.started_at, t.finished_at)}</dd></div>
                        <div><dt className="text-muted">Tokens entrée</dt><dd className="tabular">{formatNumber(t.tokens_input)}</dd></div>
                        <div><dt className="text-muted">Tokens sortie</dt><dd className="tabular">{formatNumber(t.tokens_output)}</dd></div>
                        <div><dt className="text-muted">Coût exact</dt><dd className="tabular">{formatEurPrecise(cost)}</dd></div>
                      </dl>
                      {events.length > 0 ? (
                        <ol className="space-y-1.5 border-l-2 border-line pl-3">
                          {events.map((e) => (
                            <li key={e.id} id={`evt-${e.id}`}
                              className={`scroll-mt-24 ${String(e.id) === evt ?"-mx-2 rounded bg-[var(--t-danger-bg)] px-2 py-0.5" : ""}`}>
                              <span className="tabular text-muted">{formatDate(e.created_at)}</span>{" "}
                              <span className={`font-medium ${levelStyle[e.level].className}`}>{levelStyle[e.level].label} :</span>{" "}
                              {e.message}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="text-muted">Pas d&apos;entrée dans le journal.</p>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
