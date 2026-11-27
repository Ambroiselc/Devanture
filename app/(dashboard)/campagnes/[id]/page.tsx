// Page d'accueil d'UNE campagne (26/11, demande de Broise) : comme la vue d'ensemble, mais seulement pour les prospects
// de cette campagne. On y arrive depuis la page « Campagnes ».
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/lien";
import { LigneOuverture } from "@/components/ligne-ouverture";
import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui";
import { getVueCampagne } from "@/lib/data";
import { agentLabel, campaignStatus, formatDay, formatEur, mailCategory, pipelineOrder, prospectStatus } from "@/lib/format";
import type { AgentName, CampaignStatus, MailCategory } from "@/lib/types";

export const metadata: Metadata = { title: "Campagne" };

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)} %` : "—");

export default async function CampagnePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await getVueCampagne(id);
  if (!v) notFound();
  const c = v.campagne;
  const statut = campaignStatus[c.status as CampaignStatus] ?? { label: c.status, tone: "neutral" as const };

  const byStatus = (s: string) => v.parStatut[s] ?? 0;
  const stages = pipelineOrder.map((s) => ({ status: s, count: byStatus(s), ...prospectStatus[s] }));
  const maxStage = Math.max(1, ...stages.map((s) => s.count));
  const setAside = byStatus("refuse") + byStatus("ecarte");
  const contactes = v.premiersPartis;
  const totalReponses = Object.values(v.reponses).reduce((t, n) => t + n, 0);
  const interesses = (v.reponses.interesse ?? 0) + v.interets.length;
  const totalCouts = v.couts.reduce((t, k) => t + k.montant, 0);
  const maxCout = Math.max(0.01, ...v.couts.map((k) => k.montant));
  const maxJour = Math.max(1, ...v.parJour.map((j) => j.premiers + j.relances));

  const facts = [
    { label: "maquettes prêtes", value: String(v.demos), href: "/sid" },
    { label: "e-mails prêts à partir", value: String(v.emailsValides), href: "/valerie" },
    { label: "contactés (1er e-mail parti)", value: String(contactes), href: "/valerie" },
    { label: "relances parties", value: String(v.relancesParties), href: "/valerie" },
    { label: "maquettes ouvertes", value: `${v.nbOuvertes} · ${pct(v.nbOuvertes, contactes)}`, href: "#maquettes-ouvertes" },
    { label: "personnes qui ont répondu (hors automatiques)", value: `${totalReponses} · ${pct(totalReponses, contactes)}`, href: "#reponses" },
  ];

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/campagnes" className="text-shop hover:underline">← Toutes les campagnes</Link></p>
      <PageHeader title={c.name} description={c.description ?? "Où en est cette campagne, de la recherche des prospects aux réponses."} />
      <p className="-mt-3 mb-6 flex flex-wrap items-center gap-2 text-sm text-muted">
        <Badge tone={statut.tone}>{statut.label}</Badge>
        {[c.target_category, c.target_city].filter(Boolean).join(" à ")}
        {c.started_at && <> · depuis le {formatDay(c.started_at)}</>}
        {c.ended_at && <> · jusqu&apos;au {formatDay(c.ended_at)}</>}
      </p>

      {(interesses > 0) && (
        <Panel title="Intéressés" className="mb-6">
          <ul className="divide-y divide-line text-sm">
            {v.interets.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                <span><b>{i.nom ?? "?"}</b>{i.ville && <span className="text-muted"> · {i.ville}</span>} a cliqué « Ce site m&apos;intéresse »</span>
                <span className="text-muted">{formatDay(i.cree_le)}{i.traite_le ? " · traité" : ""}</span>
              </li>
            ))}
            {(v.reponses.interesse ?? 0) > 0 && (
              <li className="px-4 py-3 sm:px-5">
                {v.reponses.interesse} réponse(s) « intéressé » par e-mail : <Link href="/boite" className="text-shop hover:underline">voir la boîte mail</Link>
              </li>
            )}
          </ul>
        </Panel>
      )}

      <Panel className="mb-6">
        <div className="px-4 pt-4 sm:px-5">
          <h2 className="font-display text-lg font-semibold">Parcours des prospects</h2>
          <p className="text-sm text-muted">{v.total} repérés · {setAside} refusés ou écartés</p>
        </div>
        <ol className="grid grid-cols-3 gap-px overflow-hidden sm:grid-cols-6">
          {stages.map((s) => (
            <li key={s.status} className="px-4 pb-4 pt-5 sm:px-5">
              <div className="flex h-20 items-end">
                <div className="w-full rounded-t-md bg-shop/80" style={{ height: `${Math.max(6, (s.count / maxStage) * 100)}%` }} aria-hidden />
              </div>
              <p className="tabular mt-3 font-display text-2xl font-semibold">{s.count}</p>
              <p className="text-sm text-muted">{s.label}</p>
            </li>
          ))}
        </ol>
        {v.recherches && (
          <p className="border-t border-line px-4 py-3 text-sm text-muted sm:px-5">
            Loïc a déjà cherché <b className="tabular text-ink">{v.recherches.faites}</b> couples ville × métier : {v.total} fiches Google gardées,
            {" "}{v.total - byStatus("ecarte")} retenues ({pct(v.total - byStatus("ecarte"), v.total)}), les autres écartées par la règle.
          </p>
        )}
      </Panel>

      <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {facts.map((f) => (
          <Link key={f.label} href={f.href} className="rounded-xl border border-line bg-surface px-4 py-3 hover:border-shop">
            <dd className="tabular font-display text-2xl font-semibold">{f.value}</dd>
            <dt className="text-sm text-muted">{f.label}</dt>
          </Link>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="E-mails partis, 14 derniers jours">
          <div className="px-4 py-4 sm:px-5">
            <div className="flex h-32 items-end gap-1" aria-label="E-mails partis par jour">
              {v.parJour.map((j) => {
                const d = new Date(`${j.jour}T12:00:00`);
                const tot = j.premiers + j.relances;
                return (
                  <div key={j.jour} className="flex flex-1 flex-col items-center gap-1" title={`${j.premiers} premier(s), ${j.relances} relance(s)`}>
                    <span className="tabular text-[11px] text-muted">{tot || ""}</span>
                    <div className="flex w-full flex-col justify-end" style={{ height: `${(tot / maxJour) * 88}px` }}>
                      <span className="block w-full rounded-t bg-shop/50" style={{ height: tot ? `${(j.relances / tot) * 100}%` : 0 }} />
                      <span className="block w-full bg-shop" style={{ height: tot ? `${(j.premiers / tot) * 100}%` : 0 }} />
                    </div>
                    <span className="text-[11px] text-muted">{d.toLocaleDateString("fr-FR", { day: "numeric" })}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 flex gap-4 text-sm text-muted">
              <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-shop align-middle" />premiers e-mails</span>
              <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-shop/50 align-middle" />relances</span>
            </p>
            {v.emailsAValider > 0 && <p className="mt-2 text-sm">{v.emailsAValider} e-mail(s) à valider sur la <Link href="/valerie" className="text-shop hover:underline">page Valérie</Link>.</p>}
          </div>
        </Panel>

        <Panel title="Réponses reçues">
          <div id="reponses">
            {totalReponses === 0 ? (
              <EmptyState>Aucune réponse pour l&apos;instant (les réponses automatiques ne comptent pas).</EmptyState>
            ) : (
              <>
                <p className="flex flex-wrap gap-2 px-4 pt-3 sm:px-5">
                  {Object.entries(v.reponses).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                    <Badge key={k} tone={mailCategory[k as MailCategory]?.tone ?? "neutral"}>{mailCategory[k as MailCategory]?.label ?? k} · {n}</Badge>
                  ))}
                </p>
                <ul className="mt-2 divide-y divide-line border-t border-line text-sm">
                  {v.dernieresReponses.map((r) => (
                    <li key={r.id} className="px-4 py-3 sm:px-5">
                      <Link href={r.fil ? `/boite?m=${r.fil}` : "/boite"} className="font-medium hover:underline">{r.nom ?? "?"}</Link>
                      <span className="text-muted"> · {formatDay(r.recu)} · {mailCategory[r.categorie as MailCategory]?.label ?? r.categorie ?? "non trié"}{r.nbMessages > 1 ? ` · ${r.nbMessages} messages` : ""}</span>
                      {r.resume && <p className="text-muted">{r.resume}</p>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Maquettes ouvertes" className="mt-6" action={<Link href="/valerie" className="text-sm font-medium text-shop hover:underline">Page Valérie</Link>}>
        <div id="maquettes-ouvertes">
          <p className="px-4 pt-3 text-sm sm:px-5">
            <span className="tabular font-semibold">{v.nbOuvertes}</span> maquette(s) ouverte(s) pour{" "}
            <span className="tabular font-semibold">{contactes}</span> contactés <span className="text-muted">({pct(v.nbOuvertes, contactes)})</span>.
          </p>
          {v.ouvertes.length > 0 ? (
            <ul className="mt-2 divide-y divide-line border-t border-line text-sm">
              {v.ouvertes.map((o, i) => <LigneOuverture key={i} o={o} />)}
            </ul>
          ) : (
            <p className="px-4 pb-4 pt-1 text-sm text-muted sm:px-5">Aucune pour l&apos;instant. Tes propres aperçus ne comptent pas.</p>
          )}
        </div>
      </Panel>

      <Panel title="Ce que coûte la campagne" className="mt-6" action={<span className="tabular text-sm text-muted">Total {formatEur(totalCouts)}</span>}>
        <div className="space-y-3 px-4 py-4 sm:px-5">
          {v.couts.length === 0 && <EmptyState>Aucune dépense enregistrée pour cette campagne.</EmptyState>}
          {v.couts.map((k) => (
            <div key={k.agent} className="grid grid-cols-[8.5rem_1fr_4.5rem] items-center gap-3 text-sm sm:grid-cols-[10rem_1fr_5rem]">
              <span className="truncate">{k.agent === "hors" ? "Hors agents" : agentLabel[k.agent as AgentName] ?? k.agent}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-paper">
                <span className="block h-full rounded-full bg-shop" style={{ width: `${(k.montant / maxCout) * 100}%` }} />
              </span>
              <span className="tabular text-right">{formatEur(k.montant)}</span>
            </div>
          ))}
          <p className="text-xs text-muted">Coûts d&apos;IA enregistrés pour cette campagne (maquettes, e-mails). Les recherches Google restent dans le quota gratuit.</p>
        </div>
      </Panel>
    </>
  );
}
