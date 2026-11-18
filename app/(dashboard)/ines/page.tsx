// Page « Inès » : l'agente de la boîte mail. Son état, les réponses qu'elle a préparées (à valider),
// les messages qu'elle te laisse regarder, ses derniers passages et ses réglages.
// Les e-mails eux-mêmes (reçus, envoyés, conversations) se lisent dans la page « Boîte mail ».
import type { Metadata } from "next";
import Link from "@/components/lien";
import { launchBoite, markHandled, reviewReply, saveBoiteSettings, writeReply } from "../../boite-actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { LiensPaiement } from "@/components/liens-paiement";
import { Badge, DemoTag, EmptyState, PageHeader, Panel } from "@/components/ui";
import { getBoiteSettings, getData, getMailbox } from "@/lib/data";
import { formatDate, formatDuration, formatNumber, mailCategory, taskStatus, type Tone } from "@/lib/format";
import { sansCitation } from "@/lib/mail";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { MailboxMessage, Prospect, Task } from "@/lib/types";

export const metadata: Metadata = { title: "Inès" };

const notices: Record<string, { tone: "success" | "danger" | "warning"; text: string }> = {
  enregistre: { tone: "success", text: "Réglages enregistrés : Inès les appliquera à son prochain passage." },
  lance: { tone: "success", text: "C'est parti : GitHub démarre Inès (compter environ une minute). La page se met à jour toute seule." },
  valide_part: { tone: "success", text: "Réponse validée : Inès l'envoie dans la minute (entre 8 h et 20 h ; sinon demain matin)." },
  valide: { tone: "success", text: "Réponse validée : elle partira au prochain passage d'Inès (toutes les 2 heures en journée)." },
  corrige: { tone: "success", text: "Corrections enregistrées." },
  rejete: { tone: "success", text: "Réponse rejetée : rien ne part. Tu peux répondre toi-même depuis la boîte mail." },
  range: { tone: "success", text: "Message rangé." },
  demo: { tone: "warning", text: "Mode démo : rien n'est enregistré ni envoyé. Branche Supabase pour utiliser la vraie boîte." },
  migration: { tone: "warning", text: "La boîte mail n'existe pas encore : exécute la migration 20261027000000_boite_mail.sql dans Supabase." },
  pause: { tone: "warning", text: "Inès est en pause : réactive-la dans ses réglages." },
  cle: { tone: "warning", text: "Il manque la clé GitHub (GITHUB_ACTIONS_TOKEN) pour lancer Inès d'ici." },
  invalide: { tone: "danger", text: "Une valeur n'est pas valide (signature obligatoire, plafond entre 0 et 50)." },
  vide: { tone: "danger", text: "L'objet ou le texte de la réponse est vide ou trop court." },
  lien: { tone: "danger", text: "Remplace [LIEN DE LA MAQUETTE] par le vrai lien avant d'envoyer." },
  oppose: { tone: "danger", text: "Cette adresse est sur la liste d'opposition : la base refuse l'envoi." },
  echec: { tone: "danger", text: "L'enregistrement a échoué. As-tu exécuté la migration « boite_mail » dans Supabase ?" },
  acces: { tone: "danger", text: "Ce compte n'a pas le droit de lancer Inès." },
  github: { tone: "danger", text: "GitHub a refusé le lancement. Vérifie la clé GitHub et que agent-boite.yml est bien sur GitHub." },
};

const toneClass = {
  success: "bg-[var(--t-success-bg)] text-[var(--t-success-fg)]",
  danger: "bg-[var(--t-danger-bg)] text-[var(--t-danger-fg)]",
  warning: "bg-[var(--t-warning-bg)] text-[var(--t-warning-fg)]",
};
const field = "w-full rounded-lg border border-line bg-paper px-3 py-2";
const button = "w-full rounded-lg bg-shop px-4 py-2.5 font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:text-[var(--paper)]";
const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
/** « d'Inès », « de Margot ». */
const de = (nom: string) => (/^[aeiouyhàâéèêëîïôöùûü]/i.test(nom) ? `d'${nom}` : `de ${nom}`);

