// Page « Sid » : l'agent qui prépare les maquettes de sites (démos) pour les prospects qualifiés.
// Automatique : Sid tourne après chaque vague de Loïc (workflow agent-prospection.yml) ; bouton pour le lancer à la main.
import type { Metadata } from "next";
import Link from "@/components/lien";
import { launchSid } from "../../sid-actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, DemoTag, EmptyState, Field, PageHeader, Panel } from "@/components/ui";
import { getData } from "@/lib/data";
import {
  formatDate, formatDuration, formatEurPrecise, formatNumber, sum, taskStatus, websiteStatus, type Tone,
} from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Task } from "@/lib/types";

export const metadata: Metadata = { title: "Sid" };

const NOM = "Sid";

const notices: Record<string, { tone: "success" | "danger" | "warning"; text: string }> = {
  lance: { tone: "success", text: "C'est parti : GitHub démarre Sid (compter environ une minute avant qu'il apparaisse ci-dessous). La page se met à jour toute seule." },
  demo: { tone: "warning", text: "Mode démo : rien n'est lancé. Branche Supabase pour piloter le vrai Sid." },
  cle: { tone: "warning", text: "Il manque la clé GitHub pour lancer Sid d'ici (la même que pour Loïc : GITHUB_ACTIONS_TOKEN dans .env.local)." },
  occupe: { tone: "warning", text: "Sid travaille déjà. Attends la fin de ce lancement." },
  invalide: { tone: "danger", text: "Nombre de maquettes invalide : entre 1 et 20." },
  acces: { tone: "danger", text: "Ce compte n'a pas le droit de lancer Sid." },
  github: { tone: "danger", text: "GitHub a refusé le lancement. Vérifie la clé GitHub et que le fichier agent-demos.yml est bien sur GitHub." },
};

const toneClass = {
  success: "bg-[var(--t-success-bg)] text-[var(--t-success-fg)]",
  danger: "bg-[var(--t-danger-bg)] text-[var(--t-danger-fg)]",
  warning: "bg-[var(--t-warning-bg)] text-[var(--t-warning-fg)]",
};

const field = "w-full rounded-lg border border-line bg-paper px-3 py-2";
const button = "w-full rounded-lg bg-shop px-4 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:text-[var(--paper)]";

/** Date du jour (AAAA-MM-JJ) à l'heure de Paris. */
const parisDay = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(d);
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

function Bilan({ t }: { t: Task }) {
  const o = t.output ?? {};
  if (!("demos" in o)) return null;
  return (
    <p className="text-sm text-muted">
      {formatNumber(num(o.demos))} maquette(s) prête(s)
      {num(o.ignores) > 0 && ` · ${formatNumber(num(o.ignores))} ignoré(s)`}
      {num(o.erreurs) > 0 && ` · ${formatNumber(num(o.erreurs))} erreur(s)`} · {formatEurPrecise(num(o.cout_ia_eur))}
    </p>
  );
}

