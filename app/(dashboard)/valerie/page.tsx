// Page « Valérie » : l'agente qui rédige les e-mails de prospection, et la relecture de ses brouillons.
// « Validé » = prêt à partir : l'agent d'envoi l'envoie depuis une boîte de prospection (ou Resend en attendant).
import { LigneOuverture } from "@/components/ligne-ouverture";
import { visitesDe, detailsOuvertures, type Ouverte } from "@/lib/visites-maquettes";
import type { Metadata } from "next";
import Link from "@/components/lien";
import { launchValerie, reviewEmail, saveValerieSettings, unvalidateEmail, validateAllExcept } from "../../valerie-actions";
import { VARIANTES } from "@/agents/lib/variantes-email";
import { PALIERS_BOITE, quotaResend, RESEND_MAX, rythmeBoite, rythmeDuJour, type Rythme } from "@/agents/lib/rythme-envoi";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, DemoTag, EmptyState, PageHeader, Panel } from "@/components/ui";
import { getData, getValerieSettings } from "@/lib/data";
import {
  formatDate, formatDuration, formatEurPrecise, formatNumber, sum, taskStatus, type Tone,
} from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { Email, Prospect, Task } from "@/lib/types";

export const metadata: Metadata = { title: "Valérie" };

const notices: Record<string, { tone: "success" | "danger" | "warning"; text: string }> = {
  enregistre: { tone: "success", text: "Réglages enregistrés : Valérie les appliquera dès son prochain lancement." },
  lance: { tone: "success", text: "C'est parti : GitHub démarre Valérie (compter environ une minute). La page se met à jour toute seule." },
  valide: { tone: "success", text: "E-mail validé. Il partira avec la prochaine vague d'envoi." },
  corrige: { tone: "success", text: "Corrections enregistrées." },
  rejete: { tone: "success", text: "Brouillon supprimé. Au prochain lancement, Valérie rédigera un nouvel e-mail pour ce prospect." },
  demo: { tone: "warning", text: "Mode démo : rien n'est enregistré ni lancé. Branche Supabase pour piloter la vraie Valérie." },
  migration: { tone: "warning", text: "Les réglages de Valérie n'existent pas encore : exécute la migration 20261023010000_valerie.sql dans Supabase." },
  pause: { tone: "warning", text: "Valérie est en pause : réactive-la dans ses réglages avant de la lancer." },
  occupe: { tone: "warning", text: "Valérie travaille déjà. Attends la fin de ce lancement." },
  cle: { tone: "warning", text: "Il manque la clé GitHub pour lancer Valérie d'ici (la même que pour Loïc : GITHUB_ACTIONS_TOKEN dans .env.local)." },
  invalide: { tone: "danger", text: "Une valeur n'est pas valide (nombre d'e-mails entre 1 et 30, signature obligatoire)." },
  vide: { tone: "danger", text: "L'objet ou le texte de l'e-mail est vide ou trop court." },
  lien: { tone: "danger", text: "Le texte doit contenir {{lien_demo}} : c'est là que le lien vers la maquette sera mis à l'envoi." },
  oppose: { tone: "danger", text: "Ce prospect est sur la liste d'opposition : la base refuse de valider l'e-mail. Rejette-le." },
  echec: { tone: "danger", text: "L'enregistrement a échoué. As-tu exécuté la migration « valerie » dans Supabase ?" },
  acces: { tone: "danger", text: "Ce compte n'a pas le droit de lancer Valérie." },
  github: { tone: "danger", text: "GitHub a refusé le lancement. Vérifie la clé GitHub et que le fichier agent-emails.yml est bien sur GitHub." },
};

const toneClass = {
  success: "bg-[var(--t-success-bg)] text-[var(--t-success-fg)]",
  danger: "bg-[var(--t-danger-bg)] text-[var(--t-danger-fg)]",
  warning: "bg-[var(--t-warning-bg)] text-[var(--t-warning-fg)]",
};

const field = "w-full rounded-lg border border-line bg-paper px-3 py-2";
const button = "w-full rounded-lg bg-shop px-4 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:text-[var(--paper)]";

const parisDay = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(d);
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);

