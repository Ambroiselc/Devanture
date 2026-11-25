// Page « Boîte mail » : une vraie messagerie. Dossiers à gauche (Reçus, Envoyés, Brouillons d'Inès,
// Spam et absences), liste des e-mails au milieu, e-mail ouvert à droite avec toute la conversation.
// « Envoyés » réunit les e-mails de prospection de Valérie et les réponses (d'Inès ou les tiennes).
// Le travail d'Inès (réponses à valider, réglages) est sur sa page à elle : /ines.
import type { Metadata } from "next";
import Link from "@/components/lien";
import { writeReply } from "../../boite-actions";
import { LiensPaiement } from "@/components/liens-paiement";
import { Badge, DemoTag } from "@/components/ui";
import { getBoiteSettings, getData, getEmailsEnvoyes, getMailbox, getNomsProspects } from "@/lib/data";
import { formatDate, mailCategory, mailStatus, type Tone } from "@/lib/format";
import { corpsProspection, extrait, sansCitation } from "@/lib/mail";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { Email, MailboxMessage, Prospect } from "@/lib/types";

export const metadata: Metadata = { title: "Boîte mail" };

type Dossier = "recus" | "envoyes" | "brouillons" | "autres";
const DOSSIERS: { id: Dossier; nom: string; aide: string }[] = [
  { id: "recus", nom: "Reçus", aide: "Les e-mails des artisans" },
  { id: "envoyes", nom: "Envoyés", aide: "Prospection et réponses" },
  { id: "brouillons", nom: "Brouillons", aide: "Réponses d'Inès à valider" },
  { id: "autres", nom: "Spam et absences", aide: "Rangés par Inès" },
];
const estDossier = (d: unknown): d is Dossier => DOSSIERS.some((x) => x.id === d);

const notices: Record<string, { tone: "success" | "danger" | "warning"; text: string }> = {
  valide_part: { tone: "success", text: "Réponse envoyée : elle part dans la minute (entre 8 h et 20 h ; sinon demain matin)." },
  valide: { tone: "success", text: "Réponse enregistrée : elle partira au prochain passage d'Inès (toutes les 2 heures en journée)." },
  vide: { tone: "danger", text: "Ta réponse est vide ou trop courte." },
  oppose: { tone: "danger", text: "Cette adresse est sur la liste d'opposition : la base refuse l'envoi." },
  echec: { tone: "danger", text: "L'envoi a échoué. As-tu exécuté la migration « boite_mail » dans Supabase ?" },
  invalide: { tone: "danger", text: "Message introuvable." },
  demo: { tone: "warning", text: "Mode démo : rien n'est envoyé. Branche Supabase pour utiliser la vraie boîte." },
};
const toneClass = {
  success: "bg-[var(--t-success-bg)] text-[var(--t-success-fg)]",
  danger: "bg-[var(--t-danger-bg)] text-[var(--t-danger-fg)]",
  warning: "bg-[var(--t-warning-bg)] text-[var(--t-warning-fg)]",
};

/** Suivi Resend d'un e-mail de prospection. */
const livraison: Record<string, { label: string; tone: Tone }> = {
  sent: { label: "Parti", tone: "info" },
  delivered: { label: "Distribué", tone: "success" },
  opened: { label: "Ouvert", tone: "success" },
  clicked: { label: "Lien ouvert", tone: "success" },
  bounced: { label: "Rebond", tone: "danger" },
  complained: { label: "Signalé spam", tone: "danger" },
  delivery_delayed: { label: "Retardé", tone: "warning" },
};

/** Une ligne de la liste. */
interface Ligne {
  cle: string;
  fil: string;
  date: string;
  qui: string;
  adresse: string | null;
  objet: string;
  apercu: string;
  aRegarder: boolean;
  badge?: { label: string; tone: Tone };
  demo: boolean;
}

/** Un message affiché dans la conversation ouverte. */
interface Bulle {
  id: string;
  deMoi: boolean;
  auteur: string;
  adresse: string | null;
  date: string;
  objet: string;
  texte: string;
  badges: { label: string; tone: Tone }[];
  pieces: string[];
  brouillon?: string;
  demo: boolean;
}

const filDe = (m: MailboxMessage) => m.thread_id ?? m.id;

