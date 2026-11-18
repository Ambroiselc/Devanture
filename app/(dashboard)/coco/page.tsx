// Page « Coco » (30/10) : l'agente superviseuse. Pilote automatique de la relecture des e-mails de Valérie,
// e-mails gardés pour Broise, ses dernières décisions, et son bilan quotidien avec les alertes.
// Requêtes légères (Workers gratuit : jamais toute la base).
import type { Metadata } from "next";
import Link from "@/components/lien";
import { deciderEmailGarde, lancerCoco, saveCocoSettings } from "@/app/coco-actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatDate, formatNumber, type Tone } from "@/lib/format";
import { METIERS } from "@/agents/lib/metiers";

export const metadata: Metadata = { title: "Coco" };

const notices: Record<string, { tone: "success" | "danger" | "warning"; text: string }> = {
  enregistre: { tone: "success", text: "Réglages de Coco enregistrés." },
  valide: { tone: "success", text: "E-mail validé : il partira dans le quota, comme les autres." },
  rejete: { tone: "success", text: "E-mail rejeté. Valérie pourra en rédiger un autre pour cet artisan." },
  reecrire: { tone: "success", text: "Renvoyé à Valérie : elle réécrira l'e-mail en tenant compte de la remarque de Coco (au prochain passage de Loïc, le matin ou en début d'après-midi)." },
  refaire: { tone: "success", text: "Renvoyé à Sid : il refait la maquette au prochain passage de Loïc, puis Valérie écrit un nouvel e-mail et Coco le relit." },
  ecarter: { tone: "success", text: "Artisan écarté : il ne recevra aucun e-mail." },
  lance: { tone: "success", text: "C'est parti : Coco relit tous les e-mails en attente puis refait son bilan (quelques minutes). La page se met à jour toute seule." },
  oppose: { tone: "danger", text: "Cette adresse est sur la liste d'opposition : l'e-mail ne peut pas être validé. Rejette-le." },
  cle: { tone: "warning", text: "Il manque la clé GitHub du tableau de bord (GITHUB_ACTIONS_TOKEN dans Cloudflare)." },
  occupe: { tone: "warning", text: "Coco travaille déjà. Attends la fin de ce passage." },
  acces: { tone: "danger", text: "Ce compte n'a pas le droit de lancer Coco." },
  github: { tone: "danger", text: "GitHub a refusé le lancement. Réessaie ; si ça continue, envoie-moi une capture." },
  echec: { tone: "danger", text: "La base a refusé la modification. Réessaie dans un instant." },
  invalide: { tone: "danger", text: "Demande invalide." },
  demo: { tone: "warning", text: "Mode démo : rien n'est enregistré." },
};
const toneClass = {
  success: "bg-[var(--t-success-bg)] text-[var(--t-success-fg)]",
  danger: "bg-[var(--t-danger-bg)] text-[var(--t-danger-fg)]",
  warning: "bg-[var(--t-warning-bg)] text-[var(--t-warning-fg)]",
};
const field = "w-full rounded-lg border border-line bg-paper px-3 py-2 text-ink";
const button = "w-full rounded-lg bg-shop px-4 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:text-[var(--paper)]";

type Niveau = "urgent" | "attention" | "info";
interface Alerte { niveau: Niveau; texte: string; lien?: string }
interface Rapport { jour: string; chiffres: Record<string, number>; alertes: Alerte[]; resume: string | null; updated_at: string }
interface EmailCoco {
  id: string; subject: string; body: string; relance_de: string | null; website_id: string | null;
  coco_verdict: "ok" | "corrige" | "garde" | "annule" | null; coco_avis: string | null; coco_le: string | null; status: string;
  coco_cause?: "email" | "maquette" | "artisan" | "autre" | null; coco_metier?: string | null;
  prospects: { name: string; email: string | null; city: string | null; category: string | null } | null;
}
interface Tache { id: string; status: string; title: string; created_at: string; finished_at: string | null; error_message: string | null }

const niveaux: Record<Niveau, { label: string; tone: Tone }> = {
  urgent: { label: "Urgent", tone: "danger" },
  attention: { label: "À regarder", tone: "warning" },
  info: { label: "Pour info", tone: "info" },
};
const verdicts: Record<string, { label: string; tone: Tone }> = {
  ok: { label: "Validé", tone: "success" },
  corrige: { label: "Corrigé puis validé", tone: "info" },
  garde: { label: "Gardé pour toi", tone: "warning" },
  annule: { label: "Annulé par Coco", tone: "neutral" },
};
/** Le message de Valérie, sans la signature ni les mentions (pour la relecture rapide). */
const message = (corps: string) => corps.split("\nBien cordialement,")[0].trim();

