// Page « Prospects » : les commerces repérés et leur avancement.
import type { Metadata } from "next";
import { Badge, DemoTag, EmptyState, FilterTabs, PageHeader, Panel } from "@/components/ui";
import { getComptesProspects, getData, getProspectsFiltres } from "@/lib/data";
import { formatDate, prospectStatus, websiteQuality } from "@/lib/format";
import type { Prospect, ProspectStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Prospects" };

function Score({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-2" title={`Score d'intérêt : ${value}/100`}>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-paper">
        <span className="block h-full rounded-full bg-shop" style={{ width: `${value}%` }} />
      </span>
      <span className="tabular text-sm">{value}</span>
    </span>
  );
}

/** Site actuel : qualité estimée par l'agent, sinon simple oui/non. */
function SiteActuel({ p }: { p: Prospect }) {
  const label = p.website_quality ? websiteQuality[p.website_quality] : p.has_website ? "Oui" : "Aucun";
  const muted = !p.has_website && p.website_quality !== "reseau_social";
  return p.current_website ? (
    <a href={p.current_website} target="_blank" rel="noreferrer" className="underline decoration-line underline-offset-2 hover:decoration-shop">
      {label}
    </a>
  ) : (
    <span className={muted ? "text-muted" : undefined}>{label}</span>
  );
}

function Contact({ p }: { p: Prospect }) {
  if (!p.email) return <span className="text-muted">Pas d&apos;e-mail</span>;
  return (
    <span className="break-all" title={p.email_source ? `Trouvé sur ${p.email_source}` : undefined}>{p.email}</span>
  );
}

export default async function ProspectsPage({ searchParams }: {
  searchParams: Promise<{ statut?: string }>;
}) {
  const { statut } = await searchParams;
  const current = statut && statut in prospectStatus ? (statut as ProspectStatus) : undefined;
  // Les prospects du filtre sont lus directement dans la base (les 300 mieux notés), et les compteurs sont
  // calculés par la base : justes même avec des milliers de prospects. En mode démo : données fictives.
  const [{ prospects, campaigns, websites }, comptes, filtres] =
    await Promise.all([getData("prospects", "campaigns", "websites"), getComptesProspects(), getProspectsFiltres(current)]);

  const list = filtres ?? prospects
    .filter((p) => !current || p.status === current)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  const campaignName = new Map(campaigns.map((c) => [c.id, c.name]));
  const siteCount = (id: string) => websites.filter((w) => w.prospect_id === id).length;

  // Part des prospects trouvés par l'agent (hors écartés) pour lesquels on a un e-mail :
  // c'est l'indicateur clé de la phase 2.
  const parAgentListe = prospects.filter((p) => (p.siret || p.google_place_id) && p.status !== "ecarte");
  const parAgent = { length: comptes?.parAgent ?? parAgentListe.length };
  const avecEmail = comptes?.parAgentAvecEmail ?? parAgentListe.filter((p) => p.email).length;

  const tabs = [
    { value: undefined, label: "Tous", count: comptes?.total ?? prospects.length },
    ...(Object.keys(prospectStatus) as ProspectStatus[]).map((s) => ({
      value: s, label: prospectStatus[s].label, count: comptes?.parStatut[s] ?? prospects.filter((p) => p.status === s).length,
    })).filter((t) => t.count > 0 || t.value === current),
  ];

  return (
    <>
      <PageHeader title="Prospects" description="Les commerces repérés, classés par score d'intérêt. Le score estime à quel point un site leur serait utile." />
      {parAgent.length > 0 && (
        <p className="mb-4 text-sm text-muted">
          Trouvés par l&apos;agent : <span className="tabular font-medium text-ink">{parAgent.length}</span> prospects retenus, dont{" "}
          <span className="tabular font-medium text-ink">{avecEmail}</span> avec un e-mail (
          <span className="tabular font-medium text-ink">{Math.round((100 * avecEmail) / parAgent.length)} %</span>).
        </p>
      )}
      <FilterTabs basePath="/prospects" param="statut" current={current} options={tabs} />

      <Panel>
        {list.length === 0 ? (
          <EmptyState>Aucun prospect avec ce statut.</EmptyState>
        ) : (
          <>
            {/* Tableau : écrans moyens et grands */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-muted">
                  <tr>
                    <th className="px-5 py-3 font-medium">Commerce</th>
                    <th className="px-3 py-3 font-medium">Ville</th>
                    <th className="px-3 py-3 font-medium">Site actuel</th>
                    <th className="px-3 py-3 font-medium">E-mail</th>
                    <th className="px-3 py-3 font-medium">Score</th>
                    <th className="px-3 py-3 font-medium">Statut</th>
                    <th className="px-5 py-3 font-medium">Ajouté le</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {list.map((p) => (
                    <tr key={p.id} className="align-top">
                      <td className="px-5 py-3">
                        <p className="font-medium">{p.name}<DemoTag show={p.is_demo} /></p>
                        <p className="text-muted">
                          {p.category ?? "Catégorie inconnue"}
                          {p.campaign_id && <> · {campaignName.get(p.campaign_id)}</>}
                        </p>
                        {p.score_reason && <p className="mt-1 text-muted">{p.score_reason}</p>}
                        {p.notes && <p className="mt-1 text-muted italic">{p.notes}</p>}
                      </td>
                      <td className="px-3 py-3">{p.city ?? "—"}</td>
                      <td className="px-3 py-3">
                        <SiteActuel p={p} />
                        {siteCount(p.id) > 0 && (
                          <p className="text-xs text-muted">{siteCount(p.id)} site(s) Devanture</p>
                        )}
                      </td>
                      <td className="max-w-56 px-3 py-3"><Contact p={p} /></td>
                      <td className="px-3 py-3"><Score value={p.score} /></td>
                      <td className="px-3 py-3">
                        <Badge tone={prospectStatus[p.status].tone}>{prospectStatus[p.status].label}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-muted">{formatDate(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Fiches : téléphone */}
            <ul className="divide-y divide-line md:hidden">
              {list.map((p) => (
                <li key={p.id} className="space-y-2 px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{p.name}<DemoTag show={p.is_demo} /></p>
                      <p className="text-sm text-muted">{p.category} · {p.city}</p>
                    </div>
                    <Badge tone={prospectStatus[p.status].tone}>{prospectStatus[p.status].label}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <Score value={p.score} />
                    <span className="text-muted"><SiteActuel p={p} /></span>
                  </div>
                  <p className="text-sm"><Contact p={p} /></p>
                  {p.score_reason && <p className="text-sm text-muted">{p.score_reason}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </>
  );
}