export default async function SidPage({ searchParams }: {
  searchParams: Promise<{ info?: string; erreur?: string; depuis?: string }>;
}) {
  const { info, erreur, depuis } = await searchParams;
  const { tasks, costs, prospects, websites } = await getData("tasks", "costs", "prospects", "websites");
  const notice = notices[erreur ?? info ?? ""];

  const runs = tasks
    .filter((t) => t.agent === "site_demo")
    .sort((a, b) => (b.started_at ?? b.created_at).localeCompare(a.started_at ?? a.created_at));
  const running = runs.find((t) => t.status === "en_cours");
  const now = Date.now();
  const justLaunched = info === "lance" && now - Number(depuis ?? 0) < 3 * 60_000;

  const demos = websites
    .filter((w) => w.kind === "demo" && w.status !== "archive")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const withDemo = new Set(demos.map((w) => w.prospect_id));
  const waiting = prospects.filter((p) => p.status === "qualifie" && !withDemo.has(p.id));
  const prospectById = new Map(prospects.map((p) => [p.id, p]));

  const month = parisDay(new Date(now)).slice(0, 7);
  const runIds = new Set(runs.map((t) => t.id));
  const costMonth = sum(costs
    .filter((c) => c.task_id && runIds.has(c.task_id) && parisDay(new Date(c.incurred_at)).startsWith(month))
    .map((c) => c.amount_eur));
  const thisMonth = demos.filter((w) => parisDay(new Date(w.created_at)).startsWith(month)).length;

  const state: { label: string; tone: Tone } = running || justLaunched
    ? { label: running ? "Au travail" : "Démarrage…", tone: "progress" }
    : { label: "Prêt", tone: "success" };

  const hasToken = Boolean(process.env.GITHUB_ACTIONS_TOKEN);
  const repo = process.env.GITHUB_REPOSITORY_DEVANTURE || "Ambroiselc/Devanture";

  return (
    <>
      <AutoRefresh active={Boolean(running) || justLaunched} />
      <PageHeader
        title={NOM}
        description={`Ton agent des maquettes. Pour chaque prospect qualifié par Loïc, ${NOM} rédige avec Claude Haiku une maquette de site au style sobre et pro, à partir de ce qu'on sait vraiment de l'artisan. Il n'invente rien : téléphone, horaires, photos, avis et prix restent « à compléter ». Rien n'est envoyé ni mis en ligne.`}
      >
        <div><Badge tone={state.tone}>{state.label}</Badge></div>
      </PageHeader>

      {notice && (
        <p role="status" className={`mb-6 rounded-xl px-4 py-3 text-sm ${toneClass[notice.tone]}`}>{notice.text}</p>
      )}

      {/* Chiffres clés */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "En attente de maquette", value: formatNumber(waiting.length), hint: "prospects qualifiés sans maquette" },
          { label: "Maquettes prêtes", value: formatNumber(demos.length), hint: `${formatNumber(thisMonth)} ce mois-ci` },
          { label: "Coût IA ce mois-ci", value: formatEurPrecise(costMonth), hint: "≈ 0,0005 € par maquette" },
          { label: "Modèle", value: "Artisan pro", hint: "sobre et professionnel" },
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
            <form action={launchSid} className="space-y-4 px-4 py-4 sm:px-5">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Nombre de maquettes</span>
                <input name="limite" type="number" min={1} max={20} defaultValue={Math.min(20, Math.max(1, waiting.length || 5))} className={field} />
                <span className="mt-1 block text-xs text-muted">20 au maximum. Les meilleurs scores passent en premier.</span>
              </label>
              <button type="submit" className={button} disabled={Boolean(running) || waiting.length === 0}>
                {running ? `${NOM} travaille…` : waiting.length === 0 ? "Aucun prospect en attente" : `Lancer ${NOM}`}
              </button>
              <p className="text-xs text-muted">
                <a href="/demo/exemple" target="_blank" rel="noopener noreferrer" className="font-medium text-shop hover:underline">Voir le modèle avec un exemple</a>
                {" "}· Automatique : après chaque vague de Loïc.
              </p>
              {!hasToken && isSupabaseConfigured && (
                <div className="space-y-1 rounded-lg bg-paper px-3 py-2 text-xs text-muted">
                  <p className="font-medium text-ink">Pour lancer {NOM} d&apos;ici, il faut la clé GitHub (la même que pour Loïc).</p>
                  <p>
                    En attendant :{" "}
                    <a className="font-medium text-shop underline" href={`https://github.com/${repo}/actions/workflows/agent-demos.yml`} target="_blank" rel="noreferrer">
                      le lancer depuis GitHub
                    </a>.
                  </p>
                </div>
              )}
            </form>
          </Panel>

          <Panel title="En attente de maquette"
            action={<Link href="/prospects" className="text-sm font-medium text-shop hover:underline">Prospects</Link>}>
            {waiting.length === 0 ? (
              <EmptyState>Aucun prospect qualifié n&apos;attend. Lance Loïc pour en trouver.</EmptyState>
            ) : (
              <dl className="px-4 py-2 sm:px-5">
                {[...waiting].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 8).map((p) => (
                  <Field key={p.id} label={`${p.name}${p.city ? ` · ${p.city}` : ""}`}>
                    <span className="tabular">{p.score ?? "—"}</span>
                  </Field>
                ))}
              </dl>
            )}
          </Panel>
        </div>

        <div className="space-y-6 lg:col-span-3">
          <Panel title="Dernières maquettes">
            {demos.length === 0 ? (
              <EmptyState>{NOM} n&apos;a pas encore préparé de maquette.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {demos.slice(0, 8).map((w) => {
                  const p = prospectById.get(w.prospect_id);
                  return (
                    <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                      <div className="min-w-0">
                        <p className="font-medium">{p?.name ?? "Prospect supprimé"}<DemoTag show={w.is_demo} /></p>
                        <p className="text-sm text-muted">{[p?.category, p?.city].filter(Boolean).join(" · ")} · {formatDate(w.created_at)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge tone={websiteStatus[w.status].tone}>{websiteStatus[w.status].label}</Badge>
                        {w.content ? (
                          <a href={`/demo/${w.id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-shop hover:underline">Voir</a>
                        ) : null}
                        {Boolean(w.content) && w.slug && (
                          <a href={`/m/${w.content && w.slug}?apercu=1`} target="_blank" rel="noopener noreferrer" title="Le lien envoyé à l'artisan, visible sans connexion" className="text-sm font-medium text-shop hover:underline">Lien public</a>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Derniers lancements"
            action={<Link href="/taches" className="text-sm font-medium text-shop hover:underline">Toutes les tâches</Link>}>
            {runs.length === 0 ? (
              <EmptyState>{NOM} n&apos;a pas encore travaillé.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {runs.slice(0, 6).map((t) => (
                  <li key={t.id} className="space-y-1 px-4 py-3 sm:px-5">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">{t.title}<DemoTag show={t.is_demo} /></p>
                      <Badge tone={taskStatus[t.status].tone}>{taskStatus[t.status].label}</Badge>
                    </div>
                    <p className="text-sm text-muted">
                      {formatDate(t.started_at ?? t.created_at)} · durée {formatDuration(t.started_at, t.finished_at)}
                    </p>
                    <Bilan t={t} />
                    {typeof t.output?.arret === "string" && <p className="text-sm text-[var(--t-warning-fg)]">{t.output.arret}</p>}
                    {t.error_message && <p className="text-sm text-[var(--t-danger-fg)]">{t.error_message}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