export default async function CocoPage({ searchParams }: { searchParams: Promise<{ info?: string; erreur?: string; depuis?: string }> }) {
  const { info, erreur, depuis } = await searchParams;
  const notice = notices[erreur ?? info ?? ""];

  let pret = true;
  let pilote = true;
  let consignes = "";
  let rapport: Rapport | null = null;
  let gardes: EmailCoco[] = [];
  let recents: EmailCoco[] = [];
  let aRelire = 0;
  let taches: Tache[] = [];
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const champs = "id, subject, body, relance_de, website_id, coco_verdict, coco_avis, coco_le, status, prospects(name, email, city, category)";
    const [s, r, g, d, n, t] = await Promise.all([
      supabase.from("agent_settings").select("enabled, instructions").eq("agent", "coco").maybeSingle(),
      supabase.from("coco_rapports").select("jour, chiffres, alertes, resume, updated_at").order("jour", { ascending: false }).limit(1),
      // Avec la cause du problème (migration 20261030030000_coco_renvois.sql) ; sans elle si la migration manque.
      supabase.from("emails").select(`${champs}, coco_cause, coco_metier`).eq("status", "a_valider").eq("coco_verdict", "garde")
        .order("coco_le", { ascending: false }).limit(40)
        .then((r) => r.error
          ? supabase.from("emails").select(champs).eq("status", "a_valider").eq("coco_verdict", "garde").order("coco_le", { ascending: false }).limit(40)
          : r),
      supabase.from("emails").select(champs).in("coco_verdict", ["ok", "corrige"]).order("coco_le", { ascending: false }).limit(12),
      supabase.from("emails").select("id", { count: "exact", head: true }).eq("status", "a_valider").is("coco_le", null),
      supabase.from("tasks").select("id, status, title, created_at, finished_at, error_message").eq("agent", "coco").order("created_at", { ascending: false }).limit(5),
    ]);
    if (!s.data || r.error) pret = false;
    pilote = s.data?.enabled ?? true;
    consignes = s.data?.instructions ?? "";
    rapport = (r.data?.[0] as Rapport | undefined) ?? null;
    gardes = (g.data ?? []) as unknown as EmailCoco[];
    recents = (d.data ?? []) as unknown as EmailCoco[];
    aRelire = n.count ?? 0;
    taches = (t.data ?? []) as Tache[];
  }

  const running = taches.find((t) => t.status === "en_cours");
  const justLaunched = info === "lance" && Date.now() - Number(depuis ?? 0) < 3 * 60_000;
  const state: { label: string; tone: Tone } = running || justLaunched ? { label: running ? "Au travail" : "Démarrage…", tone: "progress" }
    : pilote ? { label: "Pilote automatique", tone: "success" } : { label: "En pause", tone: "muted" };
  const c = rapport?.chiffres ?? {};
  const alertes = [...(rapport?.alertes ?? [])].sort((a, b) =>
    ["urgent", "attention", "info"].indexOf(a.niveau) - ["urgent", "attention", "info"].indexOf(b.niveau));

  return (
    <>
      <AutoRefresh active={Boolean(running) || justLaunched} />
      <PageHeader
        title="Coco"
        description="Ta superviseuse. Dès que Valérie a rédigé ses e-mails (et ses relances), elle les relit comme tu le ferais : ce qui est propre part, ce qui est un peu maladroit est corrigé, et ce qui pose un vrai doute t'attend ici. Chaque soir, elle fait le point et te signale ce qui demande ton attention. Elle ne touche jamais aux réponses d'Inès ni aux liens de paiement."
      >
        <div><Badge tone={state.tone}>{state.label}</Badge></div>
      </PageHeader>

      {notice && <p role="status" className={`mb-6 rounded-xl px-4 py-3 text-sm ${toneClass[notice.tone]}`}>{notice.text}</p>}
      {!pret && isSupabaseConfigured && (
        <p className="mb-6 rounded-xl bg-[var(--t-warning-bg)] px-4 py-3 text-sm text-[var(--t-warning-fg)]">
          Il manque la migration <code>20261030020000_coco.sql</code> (GitHub → Actions → « Appliquer une migration »). D&apos;ici là, Coco ne fait rien.
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Gardés pour toi", value: formatNumber(gardes.length), hint: "plus aucun depuis le 17/11 : elle règle tout" },
          { label: "À relire", value: formatNumber(aRelire), hint: "au prochain passage de Valérie" },
          { label: "Validés aujourd'hui", value: formatNumber((c.coco_ok ?? 0) + (c.coco_corriges ?? 0)), hint: `dont ${formatNumber(c.coco_corriges ?? 0)} corrigé(s), au dernier bilan` },
          { label: "Réponses d'artisans", value: formatNumber(c.reponses_total ?? 0), hint: `${formatNumber(c.reponses_aujourdhui ?? 0)} aujourd'hui, au dernier bilan` },
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
          <Panel title={rapport ? `Bilan du ${formatDate(rapport.jour)}` : "Bilan du jour"}>
            {!rapport ? (
              <EmptyState>Pas encore de bilan : le premier arrive ce soir vers 18 h 15 (ou lance Coco ci-dessous).</EmptyState>
            ) : (
              <div className="space-y-3 px-4 py-4 sm:px-5">
                {rapport.resume && <p className="text-sm">{rapport.resume}</p>}
                {alertes.length === 0 ? (
                  <p className="text-sm text-muted">Aucune alerte.</p>
                ) : (
                  <ul className="space-y-2">
                    {alertes.map((a, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Badge tone={niveaux[a.niveau].tone}>{niveaux[a.niveau].label}</Badge>
                        <span className="min-w-0">
                          {a.texte}
                          {a.lien && <> <Link href={a.lien} className="font-medium text-shop hover:underline">Voir</Link></>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted">
                  {formatNumber(c.envoyes_aujourdhui ?? 0)} envoyé(s) aujourd&apos;hui{c.quota ? ` sur ${formatNumber(c.quota)}` : ""} ·
                  {" "}{formatNumber(c.envoyes_total ?? 0)} en tout · {formatNumber(c.maquettes_ouvertes_total ?? 0)} maquette(s) ouverte(s) ·
                  {" "}rebonds 7 j : {formatNumber(c.rebonds_7j ?? 0)}/{formatNumber(c.envoyes_7j ?? 0)} · stock validé : {formatNumber(c.stock_valides ?? 0)}.
                  {" "}Mis à jour le {formatDate(rapport.updated_at)}.
                </p>
              </div>
            )}
          </Panel>

          <Panel title="Réglages">
            <form action={saveCocoSettings} className="space-y-3 px-4 py-4 sm:px-5">
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="pilote" defaultChecked={pilote} className="mt-1" />
                <span>
                  <span className="font-medium">Pilote automatique</span>
                  <span className="block text-muted">Coco valide seule les e-mails propres. Décoché : elle ne valide plus rien, tu reprends la main sur la page Valérie.</span>
                </span>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Tes consignes pour Coco</span>
                <textarea name="consignes" defaultValue={consignes} rows={4} maxLength={1500} className={field}
                  placeholder="Ex. : garde pour moi tout artisan qui a déjà un site correct ; sois stricte sur l'objet." />
              </label>
              <button type="submit" className={button}>Enregistrer</button>
            </form>
            <form action={lancerCoco} className="border-t border-line px-4 py-4 sm:px-5">
              <button type="submit" className={button} disabled={Boolean(running) || !pilote}>
                {running ? "Coco travaille…" : `Tout relire maintenant${aRelire ? ` (${aRelire})` : ""}`}
              </button>
              {gardes.length > 0 && !running && pilote && (
                <button type="submit" name="revoir" value="1"
                  className="mt-2 w-full rounded-lg border border-shop px-4 py-2.5 font-semibold text-shop hover:bg-shop-soft">
                  Relire aussi ses {gardes.length} e-mail(s) gardé(s)
                </button>
              )}
              <p className="mt-2 text-xs text-muted">Sinon, elle relit les e-mails juste après leur rédaction par Valérie (vers 8 h et 14 h, 7 jours sur 7), les relances au début de chaque vague d&apos;envoi, puis fait son bilan chaque soir.</p>
            </form>
          </Panel>
        </div>

        <div className="space-y-6 lg:col-span-3">
          <Panel title="Gardés pour toi" action={<Link href="/valerie" className="text-sm font-medium text-shop hover:underline">Corriger sur Valérie</Link>}>
            {gardes.length === 0 ? (
              <EmptyState>Rien à trancher : tout ce que Coco a relu était propre.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {gardes.map((e) => (
                  <li key={e.id} className="space-y-2 px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">{e.prospects?.name ?? "Prospect supprimé"}</p>
                        <p className="break-all text-sm text-muted">{[e.prospects?.email, e.prospects?.category, e.prospects?.city].filter(Boolean).join(" · ")}</p>
                      </div>
                      {e.relance_de && <Badge tone="warning">Relance</Badge>}
                    </div>
                    <p className="rounded-lg bg-[var(--t-warning-bg)] px-3 py-2 text-sm text-[var(--t-warning-fg)]">{e.coco_avis}</p>
                    <details className="text-sm">
                      <summary className="cursor-pointer font-medium text-shop">Lire l&apos;e-mail : {e.subject}</summary>
                      <p className="mt-2 whitespace-pre-line text-muted">{message(e.body)}</p>
                    </details>
                    {e.coco_cause && e.coco_cause !== "autre" && (
                      <p className="text-sm text-muted">
                        D&apos;après Coco, c&apos;est {e.coco_cause === "email" ? "l'e-mail qui est à revoir (Valérie)"
                          : e.coco_cause === "maquette" ? `la maquette qui ne correspond pas (Sid)${e.coco_metier ? `. Bon métier : ${e.coco_metier}` : ""}`
                          : "l'artisan qui n'est pas une cible"}.
                      </p>
                    )}
                    <form action={deciderEmailGarde} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="id" value={e.id} />
                      <button type="submit" name="action" value="valider" className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${!e.coco_cause || e.coco_cause === "autre"
                        ? "bg-shop text-white hover:opacity-90 dark:text-[var(--paper)]" : "border border-shop text-shop hover:bg-shop-soft"}`}>
                        Valider quand même
                      </button>
                      <button type="submit" name="action" value="reecrire" className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${e.coco_cause === "email"
                        ? "bg-shop text-white hover:opacity-90 dark:text-[var(--paper)]" : "border border-shop text-shop hover:bg-shop-soft"}`}>
                        Faire réécrire (Valérie)
                      </button>
                      <span className="inline-flex items-center gap-1">
                        <select name="metier" defaultValue={e.coco_metier ?? ""} aria-label="Bon métier pour la nouvelle maquette"
                          className="rounded-lg border border-line bg-paper px-2 py-1.5 text-sm">
                          <option value="">Même métier</option>
                          {METIERS.map((m) => <option key={m.id} value={m.label}>{m.label}</option>)}
                        </select>
                        <button type="submit" name="action" value="refaire" className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${e.coco_cause === "maquette"
                          ? "bg-shop text-white hover:opacity-90 dark:text-[var(--paper)]" : "border border-shop text-shop hover:bg-shop-soft"}`}>
                          Refaire la maquette (Sid)
                        </button>
                      </span>
                      <button type="submit" name="action" value="ecarter" className="rounded-lg px-3 py-1.5 text-sm font-semibold text-[var(--t-danger-fg)] hover:bg-[var(--t-danger-bg)]">
                        Écarter l&apos;artisan
                      </button>
                      <Link href={`/valerie?vers=email-${e.id}`} className="px-1 py-1.5 text-sm font-medium text-shop hover:underline">
                        Corriger moi-même
                      </Link>
                      {e.website_id && (
                        <a href={`/demo/${e.website_id}`} target="_blank" rel="noopener noreferrer" className="px-1 py-1.5 text-sm font-medium text-shop hover:underline">
                          Maquette
                        </a>
                      )}
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Ses dernières décisions">
            {recents.length === 0 ? (
              <EmptyState>Coco n&apos;a encore rien validé. Elle commence au prochain passage de Valérie.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {recents.map((e) => {
                  const v = verdicts[e.coco_verdict ?? "ok"];
                  return (
                    <li key={e.id} className="px-4 py-3 text-sm sm:px-5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{e.prospects?.name ?? "Prospect"}{e.relance_de ? " · relance" : ""}</p>
                        <Badge tone={v.tone}>{v.label}</Badge>
                      </div>
                      <p className="text-muted">{e.coco_avis} · {formatDate(e.coco_le)}{e.status !== "valide" ? ` · ${e.status === "envoye" ? "envoyé" : e.status}` : ""}</p>
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