function Bilan({ t }: { t: Task }) {
  const o = t.output ?? {};
  if ("envoyes" in o) {
    return (
      <p className="text-sm text-muted">
        {formatNumber(num(o.envoyes))} envoyé(s) · quota du jour {num(o.quota)}
        {num(o.rebonds) > 0 && ` · ${num(o.rebonds)} rebond(s)`}
        {num(o.plaintes) > 0 && ` · ${num(o.plaintes)} signalement(s) de spam`}
        {num(o.adresses_invalides) > 0 && ` · ${num(o.adresses_invalides)} adresse(s) invalide(s)`}
      </p>
    );
  }
  if (!("emails" in o)) return null;
  return (
    <p className="text-sm text-muted">
      {formatNumber(num(o.emails))} e-mail(s) rédigé(s) (A : {num(o.version_a)}, B : {num(o.version_b)})
      {num(o.opposes) > 0 && ` · ${num(o.opposes)} sur liste d'opposition`}
      {num(o.erreurs) > 0 && ` · ${num(o.erreurs)} erreur(s)`} · {formatEurPrecise(num(o.cout_ia_eur))}
    </p>
  );
}

/** Carte de relecture d'un e-mail « à valider » : on peut corriger l'objet et le texte avant de valider. */
function Brouillon({ e, p, capture, slug }: { e: Email; p: Prospect | undefined; capture: boolean; slug: string | null }) {
  return (
    <li id={`email-${e.id}`} className="scroll-mt-6 px-4 py-4 sm:px-5">
      <form action={reviewEmail} className="space-y-3">
        <input type="hidden" name="id" value={e.id} />
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold">{p?.name ?? "Prospect supprimé"}<DemoTag show={e.is_demo} /></p>
            <p className="break-all text-sm text-muted">
              À : {p?.email ?? "—"} · {[p?.category, p?.city].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {e.relance_de && <Badge tone="warning">Relance</Badge>}
            {e.variant && <Badge tone="neutral">Version {e.variant}</Badge>}
            {e.with_image != null && <Badge tone={e.with_image ? "info" : "muted"}>{e.with_image ? "Avec image" : "Sans image"}</Badge>}
            {e.website_id && (
              <a href={`/demo/${e.website_id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-shop hover:underline">
                Voir la maquette
              </a>
            )}
            {slug && (
              <a href={`/m/${slug}?apercu=1`} target="_blank" rel="noopener noreferrer" title="Le lien envoyé à l'artisan, visible sans connexion" className="text-sm font-medium text-shop hover:underline">
                Lien public
              </a>
            )}
          </div>
        </div>
        {e.coco_verdict === "garde" && e.coco_avis && (
          <p className="rounded-lg bg-[var(--t-warning-bg)] px-3 py-2 text-sm text-[var(--t-warning-fg)]">
            <span className="font-semibold">Coco l&apos;a gardé pour toi :</span> {e.coco_avis}
          </p>
        )}
        {e.with_image && (
          capture && e.website_id ? (
            <figure className="m-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/demo/${e.website_id}/capture`} alt={`Capture de la maquette de ${p?.name ?? "ce prospect"}`}
                width={375} height={400} loading="lazy"
                className="h-auto w-[375px] max-w-full rounded-lg border border-line" />
              <figcaption className="mt-1 text-xs text-muted">Image placée dans l&apos;e-mail (les deux styles), au-dessus du lien vers la maquette.</figcaption>
            </figure>
          ) : (
            <p className="rounded-lg bg-[var(--t-warning-bg)] px-3 py-2 text-xs text-[var(--t-warning-fg)]">
              Cet e-mail doit partir avec l&apos;image de la maquette, mais Sid n&apos;en a pas encore fait la capture.
            </p>
          )
        )}
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Objet</span>
          <input id={`subject-${e.id}`} name="subject" defaultValue={e.subject} maxLength={150} className={field} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Texte</span>
          <textarea id={`body-${e.id}`} name="body" defaultValue={e.body} rows={16} className={`${field} font-[inherit] leading-relaxed`} />
          <span className="mt-1 block text-xs text-muted">
            <span className="font-mono">{"{{lien_demo}}"}</span> sera remplacé par le lien de la maquette au moment de l&apos;envoi : ne l&apos;efface pas.
          </span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" name="action" value="valider"
            className="rounded-lg bg-shop px-4 py-2 font-semibold text-white hover:opacity-90 dark:text-[var(--paper)]">
            Valider
          </button>
          <button type="submit" name="action" value="enregistrer"
            className="rounded-lg border border-shop px-4 py-2 font-semibold text-shop hover:bg-shop-soft">
            Enregistrer mes corrections
          </button>
          <button type="submit" name="action" value="rejeter"
            className="rounded-lg px-4 py-2 font-medium text-[var(--t-danger-fg)] hover:bg-[var(--t-danger-bg)]">
            Rejeter
          </button>
        </div>
      </form>
    </li>
  );
}

