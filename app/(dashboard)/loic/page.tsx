// Page « Loïc » : l'agent de prospection, ses réglages en direct, son lancement et son historique.
import type { Metadata } from "next";
import Link from "@/components/lien";
import { launchLoic, saveLoicSettings } from "../../loic-actions";
import { CODES_COMMUNES, COMMUNES, METIERS } from "@/agents/lib/metiers";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, DemoTag, EmptyState, Field, PageHeader, Panel } from "@/components/ui";
import { getComptesProspects, getData, getLoicSettings } from "@/lib/data";
import {
  formatDate, formatDuration, formatEurPrecise, formatNumber, sum, taskStatus, type Tone,
} from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Task } from "@/lib/types";

export const metadata: Metadata = { title: "Loïc" };

const notices: Record<string, { tone: "success" | "danger" | "warning"; text: string }> = {
  enregistre: { tone: "success", text: "Réglages enregistrés : Loïc les appliquera dès son prochain lancement." },
  lance: { tone: "success", text: "C'est parti : GitHub démarre Loïc (compter environ une minute avant qu'il apparaisse ci-dessous). La page se met à jour toute seule." },
  demo: { tone: "warning", text: "Mode démo : rien n'est enregistré ni lancé. Branche Supabase pour piloter le vrai Loïc." },
  invalide: { tone: "danger", text: "Une valeur n'est pas valide : vérifie les nombres (limites indiquées sous chaque champ)." },
  seuils: { tone: "danger", text: "Le seuil « écarté » doit être inférieur ou égal au seuil « qualifié »." },
  metiers: { tone: "danger", text: "Coche au moins un métier." },
  communes: { tone: "danger", text: "Coche au moins une commune." },
  cinq: { tone: "danger", text: "Le nombre de fiches doit être un multiple de 5 (5, 10, 15, 20…), pour se partager entre les 5 métiers d'une tournée." },
  echec: { tone: "danger", text: "L'enregistrement a échoué. As-tu exécuté la migration « reglages_loic » dans Supabase ?" },
  cle: { tone: "warning", text: "Il manque la clé GitHub pour lancer Loïc d'ici (voir « Lancer Loïc » ci-dessous)." },
  pause: { tone: "warning", text: "Loïc est en pause : réactive-le dans ses réglages avant de le lancer." },
  occupe: { tone: "warning", text: "Loïc travaille déjà. Attends la fin de ce lancement." },
  acces: { tone: "danger", text: "Ce compte n'a pas le droit de lancer Loïc." },
  github: { tone: "danger", text: "GitHub a refusé le lancement. Vérifie que la clé GitHub est valide et a le droit « Actions : lecture et écriture » sur le dépôt Devanture." },
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
  if (!("candidats" in o)) return null;
  const examines = num(o.candidats);
  const email = num(o.avec_email);
  return (
    <p className="text-sm text-muted">
      {formatNumber(examines)} examinés · {formatNumber(email)} avec e-mail
      {examines > 0 && ` (${Math.round((100 * email) / examines)} %)`} · {formatNumber(num(o.qualifies))} qualifiés ·{" "}
      {formatNumber(num(o.requetes_google))} fiches Google lues · {formatEurPrecise(num(o.cout_ia_eur))}
    </p>
  );
}