function Qui({ m, p }: { m: MailboxMessage; p: Prospect | undefined }) {
  const adresse = m.direction === "entrant" ? m.from_email : m.to_email;
  return (
    <span className="min-w-0">
      <span className="font-semibold">{p?.name ?? m.from_name ?? adresse ?? "Inconnu"}</span>
      <DemoTag show={m.is_demo} />
      <span className="block break-all text-sm text-muted">
        {m.direction === "entrant" ? "De" : "À"} : {adresse ?? "—"}{p ? ` · ${[p.category, p.city].filter(Boolean).join(" · ")}` : " · pas dans les prospects"}
      </span>
    </span>
  );
}

function Corps({ texte, ouvert = false }: { texte: string; ouvert?: boolean }) {
  const court = sansCitation(texte);
  return (
    <details open={ouvert} className="group rounded-lg bg-paper px-3 py-2 text-sm">
      <summary className="cursor-pointer list-none text-muted group-open:hidden">
        <span className="line-clamp-2 whitespace-pre-line text-ink">{court}</span>
        <span className="text-xs text-shop">Lire tout</span>
      </summary>
      <p className="whitespace-pre-line leading-relaxed">{court}</p>
    </details>
  );
}

function Bilan({ t }: { t: Task }) {
  const o = t.output ?? {};
  if (!("tries" in o)) return null;
  return (
    <p className="text-sm text-muted">
      {num(o.tries)} trié(s) · {num(o.auto_envoyees)} réponse(s) seule(s) · {num(o.a_valider)} à valider
      {num(o.stop) > 0 && ` · ${num(o.stop)} STOP`} · {num(o.envoyes)} envoyée(s)
      {num(o.erreurs) > 0 && ` · ${num(o.erreurs)} erreur(s)`}
    </p>
  );
}

/** Lien vers la conversation dans la boîte mail. */
const lienFil = (m: MailboxMessage) => `/boite?m=${m.thread_id ?? m.id}`;

/** Réponse préparée par Inès, à relire. */
function AValider({ r, recu, p }: { r: MailboxMessage; recu: MailboxMessage | undefined; p: Prospect | undefined }) {
  const cat = r.category ? mailCategory[r.category] : null;
  return (
    <li id={`reponse-${r.id}`} className="scroll-mt-6 space-y-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Qui m={r} p={p} />
        <div className="flex items-center gap-2">
          {cat && <Badge tone={cat.tone}>{cat.label}</Badge>}
          <Link href={lienFil(r)} className="text-sm font-medium text-shop hover:underline">Voir la conversation</Link>
        </div>
      </div>
      {recu && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted">Son message ({formatDate(recu.received_at ?? recu.created_at)})</p>
          <Corps texte={recu.body_text} ouvert />
          {recu.attachments.length > 0 && (
            <p className="mt-1 text-xs text-muted">Pièce(s) jointe(s) : {recu.attachments.map((a) => a.nom).join(", ")} — dans la copie Gmail.</p>
          )}
        </div>
      )}
      {r.review_reason && (
        <p className="rounded-lg bg-[var(--t-warning-bg)] px-3 py-2 text-xs text-[var(--t-warning-fg)]">Pourquoi elle attend ton avis : {r.review_reason}</p>
      )}
      {r.status === "erreur" && r.error_message && (
        <p className="rounded-lg bg-[var(--t-danger-bg)] px-3 py-2 text-xs text-[var(--t-danger-fg)]">Échec d&apos;envoi : {r.error_message}</p>
      )}
      <form action={reviewReply} className="space-y-3">
        <input type="hidden" name="id" value={r.id} />
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Objet</span>
          <input id={`objet-${r.id}`} name="subject" defaultValue={r.subject} maxLength={150} className={field} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Réponse proposée</span>
          <textarea id={`corps-${r.id}`} name="body" defaultValue={r.body_text} rows={10} className={`${field} font-[inherit] leading-relaxed`} />
          <span className="mt-1 block text-xs text-muted">Son message sera cité sous ta réponse, comme dans une messagerie classique.</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" name="action" value="valider"
            className="rounded-lg bg-shop px-4 py-2 font-semibold text-white hover:opacity-90 dark:text-[var(--paper)]">Valider et envoyer</button>
          <button type="submit" name="action" value="enregistrer"
            className="rounded-lg border border-shop px-4 py-2 font-semibold text-shop hover:bg-shop-soft">Enregistrer</button>
          <button type="submit" name="action" value="rejeter"
            className="rounded-lg px-4 py-2 font-medium text-[var(--t-danger-fg)] hover:bg-[var(--t-danger-bg)]">Rejeter</button>
        </div>
      </form>
    </li>
  );
}

