// Page « Pedro » (30/10) : l'agent des sites définitifs des clients.
// Pedro prépare chaque site à partir de la maquette et du contenu envoyé par le client, puis le met en ligne
// sur son domaine (docs/sites-clients.md). Les boutons par client sont sur la page Clients ; ici, la vue d'ensemble.
// Requêtes légères (Workers gratuit : jamais toute la base).
import type { Metadata } from "next";
import Link from "@/components/lien";
import { lancerPedroAttente } from "@/app/clients-actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { etapes, type EtapeClient } from "@/lib/clients";
import { formatDate, formatDuration, formatEurPrecise, formatNumber, taskStatus, type Tone } from "@/lib/format";
import type { Task, TaskEvent } from "@/lib/types";

export const metadata: Metadata = { title: "Pedro" };

const NOM = "Pedro";

const notices: Record<string, { tone: "success" | "danger" | "warning"; text: string }> = {
  lance: { tone: "success", text: "C'est parti : Pedro prépare les sites en attente (5 minutes environ par site). La page se met à jour toute seule." },
  cle: { tone: "warning", text: "Il manque la clé GitHub du tableau de bord (GITHUB_ACTIONS_TOKEN dans Cloudflare)." },
  occupe: { tone: "warning", text: "Pedro travaille déjà. Attends la fin de ce lancement." },
  acces: { tone: "danger", text: "Ce compte n'a pas le droit de lancer Pedro." },
  github: { tone: "danger", text: "GitHub a refusé le lancement. Réessaie ; si ça continue, envoie-moi une capture." },
  demo: { tone: "warning", text: "Mode démo : rien n'est lancé." },
};

const toneClass = {
  success: "bg-[var(--t-success-bg)] text-[var(--t-success-fg)]",
  danger: "bg-[var(--t-danger-bg)] text-[var(--t-danger-fg)]",
  warning: "bg-[var(--t-warning-bg)] text-[var(--t-warning-fg)]",
};
const button = "w-full rounded-lg bg-shop px-4 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:text-[var(--paper)]";

interface ClientLigne { id: string; prospect_id: string; etape: EtapeClient; formule: string; domaine: string | null; contenu_recu_le: string | null;
  prospects: { name: string; city: string | null } | null }
interface SiteLigne { id: string; prospect_id: string; url: string | null; status: string; template: string | null; updated_at: string; published_at: string | null }
interface DevisLigne { id: string; website_id: string; nom: string | null; commune: string | null; statut: string; created_at: string }

const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
const statutsDevis: Record<string, { label: string; tone: Tone }> = {
  a_transmettre: { label: "En cours d'envoi", tone: "progress" }, transmis: { label: "Transmise", tone: "success" },
  erreur: { label: "Pas transmise", tone: "danger" }, ignore: { label: "Ignorée", tone: "muted" },
};