export default async function LoicPage({ searchParams }: {
  searchParams: Promise<{ info?: string; erreur?: string; depuis?: string }>;
}) {
  const { info, erreur, depuis } = await searchParams;
  const [{ tasks, costs, prospects }, { settings, ready }, comptes] = await Promise.all([getData("tasks", "costs", "prospects"), getLoicSettings(), getComptesProspects()]);
  const notice = notices[erreur ?? info ?? ""];
  const nom = settings.display_name;

  const runs = tasks
    .filter((t) => t.agent === "prospection")
    .sort((a, b) => (b.started_at ?? b.created_at).localeCompare(a.started_at ?? a.created_at));
  const running = runs.find((t) => t.status === "en_cours");
  // Juste après un clic sur « Lancer », on rafraîchit aussi pendant 3 minutes, le temps que GitHub démarre.
  const now = Date.now();
  const justLaunched = info === "lance" && now - Number(depuis ?? 0) < 3 * 60_000;

  // Requêtes Google (compteur partagé avec Loïc) et coût IA du mois
  const today = parisDay(new Date(now));
  const month = today.slice(0, 7);
  // Fiches lues seulement depuis le 25/10 à 19 h (avant, le compteur mesurait des recherches, sur un autre quota Google).
  const googleOf = (t: Task) => (t.started_at && t.started_at >= "2026-10-25T18:00:00" ? num(t.output?.requetes_google) : 0);
  const googleToday = sum(runs.filter((t) => t.started_at && parisDay(new Date(t.started_at)) === today).map(googleOf));
  const googleMonth = sum(runs.filter((t) => t.started_at && parisDay(new Date(t.started_at)).startsWith(month)).map(googleOf));
  const runIds = new Set(runs.map((t) => t.id));
  const costMonth = sum(costs
    .filter((c) => c.task_id && runIds.has(c.task_id) && parisDay(new Date(c.incurred_at)).startsWith(month))
    .map((c) => c.amount_eur));

  // Résultats cumulés
  const found = prospects.filter((p) => p.siret || p.google_place_id);
  const kept = found.filter((p) => p.status !== "ecarte");
  // Comptes justes calculés par la base quand elle est branchée (les listes ne contiennent que les 500 plus récents).
  const nbTrouves = comptes?.trouves ?? found.length;
  const nbRetenus = comptes?.parAgent ?? kept.length;
  const withEmail = comptes?.parAgentAvecEmail ?? kept.filter((p) => p.email).length;
  const qualified = comptes?.parStatut.qualifie ?? found.filter((p) => p.status === "qualifie").length;

  const state: { label: string; tone: Tone } = !ready && isSupabaseConfigured
    ? { label: "Réglages à créer", tone: "warning" }
    : !settings.enabled ? { label: "En pause", tone: "muted" }
    : running || justLaunched ? { label: running ? "Au travail" : "Démarrage…", tone: "progress" }
    : { label: "Prêt", tone: "success" };

  const hasToken = Boolean(process.env.GITHUB_ACTIONS_TOKEN);
  const repo = process.env.GITHUB_REPOSITORY_DEVANTURE || "Ambroiselc/Devanture";
  const communesAuto = settings.communes?.length ? settings.communes : CODES_COMMUNES;

  return (
    <>
      <AutoRefresh active={Boolean(running) || justLaunched} />
      <PageHeader
        title={nom}
        description={`Ton agent de prospection. ${nom} cherche d'abord les artisans du bâtiment dans la liste officielle RGE de l'ADEME (gratuite, e-mail souvent fourni) : la métropole lilloise, puis tout seul le reste du Nord, le Pas-de-Calais et les départements suivants quand elle est épuisée. Google complète si besoin. Il visite leur site, trouve leur e-mail et les note. Il n'envoie rien à personne : il prépare la liste des Prospects.`}
      >
        <div><Badge tone={state.tone}>{state.label}</Badge></div>
      </PageHeader>

      {notice && (
        <p role="status" className={`mb-6 rounded-xl px-4 py-3 text-sm ${toneClass[notice.tone]}`}>{notice.text}</p>
      )}
      {!ready && isSupabaseConfigured && (
        <p role="alert" className={`mb-6 rounded-xl px-4 py-3 text-sm ${toneClass.warning}`}>
          Les réglages de {nom} n&apos;existent pas encore dans la base : exécute{" "}
          <span className="font-mono">supabase/migrations/20261022010000_reglages_loic.sql</span> dans Supabase
          (SQL Editor). En attendant, il utilise ses réglages par défaut.
        </p>
      )}

      {/* Chiffres clés */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Prospects retenus", value: formatNumber(nbRetenus), hint: `${formatNumber(nbTrouves)} examinés au total` },
          { label: "Avec un e-mail", value: nbRetenus ? `${Math.round((100 * withEmail) / nbRetenus)} %` : "—", hint: `${formatNumber(withEmail)} prospects joignables` },
          { label: "Qualifiés", value: formatNumber(qualified), hint: `score ≥ ${settings.score_qualified} et e-mail` },
          { label: "Coût IA ce mois-ci", value: formatEurPrecise(costMonth), hint: "notes par Claude Haiku" },
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
          {/* Lancement */}
          <Panel title={`Lancer ${nom}`}>
            <form action={launchLoic} className="space-y-4 px-4 py-4 sm:px-5">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Métier</span>
                <select name="metier" defaultValue={settings.metiers[0] ?? "plombier"} className={field}>
                  {METIERS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Commune</span>
                <select name="commune" defaultValue={communesAuto[0] ?? "59350"} className={field}>
                  {CODES_COMMUNES.map((c) => <option key={c} value={c}>{COMMUNES[c]}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Nombre de fiches à examiner</span>
                <input name="limite" type="number" min={5} max={100} step={5} defaultValue={settings.default_limit} className={field} />
                <span className="mt-1 block text-xs text-muted">Multiple de 5. En tournée, il se partage entre les 5 métiers (20 = 4 chacun).</span>
              </label>
              <button type="submit" name="mode" value="simple" className={button} disabled={!settings.enabled || Boolean(running)}>
                {running ? `${nom} travaille…` : `Lancer sur ce métier`}
              </button>
              <button type="submit" name="mode" value="tournee" disabled={!settings.enabled || Boolean(running)}
                className="w-full rounded-lg border border-shop px-4 py-2.5 font-semibold text-shop hover:bg-shop-soft disabled:opacity-50">
                Tournée de 5 métiers
              </button>
              <button type="submit" name="mode" value="rge" disabled={!settings.enabled || Boolean(running)}
                className="w-full rounded-lg border border-shop px-4 py-2.5 font-semibold text-shop hover:bg-shop-soft disabled:opacity-50">
                Liste RGE (gratuite)
              </button>
              <p className="text-xs text-muted">
                Tournée : {nom} choisit lui-même 5 métiers à faire, en commençant par ceux jamais faits dans les plus grandes communes (le métier et la commune ci-dessus sont ignorés).
              </p>
              {!hasToken && isSupabaseConfigured && (
                <div className="space-y-1 rounded-lg bg-paper px-3 py-2 text-xs text-muted">
                  <p className="font-medium text-ink">Pour lancer {nom} d&apos;ici, il faut une clé GitHub (une seule fois) :</p>
                  <p>GitHub › Settings › Developer settings › Fine-grained tokens › Generate new token : dépôt « Devanture » uniquement, permission « Actions : Read and write ». Colle-la dans .env.local (GITHUB_ACTIONS_TOKEN=…) puis relance l&apos;application.</p>
                  <p>
                    En attendant :{" "}
                    <a className="font-medium text-shop underline" href={`https://github.com/${repo}/actions/workflows/agent-prospection.yml`} target="_blank" rel="noreferrer">
                      le lancer depuis GitHub
                    </a>.
                  </p>
                </div>
              )}
            </form>
          </Panel>

          {/* Compteurs */}
          <Panel title="Limites du moment">
            <dl className="px-4 py-3 sm:px-5">
              <Field label="Fiches Google lues aujourd'hui">
                <span className="tabular">{googleToday} / {settings.max_google_day}</span>
              </Field>
              <Field label="Fiches Google lues ce mois-ci">
                <span className="tabular">{googleMonth} / {settings.max_google_month}</span>
              </Field>
              <Field label="Lancement automatique">
                {settings.auto_enabled
                  ? `2 vagues par jour, 7 jours sur 7 (vers 8 h et 14 h) : liste RGE d'abord, Google seulement pour compléter (${settings.metiers.length} métiers × ${communesAuto.length} communes côté Google)`
                  : "désactivé"}
              </Field>
            </dl>
          </Panel>
        </div>

        {/* Historique */}
        <Panel title="Derniers lancements" className="lg:col-span-3"
          action={<Link href="/taches" className="text-sm font-medium text-shop hover:underline">Toutes les tâches</Link>}>
          {runs.length === 0 ? (
            <EmptyState>{nom} n&apos;a pas encore travaillé. Lance-le sur 20 plombiers pour commencer.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {runs.slice(0, 8).map((t) => (
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

      {/* Réglages */}
      <Panel title="Réglages" className="mt-6 scroll-mt-6">
        <form id="reglages" action={saveLoicSettings} className="grid gap-x-8 gap-y-5 px-4 py-5 sm:px-5 md:grid-cols-2">
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Nom de l&apos;agent</span>
              <input name="nom" required maxLength={40} defaultValue={nom} className={field} />
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="actif" defaultChecked={settings.enabled} className="mt-1 h-4 w-4 accent-[var(--shop)]" />
              <span><span className="font-medium">Actif</span><span className="block text-muted">Décoché = en pause : il refuse de travailler, même lancé à la main.</span></span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="auto" defaultChecked={settings.auto_enabled} className="mt-1 h-4 w-4 accent-[var(--shop)]" />
              <span><span className="font-medium">Lancement automatique</span><span className="block text-muted">2 vagues par jour, 7 jours sur 7 (vers 8 h et 14 h). Chaque vague commence par la liste officielle RGE (gratuite) : les 45 communes de la métropole, puis, une fois épuisées, le reste du Nord, le Pas-de-Calais, la Somme, l&apos;Aisne, l&apos;Oise et d&apos;autres départements, tout seul. Si elle ne fournit pas assez de nouveaux artisans, Google complète le reste avec 5 métiers cochés ci-dessous (ceux jamais faits d&apos;abord, grandes communes d&apos;abord ; un métier épuisé dans une commune est mis de côté 30 jours).</span></span>
            </label>
            <fieldset className="text-sm">
              <legend className="mb-1 font-medium">Métiers cherchés sur Google ({settings.metiers.length})</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {METIERS.map((m) => (
                  <label key={m.id} className="flex items-center gap-2">
                    <input type="checkbox" name="metiers" value={m.id} defaultChecked={settings.metiers.includes(m.id)} className="h-4 w-4 accent-[var(--shop)]" />
                    {m.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="text-sm">
              <legend className="mb-1 font-medium">Communes cherchées sur Google ({communesAuto.length})</legend>
              <div className="grid max-h-56 grid-cols-1 gap-x-4 gap-y-1.5 overflow-y-auto rounded-lg border border-line bg-paper px-3 py-2 sm:grid-cols-2">
                {CODES_COMMUNES.map((c) => (
                  <label key={c} className="flex items-center gap-2">
                    <input type="checkbox" name="communes" value={c} defaultChecked={communesAuto.includes(c)} className="h-4 w-4 accent-[var(--shop)]" />
                    {COMMUNES[c]}
                  </label>
                ))}
              </div>
              <span className="mt-1 block text-xs text-muted">Les 10 communes les plus peuplées de la métropole lilloise, de la plus peuplée à la moins peuplée.</span>
            </fieldset>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Consignes pour {nom}</span>
              <textarea name="consignes" rows={4} maxLength={1500} defaultValue={settings.instructions ?? ""} className={field}
                placeholder="Ex. : sois plus sévère avec les artisans qui ont moins de 5 avis Google." />
              <span className="mt-1 block text-xs text-muted">Ajoutées aux consignes de base données à Claude pour noter chaque artisan.</span>
            </label>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Fiches par lancement</span>
                <input name="limite" type="number" min={5} max={100} step={5} required defaultValue={settings.default_limit} className={field} />
                <span className="mt-1 block text-xs text-muted">Multiple de 5, de 5 à 100. En automatique : la liste RGE d&apos;abord, Google pour le reste.</span>
              </label>
              <span />
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Fiches Google / jour</span>
                <input name="google_jour" type="number" min={0} max={200} required defaultValue={settings.max_google_day} className={field} />
                <span className="mt-1 block text-xs text-muted">200 au maximum. Ne concerne que Google (la liste RGE n&apos;a pas de limite).</span>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Fiches Google / mois</span>
                <input name="google_mois" type="number" min={0} max={900} required defaultValue={settings.max_google_month} className={field} />
                <span className="mt-1 block text-xs text-muted">900 au maximum (1 000 gratuites par mois chez Google ; les recherches, elles, sont gratuites et illimitées)</span>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Score « qualifié »</span>
                <input name="score_qualifie" type="number" min={0} max={100} required defaultValue={settings.score_qualified} className={field} />
                <span className="mt-1 block text-xs text-muted">Au-dessus, avec un e-mail</span>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Score « écarté »</span>
                <input name="score_ecarte" type="number" min={0} max={100} required defaultValue={settings.score_discarded} className={field} />
                <span className="mt-1 block text-xs text-muted">En dessous, mis de côté</span>
              </label>
            </div>
            <p className="text-xs text-muted">
              Le budget IA du mois (page Vue d&apos;ensemble) s&apos;applique aussi : {nom} s&apos;arrête dès qu&apos;il est atteint.
              {settings.updated_at && <> Dernière modification : {formatDate(settings.updated_at)}.</>}
            </p>
            <button type="submit" className={button}>Enregistrer les réglages</button>
          </div>
        </form>
      </Panel>
    </>
  );
}