export default async function BoitePage({ searchParams }: {
  searchParams: Promise<{ dossier?: string; m?: string; q?: string; info?: string; erreur?: string }>;
}) {
  const sp = await searchParams;
  const dossier: Dossier = estDossier(sp.dossier) ? sp.dossier : "recus";
  const recherche = (sp.q ?? "").trim().toLowerCase().slice(0, 80);
  const notice = notices[sp.erreur ?? sp.info ?? ""];

  const [{ prospects, emails: emailsRecents }, { settings }, { messages, ready }, envoyesRecents] =
    await Promise.all([getData("prospects", "emails"), getBoiteSettings(), getMailbox(), getEmailsEnvoyes()]);
  // 25/11 : on ajoute les derniers e-mails PARTIS (lus par date d'envoi), absents des 500 derniers créés.
  const dejaLa = new Set(emailsRecents.map((e) => e.id));
  const emails = [...emailsRecents, ...envoyesRecents.filter((e) => !dejaLa.has(e.id))];
  const nom = settings.display_name;
  const signature = settings.signature?.trim() || "Ambroise Le Clerc\nDevanture";
  const prospectById = new Map(prospects.map((p) => [p.id, p]));
  const visibles = messages.filter((m) => m.status !== "rejete");
  // 9/11 : les artisans absents des 500 prospects les plus récents (contactés plus tôt) : nom et adresse lus à part,
  // sinon la liste affichait « À : Prospect ».
  const autresNoms = await getNomsProspects([
    ...emails.map((e) => e.prospect_id),
    ...visibles.map((m) => m.prospect_id ?? ""),
  ].filter((id) => id && !prospectById.has(id)));
  const contactDe = (id: string | null | undefined) => (id ? prospectById.get(id) ?? autresNoms.get(id) : undefined);
  const nomDe = (prospectId: string | null, repli: string | null) =>
    contactDe(prospectId)?.name || repli || "Inconnu";

  // Fil de discussion de chaque e-mail de prospection auquel l'artisan a répondu.
  const filDeProspection = new Map<string, string>();
  for (const m of visibles) if (m.email_id && !filDeProspection.has(m.email_id)) filDeProspection.set(m.email_id, filDe(m));
  const envoyesProspection = emails.filter((e) => e.status === "envoye" || e.status === "repondu");

  // --- Les lignes de chaque dossier ---
  const ligneMessage = (m: MailboxMessage): Ligne => {
    const entrant = m.direction === "entrant";
    const cat = m.category ? mailCategory[m.category] : null;
    return {
      cle: m.id,
      fil: filDe(m),
      date: (entrant ? m.received_at : m.sent_at) ?? m.created_at,
      qui: entrant ? nomDe(m.prospect_id, m.from_name ?? m.from_email) : `À : ${nomDe(m.prospect_id, m.to_email)}`,
      adresse: entrant ? m.from_email : m.to_email,
      objet: m.subject || "(sans objet)",
      apercu: m.summary && entrant ? m.summary : extrait(m.body_text),
      aRegarder: entrant && (m.status === "nouveau" || m.status === "a_traiter"),
      badge: m.status === "erreur" ? { label: "Échec d'envoi", tone: "danger" }
        : !entrant && m.sent_by === "agent" ? { label: `Par ${nom}`, tone: "muted" }
        : cat ?? undefined,
      demo: m.is_demo,
    };
  };
  const ligneProspection = (e: Email): Ligne => {
    const p = contactDe(e.prospect_id);
    return {
      cle: `e-${e.id}`,
      fil: filDeProspection.get(e.id) ?? `e-${e.id}`,
      date: e.sent_at ?? e.created_at,
      qui: `À : ${p?.name || p?.email || "Prospect"}`,
      adresse: p?.email ?? null,
      objet: e.subject || "(sans objet)",
      apercu: e.body ? extrait(corpsProspection(e.body)) : "E-mail de prospection de Valérie",
      aRegarder: false,
      badge: e.status === "repondu" ? { label: "A répondu", tone: "success" }
        : e.delivery_status && livraison[e.delivery_status] ? livraison[e.delivery_status] : { label: "Prospection", tone: "info" },
      demo: e.is_demo,
    };
  };

  const parDossier: Record<Dossier, Ligne[]> = {
    recus: visibles.filter((m) => m.direction === "entrant" && m.status !== "ignore").map(ligneMessage),
    envoyes: [
      ...visibles.filter((m) => m.direction === "sortant" && (m.status === "envoye" || m.status === "valide")).map(ligneMessage),
      ...envoyesProspection.map(ligneProspection),
    ],
    brouillons: visibles.filter((m) => m.direction === "sortant" && (m.status === "a_valider" || m.status === "erreur")).map(ligneMessage),
    autres: visibles.filter((m) => m.direction === "entrant" && m.status === "ignore").map(ligneMessage),
  };
  for (const d of DOSSIERS) parDossier[d.id].sort((a, b) => b.date.localeCompare(a.date));
  const compteur: Record<Dossier, number> = {
    recus: parDossier.recus.filter((l) => l.aRegarder).length,
    envoyes: 0,
    brouillons: parDossier.brouillons.length,
    autres: 0,
  };
  const lignes = parDossier[dossier].filter((l) => !recherche
    || [l.qui, l.adresse, l.objet, l.apercu].some((t) => t?.toLowerCase().includes(recherche)));

  // --- La conversation ouverte ---
  const filOuvert = sp.m && /^(e-)?[0-9a-f-]{36}$/i.test(sp.m) ? sp.m : null;
  const bulles: Bulle[] = [];
  let dernierRecu: MailboxMessage | undefined;
  let titre = "";
  let prospectFil: Prospect | undefined;
  if (filOuvert) {
    const duFil = filOuvert.startsWith("e-") ? [] : visibles.filter((m) => filDe(m) === filOuvert)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const idProspection = filOuvert.startsWith("e-") ? filOuvert.slice(2) : duFil.find((m) => m.email_id)?.email_id;
    let prospection = idProspection ? emails.find((e) => e.id === idProspection) : undefined;
    // 9/11 : e-mail plus ancien que ceux chargés par la page (lien « Voir l'e-mail » des maquettes ouvertes) : lu à part.
    if (!prospection && idProspection && isSupabaseConfigured) {
      const supabase = await createClient();
      const { data } = await supabase.from("emails").select("*").eq("id", idProspection).maybeSingle();
      prospection = (data as (typeof emails)[number] | null) ?? undefined;
    }
    // 30/10 : le texte des e-mails envoyés n'est plus chargé avec la liste (trop lourd) : on le lit pour ce fil seulement.
    if (prospection && !prospection.body && isSupabaseConfigured) {
      const supabase = await createClient();
      const { data } = await supabase.from("emails").select("body").eq("id", prospection.id).maybeSingle();
      prospection.body = (data?.body as string | undefined) ?? "";
    }
    const idProspectFil = prospection?.prospect_id ?? duFil.find((m) => m.prospect_id)?.prospect_id ?? "";
    prospectFil = prospectById.get(idProspectFil);
    // 9/11 : artisan contacté plus tôt (hors des 500 récents) : sa fiche complète est lue pour ce fil seulement.
    if (!prospectFil && idProspectFil && isSupabaseConfigured) {
      const supabase = await createClient();
      const { data } = await supabase.from("prospects").select("*").eq("id", idProspectFil).maybeSingle();
      prospectFil = (data as Prospect | null) ?? undefined;
    }
    if (prospection && (prospection.status === "envoye" || prospection.status === "repondu")) {
      bulles.push({
        id: `e-${prospection.id}`,
        deMoi: true,
        auteur: "Toi · e-mail de prospection (rédigé par Valérie)",
        adresse: prospectFil?.email ?? null,
        date: prospection.sent_at ?? prospection.created_at,
        objet: prospection.subject,
        texte: corpsProspection(prospection.body),
        badges: [prospection.delivery_status && livraison[prospection.delivery_status]
          ? livraison[prospection.delivery_status] : { label: "Envoyé", tone: "info" as Tone }],
        pieces: [],
        demo: prospection.is_demo,
      });
    }
    for (const m of duFil) {
      const entrant = m.direction === "entrant";
      const badges: { label: string; tone: Tone }[] = [];
      if (entrant && m.category) badges.push(mailCategory[m.category]);
      if (!entrant || m.status === "a_traiter") badges.push(mailStatus[m.status]);
      bulles.push({
        id: m.id,
        deMoi: !entrant,
        auteur: entrant ? (m.from_name ?? m.from_email ?? "Inconnu")
          : m.sent_by === "agent" ? `${nom} (en ton nom)` : m.sent_by === "broise" ? "Toi" : `Brouillon ${/^[aeiouyhé]/i.test(nom) ? "d'" : "de "}${nom}`,
        adresse: entrant ? m.from_email : m.to_email,
        date: (entrant ? m.received_at : m.sent_at) ?? m.created_at,
        objet: m.subject,
        texte: sansCitation(m.body_text),
        badges,
        pieces: m.attachments.map((a) => a.nom),
        brouillon: m.status === "a_valider" || m.status === "erreur" ? m.id : undefined,
        demo: m.is_demo,
      });
    }
    dernierRecu = [...duFil].reverse().find((m) => m.direction === "entrant");
    titre = bulles.length ? (bulles.find((b) => !b.deMoi)?.objet || bulles[0].objet || "(sans objet)") : "";
  }

  const lien = (params: { dossier?: Dossier; m?: string | null }) => {
    const q = new URLSearchParams();
    const d = params.dossier ?? dossier;
    if (d !== "recus") q.set("dossier", d);
    if (params.m) q.set("m", params.m);
    if (recherche && !params.dossier) q.set("q", recherche);
    const s = q.toString();
    return `/boite${s ? `?${s}` : ""}`;
  };
  const nomDossier = DOSSIERS.find((d) => d.id === dossier)!.nom;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">Boîte mail</h1>
          <p className="text-sm text-muted">ambroise@devanture-artisans.fr · une copie de chaque e-mail reçu arrive aussi dans ton Gmail.</p>
        </div>
        <Link href="/ines" className="text-sm font-medium text-shop hover:underline">Page {/^[aeiouyhé]/i.test(nom) ? "d'" : "de "}{nom} →</Link>
      </div>

      {notice && <p role="status" className={`mb-4 rounded-xl px-4 py-3 text-sm ${toneClass[notice.tone]}`}>{notice.text}</p>}
      {isSupabaseConfigured && !ready && (
        <p role="alert" className={`mb-4 rounded-xl px-4 py-3 text-sm ${toneClass.warning}`}>
          La boîte mail n&apos;existe pas encore dans la base : exécute la migration <span className="font-mono">20261027000000_boite_mail.sql</span> dans Supabase.
        </p>
      )}

      <div className="grid min-h-[70vh] overflow-hidden rounded-xl border border-line bg-surface lg:grid-cols-[210px_minmax(0,380px)_minmax(0,1fr)]">
        {/* Dossiers */}
        <nav aria-label="Dossiers" className={`border-line lg:border-r ${filOuvert ? "hidden lg:block" : ""}`}>
          <ul className="flex gap-1 overflow-x-auto border-b border-line p-2 lg:flex-col lg:border-b-0 lg:p-3">
            {DOSSIERS.map((d) => {
              const actif = d.id === dossier;
              return (
                <li key={d.id} className="shrink-0">
                  <Link href={lien({ dossier: d.id })} aria-current={actif ? "page" : undefined} title={d.aide}
                    className={`flex items-center justify-between gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-[15px] ${
                      actif ? "bg-shop-soft font-semibold text-shop" : "text-ink hover:bg-shop-soft/60"}`}>
                    {d.nom}
                    {compteur[d.id] > 0 && (
                      <span className="tabular rounded-full bg-[var(--t-warning-bg)] px-1.5 text-xs font-semibold text-[var(--t-warning-fg)]">{compteur[d.id]}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Liste */}
        <section aria-label={nomDossier} className={`min-w-0 border-line lg:border-r ${filOuvert ? "hidden lg:block" : ""}`}>
          <form action="/boite" className="border-b border-line p-3">
            {dossier !== "recus" && <input type="hidden" name="dossier" value={dossier} />}
            <input type="search" name="q" defaultValue={sp.q ?? ""} placeholder={`Rechercher dans ${nomDossier.toLowerCase()}`}
              aria-label="Rechercher" className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm" />
          </form>
          {dossier === "brouillons" && lignes.length > 0 && (
            <p className="border-b border-line px-4 py-2 text-xs text-muted">Ces réponses attendent ta validation : ouvre-les, ou valide-les toutes sur la page {/^[aeiouyhé]/i.test(nom) ? "d'" : "de "}{nom}.</p>
          )}
          {lignes.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted">
              {recherche ? "Aucun e-mail ne correspond." : dossier === "recus" ? "Aucun e-mail reçu pour l'instant."
                : dossier === "envoyes" ? "Aucun e-mail envoyé pour l'instant." : dossier === "brouillons" ? "Aucun brouillon à valider." : "Rien ici."}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {lignes.slice(0, 150).map((l) => {
                const ouvert = filOuvert === l.fil;
                return (
                  <li key={l.cle}>
                    <Link href={lien({ m: l.fil })} aria-current={ouvert ? "true" : undefined}
                      className={`block px-4 py-3 hover:bg-shop-soft/40 ${ouvert ? "bg-shop-soft/50" : ""}`}>
                      <span className="flex items-baseline justify-between gap-3">
                        <span className={`min-w-0 truncate ${l.aRegarder ? "font-bold" : "font-medium"}`}>
                          {l.aRegarder && <span aria-label="à regarder" className="mr-1.5 inline-block h-2 w-2 rounded-full bg-shop align-middle" />}
                          {l.qui}<DemoTag show={l.demo} />
                        </span>
                        <span className="shrink-0 text-xs text-muted">{formatDate(l.date)}</span>
                      </span>
                      <span className={`block truncate text-sm ${l.aRegarder ? "font-semibold" : ""}`}>{l.objet}</span>
                      <span className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-sm text-muted">{l.apercu}</span>
                        {l.badge && <span className="shrink-0"><Badge tone={l.badge.tone}>{l.badge.label}</Badge></span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* E-mail ouvert */}
        <section aria-label="E-mail ouvert" className={`min-w-0 ${filOuvert ? "" : "hidden lg:block"}`}>
          {!filOuvert || bulles.length === 0 ? (
            <div className="grid h-full place-items-center px-6 py-16 text-center text-sm text-muted">
              {filOuvert ? "Cet e-mail n'existe plus (effacé par le nettoyage ou rejeté)." : "Choisis un e-mail dans la liste pour le lire."}
            </div>
          ) : (
            <article>
              <header className="space-y-1 border-b border-line px-4 py-4 sm:px-6">
                <Link href={lien({ m: null })} className="mb-2 inline-block text-sm font-medium text-shop hover:underline lg:hidden">← {nomDossier}</Link>
                <h2 className="font-display text-xl font-semibold">{titre}</h2>
                {prospectFil && (
                  <p className="text-sm text-muted">
                    {prospectFil.name} · {[prospectFil.category, prospectFil.city].filter(Boolean).join(" · ")}
                    {" · "}<Link href="/prospects" className="text-shop hover:underline">fiche prospect</Link>
                  </p>
                )}
              </header>
              <ol className="space-y-4 px-4 py-5 sm:px-6">
                {bulles.map((b) => (
                  <li key={b.id} className={`rounded-xl border px-4 py-3 ${b.deMoi ? "border-shop/30 bg-shop-soft/30 sm:ml-10" : "border-line bg-paper sm:mr-10"}`}>
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 text-sm">
                        <span className="font-semibold">{b.auteur}</span><DemoTag show={b.demo} />
                        <span className="block break-all text-xs text-muted">
                          {b.deMoi ? "À" : "De"} : {b.adresse ?? "—"} · {formatDate(b.date)}
                        </span>
                      </p>
                      <span className="flex flex-wrap gap-1.5">{b.badges.map((x) => <Badge key={x.label} tone={x.tone}>{x.label}</Badge>)}</span>
                    </div>
                    {b.objet && b.objet !== titre && <p className="mb-1 text-sm font-medium">{b.objet}</p>}
                    <p className="whitespace-pre-line text-[15px] leading-relaxed">{b.texte}</p>
                    {b.pieces.length > 0 && <p className="mt-2 text-xs text-muted">📎 {b.pieces.join(", ")} — dans la copie Gmail.</p>}
                    {b.brouillon && (
                      <Link href={`/ines#reponse-${b.brouillon}`}
                        className="mt-3 inline-block rounded-lg border border-shop px-3 py-1.5 text-sm font-semibold text-shop hover:bg-shop-soft">
                        Relire et valider ce brouillon
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
              {dernierRecu ? (
                <form action={writeReply} className="space-y-2 border-t border-line px-4 py-4 sm:px-6">
                  <input type="hidden" name="recu_id" value={dernierRecu.id} />
                  <input type="hidden" name="retour" value={`/boite?m=${filOuvert}`} />
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Répondre à {dernierRecu.from_name ?? dernierRecu.from_email}</span>
                    <textarea id="repondre" name="body" rows={8} defaultValue={`Bonjour,\n\n\n\nBien cordialement,\n${signature}`}
                      className="w-full rounded-lg border border-line bg-paper px-3 py-2 font-[inherit] leading-relaxed" />
                  </label>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted">Son message sera cité sous ta réponse.</span>
                    <button type="submit" className="rounded-lg bg-shop px-4 py-2 font-semibold text-white hover:opacity-90 dark:text-[var(--paper)]">Envoyer</button>
                  </div>
                  <details className="pt-2">
                    <summary className="cursor-pointer text-sm font-medium text-shop">💳 Liens de paiement à coller</summary>
                    <LiensPaiement className="mt-2" />
                  </details>
                </form>
              ) : (
                <p className="border-t border-line px-4 py-4 text-sm text-muted sm:px-6">Pas encore de réponse de l&apos;artisan.</p>
              )}
            </article>
          )}
        </section>
      </div>
    </>
  );
}