export default async function ValeriePage({ searchParams }: {
  searchParams: Promise<{ info?: string; erreur?: string; depuis?: string; valides?: string; refuses?: string; gardes?: string }>;
}) {
  const { info, erreur, depuis, valides, refuses, gardes } = await searchParams;
  const [{ tasks, costs, prospects, websites, emails }, { settings, ready }] = await Promise.all([getData("tasks", "costs", "prospects", "websites", "emails"), getValerieSettings()]);
  const notice = info === "groupe" && !erreur
    ? { tone: "success" as const, text: `${valides ?? 0} e-mail(s) validé(s)${Number(gardes) ? `, ${gardes} gardé(s) en relecture` : ""}.${Number(refuses) ? ` ${refuses} refusé(s) par la base (liste d'opposition) : rejette-les.` : ""}` }
    : notices[erreur ?? info ?? ""];
  const nom = settings.display_name;

  const runs = tasks
    .filter((t) => t.agent === "email")
    .sort((a, b) => (b.started_at ?? b.created_at).localeCompare(a.started_at ?? a.created_at));
  const running = runs.find((t) => t.status === "en_cours");
  const now = Date.now();
  const justLaunched = info === "lance" && now - Number(depuis ?? 0) < 3 * 60_000;

  const prospectById = new Map(prospects.map((p) => [p.id, p]));
  const slugDe = new Map(websites.map((w) => [w.id, w.slug]));
  const toReview = emails.filter((e) => e.status === "a_valider").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const validated = emails.filter((e) => e.status === "valide").sort((a, b) => b.created_at.localeCompare(a.created_at));
  const contacted = new Set(emails.filter((e) => e.status !== "erreur").map((e) => e.prospect_id));
  const withDemo = new Set(websites.filter((w) => w.kind === "demo" && (w.status === "pret" || w.status === "publie")).map((w) => w.prospect_id));
  const waiting = prospects.filter((p) => p.status === "demo_prete" && p.email && withDemo.has(p.id) && !contacted.has(p.id));
  const parVersion = (v: "A" | "B" | "C") => emails.filter((e) => e.variant === v).length;
  const parVersionImage = (v: "A" | "B" | "C", image: boolean) => emails.filter((e) => e.variant === v && e.with_image === image).length;

  // Envoi : rythme du jour et santé des 7 derniers jours, canal par canal (mêmes règles que l'agent d'envoi) :
  // chaque boîte de prospection a sa montée ; Resend s'arrête quand les boîtes ont pris le relais.
  const canaux: { cle: string; rythme: Rythme; aujourdhui: number; envoyes7j: number; rebonds7j: number; plaintes7j: number }[] = [];
  if (isSupabaseConfigured && ready) {
    const supabase = await createClient();
    const { data: recentsDb } = await supabase.from("emails").select("sender, delivery_status, sent_at")
      .gte("sent_at", new Date(now - 7 * 86_400_000).toISOString()).limit(5000);
    const recents = (recentsDb ?? []) as { sender: string | null; delivery_status: string | null; sent_at: string }[];
    const cles = [...new Set(recents.map((e) => e.sender ?? "resend"))].sort((a, b) => (a === "resend" ? 1 : b === "resend" ? -1 : a.localeCompare(b)));
    for (const cle of cles) {
      const requete = supabase.from("emails").select("sent_at").not("sent_at", "is", null).order("sent_at").limit(1);
      const { data: p } = await (cle === "resend" ? requete.or("sender.is.null,sender.eq.resend") : requete.eq("sender", cle));
      const premierCanal = p?.[0]?.sent_at ? new Date(p[0].sent_at as string) : null;
      const siens = recents.filter((e) => (e.sender ?? "resend") === cle);
      const sante = {
        envoyes7j: siens.length,
        rebonds7j: siens.filter((e) => e.delivery_status === "bounced").length,
        plaintes7j: siens.filter((e) => e.delivery_status === "complained").length,
      };
      const rythme = cle === "resend"
        ? rythmeDuJour(premierCanal, new Date(now), sante, settings.send_max_per_day ?? 50)
        : rythmeBoite(premierCanal, new Date(now), sante);
      canaux.push({ cle, rythme, aujourdhui: siens.filter((e) => parisDay(new Date(e.sent_at)) === parisDay(new Date(now))).length, ...sante });
    }
    const resend = canaux.find((c) => c.cle === "resend");
    const boites = canaux.filter((c) => c.cle !== "resend");
    if (resend && boites.length) {
      const quota = quotaResend(resend.rythme, boites.length);
      resend.rythme = { ...resend.rythme, quota, palier: Math.min(resend.rythme.palier, quota) };
    }
  }
  const quotaTotal = Math.min(settings.send_max_per_day ?? 50, canaux.reduce((t, c) => t + c.rythme.quota, 0));
  const aujourdhui = canaux.reduce((t, c) => t + c.aujourdhui, 0);
  const total7j = { envoyes: canaux.reduce((t, c) => t + c.envoyes7j, 0), rebonds: canaux.reduce((t, c) => t + c.rebonds7j, 0), plaintes: canaux.reduce((t, c) => t + c.plaintes7j, 0) };
  const ralentis = canaux.filter((c) => c.rythme.ralenti);

  // Maquettes ouvertes par les artisans (30/10) : compteur de visites des liens /m/<slug>.
  let ouvertes: Ouverte[] = [];
  let nbOuvertes: number | null = null;
  if (isSupabaseConfigured && ready) {
    const supabase = await createClient();
    const { data, count, error } = await supabase.from("websites")
      .select("id, slug, vues, premiere_vue, derniere_vue, prospects!inner(id, name, city, email, status)", { count: "exact" })
      .eq("kind", "demo").gt("vues", 0).order("derniere_vue", { ascending: false }).limit(12);
    if (!error) {
      nbOuvertes = count ?? 0;
      // 5/11 : durée de chaque ouverture, pour les 12 maquettes affichées seulement.
      const visitesParSite = await visitesDe(supabase, (data ?? []).map((w) => w.id as string));
      const pros = (w: { prospects: unknown }) => (Array.isArray(w.prospects) ? w.prospects[0] : w.prospects) as
        { id: string; name: string; city: string | null; email: string | null } | null;
      // 9/11 : fournisseur de la boîte et premier e-mail, pour les liens de chaque ligne.
      const details = await detailsOuvertures(supabase, (data ?? []).map(pros).filter((p) => p !== null).map((p) => ({ id: p.id, email: p.email })));
      ouvertes = (data ?? []).map((w) => {
        const p = pros(w);
        const d = p ? details.get(p.id) : undefined;
        return { name: p?.name ?? "?", city: p?.city ?? null, vues: w.vues as number, premiere: (w.premiere_vue as string | null) ?? null, derniere: w.derniere_vue as string,
                 visites: visitesParSite.get(w.id as string) ?? [], slug: (w.slug as string | null) ?? null,
                 fournisseur: d?.fournisseur ?? null, emailId: d?.emailId ?? null, envois: d?.envois ?? [] };
      });
    }
  }
  // 6/11 : compté par la base (un premier e-mail envoyé = un artisan contacté). Avant, le compte se faisait sur les 500
  // e-mails les plus récents chargés par la page : avec ~490 e-mails validés en attente, il n'en restait que 65.
  let contactes = new Set(emails.filter((e) => e.sent_at && !e.relance_de).map((e) => e.prospect_id)).size;
  if (isSupabaseConfigured && ready) {
    const supabase = await createClient();
    const { count, error } = await supabase.from("emails").select("id", { count: "exact", head: true })
      .not("sent_at", "is", null).is("relance_de", null).eq("is_demo", false);
    if (!error && count !== null) contactes = count;
  }

  // Maquettes qui ont déjà leur capture (faite par Sid).
  let captures = new Set<string>();
  if (isSupabaseConfigured && ready) {
    const supabase = await createClient();
    const { data } = await supabase.from("website_captures").select("website_id");
    captures = new Set((data ?? []).map((c: { website_id: string }) => c.website_id));
  }

  const month = parisDay(new Date(now)).slice(0, 7);
  const runIds = new Set(runs.map((t) => t.id));
  const costMonth = sum(costs
    .filter((c) => c.task_id && runIds.has(c.task_id) && parisDay(new Date(c.incurred_at)).startsWith(month))
    .map((c) => c.amount_eur));

  const state: { label: string; tone: Tone } = !ready && isSupabaseConfigured
    ? { label: "Migration à lancer", tone: "warning" }
    : !settings.enabled ? { label: "En pause", tone: "muted" }
    : running || justLaunched ? { label: running ? "Au travail" : "Démarrage…", tone: "progress" }
    : { label: "Prête", tone: "success" };

  const hasToken = Boolean(process.env.GITHUB_ACTIONS_TOKEN);
  const repo = process.env.GITHUB_REPOSITORY_DEVANTURE || "Ambroiselc/Devanture";

  return (
    <>
      <AutoRefresh active={Boolean(running) || justLaunched} />
      <PageHeader
        title={nom}
        description={`Ton agente des e-mails. Pour chaque artisan qui a sa maquette (Sid), ${nom} rédige le premier e-mail avec Claude Haiku, en version A ou B pour tester 2 approches. La signature et les mentions obligatoires sont ajoutées automatiquement. Rien ne part sans toi : tu relis, corriges et valides chaque e-mail ici.`}
      >
        <div><Badge tone={state.tone}>{state.label}</Badge></div>
      </PageHeader>

      {notice && (
        <p role="status" className={`mb-6 rounded-xl px-4 py-3 text-sm ${toneClass[notice.tone]}`}>{notice.text}</p>
      )}
      {!ready && isSupabaseConfigured && !notice && (
        <p role="alert" className={`mb-6 rounded-xl px-4 py-3 text-sm ${toneClass.warning}`}>
          Les réglages de {nom} n&apos;existent pas encore dans la base : exécute{" "}
          <span className="font-mono">supabase/migrations/20261023010000_valerie.sql</span> dans Supabase (SQL Editor).
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "À valider", value: formatNumber(toReview.length), hint: "e-mails à relire ci-dessous" },
          { label: "Validés", value: formatNumber(validated.length), hint: "partent au rythme des paliers" },
          { label: "Prospects en attente", value: formatNumber(waiting.length), hint: "maquette prête, jamais contactés" },
          { label: "Coût IA ce mois-ci", value: formatEurPrecise(costMonth), hint: "≈ 0,0003 € par e-mail" },
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
          <Panel title={`Lancer ${nom}`}>
            <form action={launchValerie} className="space-y-4 px-4 py-4 sm:px-5">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Nombre d&apos;e-mails à rédiger</span>
                <input name="limite" type="number" min={1} max={30}
                  defaultValue={Math.min(30, Math.max(1, Math.min(waiting.length || settings.default_limit, settings.default_limit)))} className={field} />
                <span className="mt-1 block text-xs text-muted">30 au maximum. Les meilleurs scores passent en premier.</span>
              </label>
              <button type="submit" className={button} disabled={!settings.enabled || Boolean(running) || waiting.length === 0}>
                {running ? `${nom} travaille…` : waiting.length === 0 ? "Aucun prospect en attente" : `Lancer ${nom}`}
              </button>
              <p className="text-xs text-muted">Automatique : après chaque vague de Loïc, juste après Sid (si elle est active). Le bouton sert à la relancer à la main.</p>
              {!hasToken && isSupabaseConfigured && (
                <p className="rounded-lg bg-paper px-3 py-2 text-xs text-muted">
                  Sans la clé GitHub (la même que pour Loïc) :{" "}
                  <a className="font-medium text-shop underline" href={`https://github.com/${repo}/actions/workflows/agent-emails.yml`} target="_blank" rel="noreferrer">
                    la lancer depuis GitHub
                  </a>.
                </p>
              )}
            </form>
          </Panel>

          <Panel title="Envoi">
            <dl className="divide-y divide-line px-4 py-1 text-sm sm:px-5">
              <div className="flex justify-between gap-3 py-2"><dt className="text-muted">État</dt>
                <dd><Badge tone={settings.send_enabled ? "success" : "muted"}>{settings.send_enabled ? "Activé" : "Coupé"}</Badge></dd></div>
              <div className="flex justify-between gap-3 py-2"><dt className="text-muted">Aujourd&apos;hui</dt>
                <dd className="tabular">{aujourdhui} / {quotaTotal} e-mails</dd></div>
              <div className="flex justify-between gap-3 py-2"><dt className="text-muted">7 derniers jours</dt>
                <dd className="tabular text-right">{total7j.envoyes} envoyés · {total7j.rebonds} rebond(s) · {total7j.plaintes} spam</dd></div>
              <div className="flex justify-between gap-3 py-2"><dt className="text-muted">Santé</dt>
                <dd><Badge tone={ralentis.length ? "warning" : "success"}>{ralentis.length ? `Ralenti : ${ralentis.map((c) => c.cle === "resend" ? "Resend" : c.cle).join(", ")}` : "Bonne"}</Badge></dd></div>
            </dl>
            {canaux.length > 0 && (
              <table className="w-full border-t border-line text-sm">
                <thead><tr className="text-left text-xs text-muted">
                  <th className="px-4 py-2 font-medium sm:px-5">Canal</th><th className="px-2 py-2 text-right font-medium">Aujourd&apos;hui</th><th className="px-4 py-2 text-right font-medium sm:px-5">Palier</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {canaux.map((c) => (
                    <tr key={c.cle}>
                      <td className="max-w-0 truncate px-4 py-2 sm:px-5" title={c.cle}>{c.cle === "resend" ? "Resend (en attendant)" : c.cle}</td>
                      <td className="tabular px-2 py-2 text-right">{c.aujourdhui} / {c.rythme.quota}</td>
                      <td className="tabular px-4 py-2 text-right sm:px-5">{c.rythme.quota === 0 && c.cle === "resend" ? "arrêté" : `${c.rythme.palier}/j`}{c.rythme.ralenti ? " ⚠️" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="border-t border-line px-4 py-3 text-xs text-muted sm:px-5">
              4 vagues par jour ouvré (vers 9 h, 11 h, 14 h et 16 h). Chaque boîte de prospection monte de {PALIERS_BOITE.join(" → ")} e-mails par jour,
              un palier chaque lundi et chaque jeudi si tout va bien ; divisé par deux au premier signalement de spam ou au-delà de 3 % de rebonds.
              Resend ne sert plus à la prospection dès qu&apos;une boîte existe (seulement aux réponses d&apos;Inès) ; sans boîte, il envoie au plus {RESEND_MAX} par jour.
              Une boîte apparaît ici après son premier envoi.
            </p>
          </Panel>

          {nbOuvertes !== null && (
            <Panel title="Maquettes ouvertes">
              <p className="px-4 pt-3 text-sm sm:px-5">
                <span className="tabular font-semibold">{formatNumber(nbOuvertes)}</span> maquette(s) ouverte(s)
                {contactes > 0 && <> pour <span className="tabular font-semibold">{formatNumber(contactes)}</span> artisans contactés</>}
                {contactes > 0 && nbOuvertes > 0 && <span className="text-muted"> ({Math.round((nbOuvertes / contactes) * 100)} %)</span>}.
              </p>
              {ouvertes.length > 0 ? (
                <ul className="divide-y divide-line text-sm">
                  {ouvertes.map((o, i) => (
                    <LigneOuverture key={i} o={o} />
                  ))}
                </ul>
              ) : (
                <p className="px-4 pb-3 pt-1 text-sm text-muted sm:px-5">Aucune pour l&apos;instant.</p>
              )}
              <p className="border-t border-line px-4 py-3 text-xs text-muted sm:px-5">
                Comptée quand l&apos;artisan reste au moins 1,5 seconde sur sa maquette (les robots des messageries ne comptent pas) ; depuis le 5/11, la durée de chaque ouverture est mesurée (temps passé onglet visible).
                Sans cookie ni suivi des personnes. Comptage depuis le 30/10 : les ouvertures d&apos;avant ne sont pas connues.
                Une relance part 6 jours après le premier e-mail, à valider ici comme les autres.
              </p>
            </Panel>
          )}

          <Panel title="Tests en cours">
            <dl className="divide-y divide-line px-4 py-1 sm:px-5">
              {(["A", "C", "B"] as const).map((v) => (
                <div key={v} className="py-3">
                  <dt className="flex items-center justify-between gap-3">
                    <span className="font-medium">Version {v} : {VARIANTES[v].nom}{v === "B" && " (arrêtée le 13/11)"}</span>
                    <span className="tabular whitespace-nowrap text-sm text-muted">{formatNumber(parVersion(v))} e-mail(s)</span>
                  </dt>
                  <dd className="mt-1 text-sm text-muted">{VARIANTES[v].consigne.replace(/^Approche [ABC], « [^»]+ » : /, "")}</dd>
                  <dd className="tabular mt-1 text-xs text-muted">
                    Avec image : {formatNumber(parVersionImage(v, true))} · sans image : {formatNumber(parVersionImage(v, false))}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="border-t border-line px-4 py-3 text-xs text-muted sm:px-5">
              Valérie alterne les versions, et dans chaque version, un e-mail sur deux part avec l&apos;image de la maquette.
              Les taux de réponse se compareront une fois l&apos;envoi branché.
            </p>
          </Panel>
        </div>

        <div className="space-y-6 lg:col-span-3">
          {toReview.length > 1 && (
            <Panel title="Validation groupée">
              <form action={validateAllExcept} className="space-y-3 px-4 py-4 sm:px-5">
                <p className="text-sm text-muted">
                  Coche ceux que tu veux encore relire ou corriger : tous les autres seront validés d&apos;un coup.
                </p>
                <ul className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-line bg-paper px-3 py-2 text-sm">
                  {toReview.map((e) => {
                    const p = prospectById.get(e.prospect_id);
                    return (
                      <li key={e.id}>
                        <label className="flex items-start gap-2">
                          <input id={`garder-${e.id}`} type="checkbox" name="garder" value={e.id} className="mt-1 h-4 w-4 accent-[var(--shop)]" />
                          <span className="min-w-0">
                            <span className="font-medium">{p?.name ?? "Prospect supprimé"}</span>
                            <span className="block truncate text-muted">{e.subject}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <button type="submit" className={button}>Valider tous les autres</button>
              </form>
            </Panel>
          )}

          <Panel title={`À valider (${toReview.length})`}>
            {toReview.length === 0 ? (
              <EmptyState>Aucun e-mail à relire. Lance {nom} quand Sid a préparé des maquettes.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {/* 3/11 (erreur 1102) : 25 éditeurs au plus par affichage ; les suivants apparaissent quand ceux-ci sont traités. */}
                {toReview.slice(0, 25).map((e) => (
                  <Brouillon key={e.id} e={e} p={prospectById.get(e.prospect_id)}
                    capture={Boolean(e.website_id && captures.has(e.website_id))}
                    slug={slugDe.get(e.website_id ?? "") ?? null} />
                ))}
                {toReview.length > 25 && (
                  <li className="px-4 py-3 text-sm text-muted sm:px-5">
                    Et {toReview.length - 25} autre(s) : ils s&apos;afficheront ici quand ceux-ci seront traités.
                  </li>
                )}
              </ul>
            )}
          </Panel>

          {validated.length > 0 && (
            <Panel title={`Validés (${validated.length})`}>
              <ul className="divide-y divide-line">
                {validated.slice(0, 20).map((e) => {
                  const p = prospectById.get(e.prospect_id);
                  return (
                    <li key={e.id} id={`email-${e.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                      <div className="min-w-0">
                        <p className="font-medium">{p?.name ?? "Prospect supprimé"}<DemoTag show={e.is_demo} /></p>
                        <p className="truncate text-sm text-muted">{e.subject}</p>
                      </div>
                      <form action={unvalidateEmail} className="flex items-center gap-3">
                        <input type="hidden" name="id" value={e.id} />
                        {e.variant && <Badge tone="neutral">{e.variant}</Badge>}
                        <button className="text-sm font-medium text-shop hover:underline">Relire</button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}

          <Panel title="Derniers lancements"
            action={<Link href="/taches" className="text-sm font-medium text-shop hover:underline">Toutes les tâches</Link>}>
            {runs.length === 0 ? (
              <EmptyState>{nom} n&apos;a pas encore travaillé.</EmptyState>
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

      <Panel title="Réglages" className="mt-6 scroll-mt-6">
        <form id="reglages" action={saveValerieSettings} className="grid gap-x-8 gap-y-5 px-4 py-5 sm:px-5 md:grid-cols-2">
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Nom de l&apos;agente</span>
              <input id="valerie-nom" name="nom" required maxLength={40} defaultValue={nom} className={field} />
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input id="valerie-actif" type="checkbox" name="actif" defaultChecked={settings.enabled} className="mt-1 h-4 w-4 accent-[var(--shop)]" />
              <span><span className="font-medium">Active</span><span className="block text-muted">Décoché = en pause : elle refuse de travailler, même lancée à la main.</span></span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">E-mails par lancement</span>
              <input id="valerie-limite" name="limite" type="number" min={1} max={30} required defaultValue={settings.default_limit} className={field} />
              <span className="mt-1 block text-xs text-muted">De 1 à 30. Rythme prévu : 10 envois par jour ouvré jusqu&apos;à la première signature.</span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input id="valerie-envoi" type="checkbox" name="envoi" defaultChecked={settings.send_enabled ?? false} className="mt-1 h-4 w-4 accent-[var(--shop)]" />
              <span><span className="font-medium">Envoyer les e-mails validés</span><span className="block text-muted">Décoché = rien ne part, même validé. Coché = les e-mails validés partent, au rythme des paliers.</span></span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Maximum d&apos;e-mails par jour</span>
              <input id="valerie-max-jour" name="max_jour" type="number" min={1} max={300} required defaultValue={settings.send_max_per_day ?? 50} className={field} />
              <span className="mt-1 block text-xs text-muted">Plafond pour tous les canaux ensemble, au-dessus des paliers (300 au plus). 100 = 4 boîtes au maximum de leur montée.</span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Consignes pour {nom}</span>
              <textarea id="valerie-consignes" name="consignes" rows={4} maxLength={1500} defaultValue={settings.instructions ?? ""} className={field}
                placeholder="Ex. : propose un appel de 10 minutes plutôt qu'une réponse par e-mail." />
              <span className="mt-1 block text-xs text-muted">Ajoutées aux consignes de base données à Claude pour rédiger chaque e-mail.</span>
            </label>
          </div>
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Signature</span>
              <textarea id="valerie-signature" name="signature" rows={5} required maxLength={500} defaultValue={settings.signature ?? ""} className={field} />
              <span className="mt-1 block text-xs text-muted">
                Placée après « Bien cordialement, ». Avant le premier envoi, elle doit dire qui écrit : prénom et nom,
                Devanture, adresse et site (obligation d&apos;information du registre RGPD).
              </span>
            </label>
            <div className="rounded-lg bg-paper px-3 py-2 text-xs text-muted">
              <p className="font-medium text-ink">Ajouté automatiquement sous la signature :</p>
              <p className="mt-1">« Pourquoi ce message : votre adresse … est publiée sur votre site …. Devanture n&apos;écrit qu&apos;aux professionnels, au sujet de leur activité. Pour ne plus recevoir de message de Devanture, répondez simplement « STOP ». Vos données et vos droits : devanture-artisans.fr/donnees-personnelles »</p>
            </div>
            <button type="submit" className={button}>Enregistrer les réglages</button>
          </div>
        </form>
      </Panel>
    </>
  );
}