export default async function PedroPage({ searchParams }: {
  searchParams: Promise<{ info?: string; erreur?: string; depuis?: string }>;
}) {
  const { info, erreur, depuis } = await searchParams;
  const notice = notices[erreur ?? info ?? ""];

  let clients: ClientLigne[] = [];
  let sites: SiteLigne[] = [];
  let devis: DevisLigne[] = [];
  let runs: Task[] = [];
  let evenements: TaskEvent[] = [];
  let coutMois = 0;
  let tablesPretes = true;
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const debutMois = new Date();
    debutMois.setDate(1);
    debutMois.setHours(0, 0, 0, 0);
    const [c, w, d, t] = await Promise.all([
      supabase.from("clients").select("id, prospect_id, etape, formule, domaine, contenu_recu_le, prospects(name, city)")
        .not("etape", "in", "(abandonne,resilie)").order("updated_at", { ascending: false }).limit(200),
      supabase.from("websites").select("id, prospect_id, url, status, template, updated_at, published_at")
        .eq("kind", "production").neq("status", "archive").order("updated_at", { ascending: false }).limit(200),
      supabase.from("demandes_devis").select("id, website_id, nom, commune, statut, created_at")
        .order("created_at", { ascending: false }).limit(15),
      supabase.from("tasks").select("*").eq("agent", "site_production").order("created_at", { ascending: false }).limit(8),
    ]);
    if (d.error) tablesPretes = false;
    clients = (c.data ?? []) as unknown as ClientLigne[];
    sites = (w.data ?? []) as SiteLigne[];
    devis = (d.data ?? []) as DevisLigne[];
    runs = (t.data ?? []) as Task[];
    const ids = runs.map((r) => r.id);
    if (ids.length) {
      const [ev, co] = await Promise.all([
        supabase.from("task_events").select("*").in("task_id", ids.slice(0, 3)).in("level", ["warning", "error"])
          .order("created_at", { ascending: false }).limit(20),
        supabase.from("costs").select("amount_eur, task_id").in("task_id", ids).gte("incurred_at", debutMois.toISOString()),
      ]);
      evenements = (ev.data ?? []) as TaskEvent[];
      coutMois = (co.data ?? []).reduce((s, x) => s + num(x.amount_eur), 0);
    }
  }

  const siteParProspect = new Map(sites.map((s) => [s.prospect_id, s]));
  const nomParSite = new Map(sites.map((s) => [s.id, clients.find((c) => c.prospect_id === s.prospect_id)?.prospects?.name ?? "Client"]));
  const enAttente = clients.filter((c) => c.etape === "contenu_recu" && !siteParProspect.has(c.prospect_id));
  const enLigne = sites.filter((s) => s.status === "publie");
  const aMettreEnLigne = clients.filter((c) => ["valide", "domaine_achete"].includes(c.etape) && siteParProspect.has(c.prospect_id));
  const running = runs.find((r) => r.status === "en_cours");
  const justLaunched = info === "lance" && Date.now() - Number(depuis ?? 0) < 3 * 60_000;
  const state: { label: string; tone: Tone } = running || justLaunched
    ? { label: running ? "Au travail" : "Démarrage…", tone: "progress" } : { label: "Prêt", tone: "success" };

  // Les clients qui ont un site, du plus récent au plus ancien.
  const avecSite = clients.filter((c) => siteParProspect.has(c.prospect_id))
    .sort((a, b) => siteParProspect.get(b.prospect_id)!.updated_at.localeCompare(siteParProspect.get(a.prospect_id)!.updated_at));

  return (
    <>
      <AutoRefresh active={Boolean(running) || justLaunched} />
      <PageHeader
        title={NOM}
        description={`Ton agent des sites définitifs. Quand un client a envoyé ses photos et ses infos, ${NOM} part de sa maquette, dans le style qu'il a choisi, réécrit les textes avec ce qu'il a dit, légende et trie ses photos, puis publie un aperçu. Après la validation écrite du client et le branchement du domaine, il met le site en ligne. Rien ne part au client sans toi.`}
      >
        <div><Badge tone={state.tone}>{state.label}</Badge></div>
      </PageHeader>

      {notice && <p role="status" className={`mb-6 rounded-xl px-4 py-3 text-sm ${toneClass[notice.tone]}`}>{notice.text}</p>}
      {!tablesPretes && isSupabaseConfigured && (
        <p className="mb-6 rounded-xl bg-[var(--t-warning-bg)] px-4 py-3 text-sm text-[var(--t-warning-fg)]">
          Il manque la migration <code>20261030000000_sites_clients.sql</code> (GitHub → Actions → « Appliquer une migration »).
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Contenu reçu, site à faire", value: formatNumber(enAttente.length), hint: "fait chaque matin de semaine" },
          { label: "À mettre en ligne", value: formatNumber(aMettreEnLigne.length), hint: "validés par le client" },
          { label: "Sites en ligne", value: formatNumber(enLigne.length), hint: `${formatNumber(sites.length)} site(s) en tout` },
          { label: "Coût IA ce mois-ci", value: formatEurPrecise(coutMois), hint: "quelques centimes par site" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-line bg-surface px-4 py-3">
            <p className="text-sm text-muted">{k.label}</p>
            <p className="tabular font-display text-2xl font-semibold">{k.value}</p>
            <p className="text-xs text-muted">{k.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-2">
          <Panel title={`Lancer ${NOM}`}>
            <form action={lancerPedroAttente} className="space-y-3 px-4 py-4 sm:px-5">
              <button type="submit" className={button} disabled={Boolean(running) || enAttente.length === 0}>
                {running ? `${NOM} travaille…` : enAttente.length === 0 ? "Aucun site en attente" : `Préparer ${enAttente.length} site(s) maintenant`}
              </button>
              <p className="text-xs text-muted">
                Automatique chaque jour ouvré vers 9 h 45. Pour un seul client, refaire un site ou le mettre en ligne :
                les boutons sont sur sa fiche, page <Link href="/clients" className="font-medium text-shop hover:underline">Clients</Link>.
              </p>
            </form>
          </Panel>

          <Panel title="En attente">
            {enAttente.length + aMettreEnLigne.length === 0 ? (
              <EmptyState>Rien n&apos;attend {NOM} pour l&apos;instant.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {[...enAttente.map((c) => ({ c, quoi: "Site à préparer" })), ...aMettreEnLigne.map((c) => ({ c, quoi: c.domaine ? `À mettre en ligne sur ${c.domaine}` : "Validé : noter son domaine" }))]
                  .map(({ c, quoi }) => (
                    <li key={c.id} className="px-4 py-3 text-sm sm:px-5">
                      <Link href={`/clients?vers=${c.id}`} className="font-medium hover:underline">{c.prospects?.name ?? "Client"}</Link>
                      <p className="text-muted">{quoi}{c.contenu_recu_le && c.etape === "contenu_recu" ? ` · contenu reçu le ${formatDate(c.contenu_recu_le)}` : ""}</p>
                    </li>
                  ))}
              </ul>
            )}
          </Panel>

          <Panel title="Demandes de devis reçues">
            {devis.length === 0 ? (
              <EmptyState>Aucune demande reçue par les sites des clients pour l&apos;instant.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {devis.map((d) => (
                  <li key={d.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm sm:px-5">
                    <div className="min-w-0">
                      <p className="font-medium">{nomParSite.get(d.website_id) ?? "Client"}</p>
                      <p className="text-muted">{formatDate(d.created_at)} · {d.nom ?? "sans nom"}{d.commune && ` (${d.commune})`}</p>
                    </div>
                    <Badge tone={(statutsDevis[d.statut] ?? statutsDevis.erreur).tone}>{(statutsDevis[d.statut] ?? statutsDevis.erreur).label}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6 lg:col-span-3">
          <Panel title="Sites des clients" action={<Link href="/clients" className="text-sm font-medium text-shop hover:underline">Clients</Link>}>
            {avecSite.length === 0 ? (
              <EmptyState>{NOM} n&apos;a pas encore fait de site. Il attend le premier client qui envoie ses photos.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {avecSite.map((c) => {
                  const s = siteParProspect.get(c.prospect_id)!;
                  const e = etapes[c.etape];
                  return (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                      <div className="min-w-0">
                        <p className="font-medium">{c.prospects?.name ?? "Client"}</p>
                        <p className="text-sm text-muted">
                          {[c.prospects?.city, c.formule === "pro" ? "Pro" : "Essentiel", s.template === "site-chaleureux" ? "chaleureux" : "sobre"].filter(Boolean).join(" · ")}
                          {" "}· mis à jour le {formatDate(s.updated_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge tone={e.tone}>{e.label}</Badge>
                        {s.url && (
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-shop hover:underline">
                            {s.status === "publie" ? "Voir le site" : "Aperçu"}
                          </a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Derniers lancements" action={<Link href="/taches" className="text-sm font-medium text-shop hover:underline">Toutes les tâches</Link>}>
            {runs.length === 0 ? (
              <EmptyState>{NOM} n&apos;a pas encore travaillé.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {runs.map((t) => {
                  const o = t.output ?? {};
                  const alertes = evenements.filter((ev) => ev.task_id === t.id);
                  return (
                    <li key={t.id} className="space-y-1 px-4 py-3 sm:px-5">
                      <div className="flex items-start justify-between gap-3">
                        <p className="font-medium">{t.title}</p>
                        <Badge tone={taskStatus[t.status].tone}>{taskStatus[t.status].label}</Badge>
                      </div>
                      <p className="text-sm text-muted">
                        {formatDate(t.started_at ?? t.created_at)} · durée {formatDuration(t.started_at, t.finished_at)}
                        {"sites" in o && <> · {formatNumber(num(o.sites))} site(s) · {formatNumber(num(o.en_ligne))} mis en ligne · {formatNumber(num(o.photos))} photo(s) · {formatEurPrecise(num(o.cout_ia_eur))}</>}
                      </p>
                      {alertes.length > 0 && (
                        <ul className="space-y-0.5 text-sm">
                          {alertes.map((ev) => (
                            <li key={ev.id} className={ev.level === "error" ? "text-[var(--t-danger-fg)]" : "text-[var(--t-warning-fg)]"}>{ev.message}</li>
                          ))}
                        </ul>
                      )}
                      {t.error_message && <p className="text-sm text-[var(--t-danger-fg)]">{t.error_message}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
