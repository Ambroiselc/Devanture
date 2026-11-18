// Page « Campagnes » : chaque campagne de prospection, son budget et ses e-mails.
import type { Metadata } from "next";
import { Badge, DemoTag, EmptyState, PageHeader } from "@/components/ui";
import { getData } from "@/lib/data";
import { campaignStatus, emailStatus, formatDay, formatEur, sum } from "@/lib/format";

export const metadata: Metadata = { title: "Campagnes" };

export default async function CampaignsPage() {
  const { campaigns, prospects, websites, emails, costs } = await getData("campaigns", "prospects", "websites", "emails", "costs");

  return (
    <>
      <PageHeader title="Campagnes" description="Une campagne cible un type de commerce dans une ville. Les e-mails restent des brouillons : rien n'est envoyé dans cette version." />

      {campaigns.length === 0 && (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState>Aucune campagne. Tu pourras en créer une quand l&apos;orchestrateur sera prêt.</EmptyState>
        </div>
      )}

      <div className="space-y-5">
        {campaigns.map((c) => {
          const cp = prospects.filter((p) => p.campaign_id === c.id);
          const ids = new Set(cp.map((p) => p.id));
          const demos = websites.filter((w) => w.kind === "demo" && ids.has(w.prospect_id)).length;
          const cEmails = emails.filter((e) => e.campaign_id === c.id);
          const clients = cp.filter((p) => p.status === "client").length;
          const spent = sum(costs.filter((k) => k.campaign_id === c.id).map((k) => k.amount_eur));
          const ratio = c.budget_eur ? Math.min(1, spent / c.budget_eur) : 0;

          const stats = [
            { label: "prospects", value: cp.length },
            { label: "démos", value: demos },
            { label: "e-mails préparés", value: cEmails.length },
            { label: "clients", value: clients },
          ];

          return (
            <article key={c.id} className="rounded-xl border border-line bg-surface">
              <div className="flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                <div className="min-w-0">
                  <h2 className="font-display text-xl font-semibold">{c.name}<DemoTag show={c.is_demo} /></h2>
                  {c.description && <p className="mt-0.5 text-muted">{c.description}</p>}
                  <p className="mt-1 text-sm text-muted">
                    {[c.target_category, c.target_city].filter(Boolean).join(" à ")}
                    {c.started_at && <> · depuis le {formatDay(c.started_at)}</>}
                    {c.ended_at && <> · jusqu&apos;au {formatDay(c.ended_at)}</>}
                  </p>
                </div>
                <div className="shrink-0"><Badge tone={campaignStatus[c.status].tone}>{campaignStatus[c.status].label}</Badge></div>
              </div>

              <div className="grid gap-5 px-4 py-4 sm:px-5 md:grid-cols-[1fr_16rem]">
                <dl className="grid grid-cols-4 gap-2">
                  {stats.map((s) => (
                    <div key={s.label}>
                      <dd className="tabular font-display text-2xl font-semibold">{s.value}</dd>
                      <dt className="text-xs text-muted sm:text-sm">{s.label}</dt>
                    </div>
                  ))}
                </dl>
                <div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Budget utilisé</span>
                    <span className="tabular">{formatEur(spent)}{c.budget_eur !== null && <> / {formatEur(c.budget_eur)}</>}</span>
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-paper" role="img"
                    aria-label={`${Math.round(ratio * 100)} % du budget utilisé`}>
                    <div className={`h-full rounded-full ${ratio > 0.9 ? "bg-[var(--t-danger-fg)]" : "bg-shop"}`}
                      style={{ width: `${ratio * 100}%` }} />
                  </div>
                </div>
              </div>

              {cEmails.length > 0 && (
                <details className="group border-t border-line">
                  <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-shop sm:px-5">
                    <span className="group-open:hidden">Voir les {cEmails.length} e-mails préparés</span>
                    <span className="hidden group-open:inline">Masquer les e-mails</span>
                  </summary>
                  <ul className="divide-y divide-line border-t border-line">
                    {cEmails.map((e) => (
                      <li key={e.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                        <div className="min-w-0">
                          <p className="font-medium">{e.subject}</p>
                          {e.body && <p className="truncate text-muted">{e.body}</p>}
                        </div>
                        <Badge tone={emailStatus[e.status].tone}>{emailStatus[e.status].label}</Badge>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