export default async function InesPage({ searchParams }: {
  searchParams: Promise<{ info?: string; erreur?: string; depuis?: string }>;
}) {
  const { info, erreur, depuis } = await searchParams;
  const [{ tasks, prospects }, { settings, ready }, { messages, ready: boiteReady }] =
    await Promise.all([getData("tasks", "prospects"), getBoiteSettings(), getMailbox()]);
  const notice = notices[erreur ?? info ?? ""];
  const nom = settings.display_name;
  const signature = settings.signature?.trim() || "Ambroise Le Clerc\nDevanture";
  const prospectById = new Map(prospects.map((p) => [p.id, p]));
  const byId = new Map(messages.map((m) => [m.id, m]));

  const runs = tasks.filter((t) => t.agent === "boite")
    .sort((a, b) => (b.started_at ?? b.created_at).localeCompare(a.started_at ?? a.created_at));
  const running = runs.find((t) => t.status === "en_cours");
  const now = Date.now();
  const justLaunched = info === "lance" && now - Number(depuis ?? 0) < 3 * 60_000;

  const aValider = messages.filter((m) => m.direction === "sortant" && (m.status === "a_valider" || m.status === "erreur"))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const aRegarder = messages.filter((m) => m.direction === "entrant" && (m.status === "a_traiter" || m.status === "nouveau"))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const semaine = now - 7 * 86_400_000;
  const recus7j = messages.filter((m) => m.direction === "entrant" && m.status !== "ignore" && new Date(m.created_at).getTime() > semaine).length;
  const seules7j = messages.filter((m) => m.direction === "sortant" && m.sent_by === "agent" && m.status === "envoye"
    && new Date(m.created_at).getTime() > semaine).length;

  const state: { label: string; tone: Tone } = isSupabaseConfigured && (!ready || !boiteReady)
    ? { label: "Migration à lancer", tone: "warning" }
    : !settings.enabled ? { label: "En pause", tone: "muted" }
    : running || justLaunched ? { label: running ? "Au travail" : "Démarrage…", tone: "progress" }
    : { label: settings.auto_reply_enabled ? "Prête · répond seule aux messages simples" : "Prête · tout passe par toi", tone: "success" };

  return (
    <>
      <AutoRefresh active={Boolean(running) || justLaunched} />
      <PageHeader
        title={nom}
        description={`L'agente de ta boîte mail. Elle trie chaque e-mail reçu, range les STOP dans la liste d'opposition, répond seule aux messages simples, et te prépare ici les autres réponses. Les e-mails eux-mêmes se lisent dans la boîte mail.`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={state.tone}>{state.label}</Badge>
          <Link href="/boite" className="text-sm font-medium text-shop hover:underline">Ouvrir la boîte mail</Link>
        </div>
      </PageHeader>

      {notice && <p role="status" className={`mb-6 rounded-xl px-4 py-3 text-sm ${toneClass[notice.tone]}`}>{notice.text}</p>}
      {isSupabaseConfigured && (!ready || !boiteReady) && !notice && (
        <p role="alert" className={`mb-6 rounded-xl px-4 py-3 text-sm ${toneClass.warning}`}>
          La boîte mail n&apos;existe pas encore dans la base : exécute{" "}
          <span className="font-mono">supabase/migrations/20261027000000_boite_mail.sql</span> dans Supabase (SQL Editor),
          puis suis <span className="font-mono">docs/boite-mail.md</span>.
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Réponses à valider", value: aValider.length, hint: "prix, contrat, intéressés…" },
          { label: "Messages à regarder", value: aRegarder.length, hint: "sans réponse préparée" },
          { label: "Reçus (7 jours)", value: recus7j, hint: "hors spam et absences" },
          { label: `Réponses ${de(nom)} (7 jours)`, value: seules7j, hint: "parties sans validation" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-line bg-surface px-4 py-3">
            <p className="text-sm text-muted">{k.label}</p>
            <p className="tabular font-display text-2xl font-semibold">{formatNumber(k.value)}</p>
            <p className="text-xs text-muted">{k.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Panel title={`Réponses à valider (${aValider.length})`}>
            {aValider.length === 0 ? (
              <EmptyState>Rien à valider. {nom} te prépare ici les réponses qui parlent de prix, de contrat, d&apos;appel, ou aux artisans intéressés.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {aValider.map((r) => (
                  <AValider key={r.id} r={r} recu={r.reply_to_id ? byId.get(r.reply_to_id) : undefined}
                    p={r.prospect_id ? prospectById.get(r.prospect_id) : undefined} />
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={`À regarder (${aRegarder.length})`}>
            {aRegarder.length === 0 ? (
              <EmptyState>Rien à regarder. {nom} met ici les messages pour lesquels elle n&apos;a pas préparé de réponse.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {aRegarder.map((m) => {
                  const p = m.prospect_id ? prospectById.get(m.prospect_id) : undefined;
                  const cat = m.category ? mailCategory[m.category] : null;
                  return (
                    <li key={m.id} className="space-y-3 px-4 py-4 sm:px-5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <Qui m={m} p={p} />
                        <div className="flex items-center gap-2">
                          {cat ? <Badge tone={cat.tone}>{cat.label}</Badge> : <Badge tone="info">Pas encore trié</Badge>}
                          <Link href={lienFil(m)} className="text-sm font-medium text-shop hover:underline">Conversation</Link>
                        </div>
                      </div>
                      <p className="text-sm"><span className="font-medium">{m.subject || "(sans objet)"}</span>{m.summary && <span className="text-muted"> — {m.summary}</span>}</p>
                      {m.review_reason && <p className="text-xs text-[var(--t-warning-fg)]">{m.review_reason}</p>}
                      <Corps texte={m.body_text} />
                      <details className="text-sm">
                        <summary className="cursor-pointer font-medium text-shop">Répondre moi-même</summary>
                        <form action={writeReply} className="mt-2 space-y-2">
                          <input type="hidden" name="recu_id" value={m.id} />
                          <input type="hidden" name="retour" value="/ines" />
                          <textarea id={`repondre-${m.id}`} name="body" rows={8} aria-label={`Ta réponse à ${m.from_name ?? m.from_email}`}
                            className={`${field} font-[inherit] leading-relaxed`} defaultValue={`Bonjour,\n\n\n\nBien cordialement,\n${signature}`} />
                          <button type="submit" className="rounded-lg bg-shop px-4 py-2 font-semibold text-white hover:opacity-90 dark:text-[var(--paper)]">Envoyer</button>
                        </form>
                      </details>
                      <form action={markHandled}>
                        <input type="hidden" name="id" value={m.id} />
                        <button className="text-sm font-medium text-muted hover:text-ink hover:underline">Ranger sans répondre</button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Panel title="Relever le courrier">
            <form action={launchBoite} className="space-y-3 px-4 py-4 sm:px-5">
              <p className="text-sm text-muted">
                {nom} se réveille toute seule dès qu&apos;un e-mail arrive, et toutes les 2 heures en journée. Le bouton la lance tout de suite.
              </p>
              <button type="submit" className={button} disabled={!settings.enabled || Boolean(running)}>
                {running ? `${nom} travaille…` : `Lancer ${nom}`}
              </button>
            </form>
          </Panel>

          <LiensPaiement />

          <Panel title="Ce qu'elle fait seule">
            <ul className="space-y-2 px-4 py-4 text-sm sm:px-5">
              <li><span className="font-medium">Seule :</span> range les absences et le spam ; met les « STOP » sur la liste d&apos;opposition ; répond aux questions simples sur la maquette et aux « pas intéressé » (puis ne les recontacte plus).</li>
              <li><span className="font-medium">Avec toi :</span> tout ce qui parle de prix, contrat, paiement, appel ou rendez-vous ; les artisans intéressés ; les expéditeurs inconnus ; les pièces jointes ; au-delà de 2 réponses dans une même conversation ou de {settings.auto_reply_max_per_day ?? 20} par jour.</li>
              <li><span className="font-medium">Envoi :</span> entre 8 h et 20 h, depuis ton adresse Devanture ; le message de l&apos;artisan est cité sous la réponse.</li>
            </ul>
          </Panel>

          <Panel title="Derniers passages"
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
                    <p className="text-sm text-muted">{formatDate(t.started_at ?? t.created_at)} · durée {formatDuration(t.started_at, t.finished_at)}</p>
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
        <form id="reglages" action={saveBoiteSettings} className="grid gap-x-8 gap-y-5 px-4 py-5 sm:px-5 md:grid-cols-2">
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Nom de l&apos;agente</span>
              <input id="boite-nom" name="nom" required maxLength={40} defaultValue={nom} className={field} />
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input id="boite-actif" type="checkbox" name="actif" defaultChecked={settings.enabled} className="mt-1 h-4 w-4 accent-[var(--shop)]" />
              <span><span className="font-medium">Active</span><span className="block text-muted">Décoché = en pause : les e-mails arrivent quand même (et dans Gmail), mais rien n&apos;est trié ni envoyé.</span></span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input id="boite-auto" type="checkbox" name="auto" defaultChecked={settings.auto_reply_enabled ?? true} className="mt-1 h-4 w-4 accent-[var(--shop)]" />
              <span><span className="font-medium">Répondre seule aux messages simples</span><span className="block text-muted">Décoché = toutes les réponses attendent ta validation.</span></span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Réponses seules par jour, au plus</span>
              <input id="boite-max" name="max_auto" type="number" min={0} max={50} required defaultValue={settings.auto_reply_max_per_day ?? 20} className={field} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Contacts de chauffe</span>
              <textarea id="boite-chauffe" name="chauffe" rows={3} maxLength={2000} defaultValue={(settings.contacts_chauffe ?? []).join("\n")} className={field}
                placeholder="Une adresse par ligne" />
              <span className="mt-1 block text-xs text-muted">Les amis à qui tu écris pour chauffer les boîtes : {nom} range leurs messages à part (« Chauffe »), sans y répondre.</span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Consignes pour {nom}</span>
              <textarea id="boite-consignes" name="consignes" rows={4} maxLength={1500} defaultValue={settings.instructions ?? ""} className={field}
                placeholder="Ex. : propose toujours un appel de 10 minutes aux artisans intéressés." />
            </label>
          </div>
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Signature des réponses</span>
              <textarea id="boite-signature" name="signature" rows={5} required maxLength={500} defaultValue={signature} className={field} />
              <span className="mt-1 block text-xs text-muted">Placée après « Bien cordialement, » sous chaque réponse {de(nom)}.</span>
            </label>
            <button type="submit" className={button}>Enregistrer les réglages</button>
          </div>
        </form>
      </Panel>
    </>
  );
}
