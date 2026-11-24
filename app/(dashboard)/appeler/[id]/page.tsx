// Fiche d'appel personnalisée d'un artisan (24/11) : qui il est, ce qu'il a regardé, et un script d'appel écrit pour lui
// (nom, métier, prestations et zone de sa maquette, site actuel, offre en cours), les réponses aux objections, le message
// de répondeur, puis le résultat de l'appel (app/appel-actions.ts). Offre : agents/lib/redaction-reponse.ts et paiement.ts.
import type { Metadata } from "next";
import type { ReactNode } from "react";
import Lien from "@/components/lien";
import { Badge, PageHeader, Panel } from "@/components/ui";
import { VisitesMaquette } from "@/components/visites-maquette";
import { noterAppel } from "@/app/appel-actions";
import { OFFRE_LANCEMENT_OUVERTE } from "@/agents/lib/paiement";
import { aAppeler, lignesAppel, telAffiche, telLien, type AAppeler } from "@/lib/a-appeler";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatDate, formatSecondes } from "@/lib/format";

export const metadata: Metadata = { title: "Script d'appel" };

const messages: Record<string, string> = {
  note: "Résultat de l'appel enregistré.",
  demo: "Mode démo : rien n'est enregistré.",
  acces: "Ton compte n'a pas les droits d'administrateur.",
  resultat: "Choisis d'abord le résultat de l'appel.",
  echec: "L'enregistrement a échoué. Réessaie dans un instant.",
};

/** Une réplique à dire (en gros), avec une consigne facultative en dessous. */
function Dire({ children, aide }: { children: ReactNode; aide?: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="rounded-lg border-l-4 border-shop bg-shop-soft/50 px-3 py-2 text-[15px] leading-relaxed">« {children} »</p>
      {aide && <p className="px-1 text-sm text-muted">{aide}</p>}
    </div>
  );
}

function Etape({ n, titre, children }: { n: number; titre: string; children: ReactNode }) {
  return (
    <section className="space-y-2 px-4 py-4 sm:px-5">
      <h3 className="font-semibold"><span className="mr-2 text-shop">{n}.</span>{titre}</h3>
      {children}
    </section>
  );
}

function Objection({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group px-4 py-3 sm:px-5">
      <summary className="cursor-pointer font-medium">« {q} »</summary>
      <div className="mt-2 space-y-2">{children}</div>
    </details>
  );
}

/** « le 18 novembre » (date courte, sans l'heure). */
function jour(iso: string | null | undefined): string {
  if (!iso) return "il y a quelques jours";
  return "le " + new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long" }).format(new Date(iso));
}

function liste(mots: string[]): string {
  return mots.length <= 1 ? mots.join("") : `${mots.slice(0, -1).join(", ")} et ${mots[mots.length - 1]}`;
}

function Script({ a }: { a: AAppeler }) {
  const metier = (a.metier ?? "artisan").toLowerCase();
  const premier = a.envois.find((e) => e.type !== "relance");
  const relance = a.envois.find((e) => e.type === "relance");
  const services = a.services.map((s) => s.toLowerCase());
  const autres = a.zone.filter((c) => c && c !== a.ville).slice(0, 3);
  const site = a.siteActuel?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  const lancement = OFFRE_LANCEMENT_OUVERTE;

  return (
    <Panel title="Script d'appel">
      <div className="divide-y divide-line">
        <Etape n={1} titre="Se présenter (10 secondes)">
          <Dire aide="Parle lentement, souris. S'il est sur un chantier ou au volant : demande quand rappeler, note-le et raccroche.">
            Bonjour, je suis bien chez {a.nom} ? Je suis Ambroise Le Clerc, de Devanture : je fais des sites internet pour les artisans.
            Je vous ai envoyé {jour(premier?.sent_at)} par e-mail une maquette de site faite pour vous{relance ? ", puis un petit rappel" : ""}.
            Je vous dérange deux minutes ?
          </Dire>
        </Etape>

        <Etape n={2} titre="Lui faire parler de la maquette">
          <Dire aide="Ne dis jamais que tu as vu qu'il l'avait ouverte : demande simplement. Puis tais-toi et écoute, c'est le plus important de l'appel.">
            Vous avez peut-être eu l&apos;occasion d&apos;y jeter un œil ? Qu&apos;est-ce que vous en avez pensé ?
          </Dire>
          <p className="text-sm font-medium">S&apos;il l&apos;a regardée :</p>
          <Dire aide="Ouvre sa maquette dans un onglet pendant l'appel (lien en haut de page) pour parler de la même chose que lui.">
            {services.length
              ? <>J&apos;ai mis en avant {liste(services)}{a.ville ? <>, et votre zone autour de {a.ville}{autres.length ? <> : {liste(autres)}</> : null}</> : null}. </>
              : <>J&apos;ai mis en avant vos prestations de {metier}{a.ville ? <> autour de {a.ville}</> : null}. </>}
            Les photos sont des photos d&apos;illustration : sur le vrai site, ce seraient les vôtres. Il y a des choses que vous changeriez ?
          </Dire>
          <p className="text-sm font-medium">S&apos;il ne l&apos;a pas vue (ou ne s&apos;en souvient pas) :</p>
          <Dire aide="Puis renvoie-lui l'e-mail (lien « Voir l'e-mail » en haut) et propose de le rappeler dans deux jours.">
            Pas de souci, ça passe vite dans les e-mails. Je vous la renvoie tout de suite : c&apos;est gratuit et sans engagement, c&apos;est juste pour vous montrer ce que ça donnerait.
          </Dire>
        </Etape>

        <Etape n={3} titre="Comprendre son besoin">
          <Dire>Aujourd&apos;hui, vos nouveaux clients vous trouvent comment ? Plutôt le bouche-à-oreille, ou aussi par Google ?</Dire>
          {site
            ? <Dire aide={<>Il a déjà un site : <a href={a.siteActuel!} target="_blank" rel="noopener" className="text-shop hover:underline">{site}</a>. Regarde-le avant d&apos;appeler pour voir ce que la maquette fait de mieux.</>}>
                J&apos;ai vu que vous aviez déjà {site}. Il vous amène des demandes ? Vous pouvez le modifier facilement ?
              </Dire>
            : <Dire>Vous n&apos;avez pas encore de site : c&apos;est un choix, ou c&apos;est surtout le temps qui manque ?</Dire>}
        </Etape>

        <Etape n={4} titre="Présenter l'offre (seulement s'il est réceptif)">
          <Dire aide={<>Seulement si on te le demande, la formule Pro : jusqu&apos;à 5 pages, fiche Google suivie, 2 modifications par mois, {lancement ? "345 € au lieu de 690 €" : "690 €"} puis 39 €/mois (ou 0 € de départ et 99 €/mois sur 12 mois).</>}>
            Le plus simple, c&apos;est la formule Essentiel : votre site complet avec un bouton d&apos;appel, un formulaire de demande de devis,
            vos photos de chantiers, et je vous crée votre fiche Google.{" "}
            {lancement
              ? <>Comme vous seriez parmi mes cinq premiers clients, la création est à 195 € au lieu de 390, </>
              : <>C&apos;est 390 € de création, </>}
            puis 19 € par mois, sans engagement. Et si vous préférez ne rien avancer, c&apos;est 0 € de départ et 55 € par mois pendant un an.
            Le nom de domaine est à votre nom.
          </Dire>
        </Etape>

        <Etape n={5} titre="Conclure : une seule prochaine étape">
          <Dire aide="Après l'appel : coche « Intéressé » en bas de page, puis réponds-lui depuis la boîte mail (fil de son e-mail) avec le récapitulatif et le lien de paiement de la formule choisie (carte « Liens de paiement » de la page Inès).">
            Si ça vous va, je vous envoie un e-mail avec le récapitulatif et ce qu&apos;il me faut pour démarrer : quelques photos de vos chantiers,
            votre logo si vous en avez un, et vos horaires. Je mets le site en ligne seulement une fois que vous l&apos;avez validé. Ça vous va ?
          </Dire>
          <Dire aide="S'il hésite encore : propose un jour précis pour le rappeler, et note-le en bas (« À rappeler »).">
            Je vous propose d&apos;y réfléchir tranquillement, et je vous rappelle en fin de semaine ?
          </Dire>
        </Etape>
      </div>
    </Panel>
  );
}

function Objections({ a }: { a: AAppeler }) {
  return (
    <Panel title="S'il dit…">
      <div className="divide-y divide-line">
        <Objection q="Je me méfie, on m'a déjà fait le coup">
          <Dire aide="C'est l'objection la plus probable : beaucoup d'artisans ont signé des contrats de location de site sur 4 ans. Rassure par les faits.">
            Je comprends, il y a eu beaucoup d&apos;abus. Chez moi il n&apos;y a pas de contrat de location : c&apos;est sans engagement, vous arrêtez quand vous voulez.
            Le nom de domaine est à votre nom, et si vous arrêtez je vous le transfère gratuitement. Et vous voyez la maquette avant de payer quoi que ce soit.
          </Dire>
        </Objection>
        <Objection q="C'est combien ?">
          <Dire aide="Réponds franchement et tout de suite : esquiver le prix renforce la méfiance.">
            Formule Essentiel : {OFFRE_LANCEMENT_OUVERTE ? "195 € de création au lieu de 390 pour mes premiers clients" : "390 € de création"}, puis 19 € par mois sans engagement.
            Ou 0 € de départ et 55 € par mois pendant un an.
          </Dire>
        </Objection>
        <Objection q="J'ai assez de travail, pas besoin">
          <Dire aide="Ne force pas. Le but est qu'il garde une bonne image : il reviendra peut-être plus tard.">
            Tant mieux ! Un site sert aussi à choisir ses chantiers : les clients voient vos réalisations et votre zone avant d&apos;appeler,
            donc vous recevez moins de demandes qui ne vous intéressent pas. Mais je comprends, je vous laisse la maquette : si un jour ça vous dit, répondez simplement à l&apos;e-mail.
          </Dire>
        </Objection>
        <Objection q={a.siteActuel ? "J'ai déjà un site" : "Je suis sur Facebook, ça suffit"}>
          <Dire>
            {a.siteActuel
              ? <>Oui, j&apos;ai vu. La différence, c&apos;est que je m&apos;occupe de tout, y compris la fiche Google et les modifications chaque mois : vous n&apos;avez rien à gérer. Vous voulez que je vous dise ce que je changerais sur le vôtre ?</>
              : <>Facebook, c&apos;est bien pour ceux qui vous connaissent déjà. Quand quelqu&apos;un cherche un {(a.metier ?? "artisan").toLowerCase()} {a.ville ? <>à {a.ville}</> : <>près de chez lui</>} sur Google, il tombe sur des sites et des fiches Google, pas sur Facebook.</>}
          </Dire>
        </Objection>
        <Objection q="Envoyez-moi un e-mail">
          <Dire aide="Ça peut être une façon polie de raccrocher : demande ce qu'il veut y trouver pour qu'il le lise vraiment.">
            Bien sûr. Qu&apos;est-ce qui vous serait le plus utile : les prix, ou ce qu&apos;il me faudrait de votre part pour démarrer ?
          </Dire>
        </Objection>
        <Objection q="Je dois en parler à ma femme / à mon associé">
          <Dire>Bien sûr. Je vous envoie la maquette et les prix par e-mail pour que vous puissiez lui montrer, et je vous rappelle quel jour ?</Dire>
        </Objection>
        <Objection q="Ne m'appelez plus / ne m'écrivez plus">
          <Dire aide={<>Ensuite : coche « Pas intéressé » et ajoute son adresse sur la <Lien href="/opposition" className="text-shop hover:underline">liste d&apos;opposition</Lien> (plus aucun e-mail).</>}>
            Entendu, je ne vous recontacterai plus. Bonne journée !
          </Dire>
        </Objection>
      </div>
    </Panel>
  );
}

export default async function FicheAppel({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ info?: string; erreur?: string }>;
}) {
  const { id } = await params;
  const { info, erreur } = await searchParams;
  const notice = messages[erreur ?? info ?? ""];
  let a: AAppeler | undefined;
  let probleme: string | null = null;
  if (isSupabaseConfigured && /^[0-9a-f-]{36}$/.test(id)) {
    try {
      a = (await aAppeler(await createClient(), id))[0];
    } catch (e) {
      probleme = e instanceof Error ? e.message : String(e);
    }
  }
  if (!a) {
    return (
      <div className="space-y-4">
        <PageHeader title="Script d'appel" />
        <p>{probleme ? `Lecture impossible : ${probleme}` : "Artisan introuvable (ou il n'a pas ouvert sa maquette)."}</p>
        <Lien href="/appeler" className="text-shop hover:underline">← Retour à la liste</Lien>
      </div>
    );
  }
  const tel = telLien(a.telephone);
  const appels = lignesAppel(a.notes);
  const premierEmail = a.envois.find((e) => e.type !== "relance");

  return (
    <div className="space-y-6">
      <Lien href="/appeler" className="text-sm text-shop hover:underline">← Tous les artisans à appeler</Lien>
      <PageHeader title={a.nom} description={[a.metier, a.ville].filter(Boolean).join(" · ")} />
      {notice && <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">{notice}</p>}

      <Panel>
        <div className="space-y-3 px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center gap-3">
            {tel
              ? <a href={tel} className="tabular rounded-xl bg-shop px-5 py-3 text-lg font-semibold text-white hover:opacity-90 dark:text-[var(--paper)]">📞 Appeler le {telAffiche(a.telephone)}</a>
              : <span className="rounded-xl border border-line px-4 py-3 text-muted">Pas de numéro connu : écris-lui plutôt depuis la boîte mail.</span>}
            {a.chaud && <Badge tone="warning">chaud</Badge>}
            {a.statut === "interesse" && <Badge tone="success">intéressé</Badge>}
            {a.statut === "refuse" && <Badge tone="muted">refusé</Badge>}
            {a.aEcrit && <Badge tone="info">a déjà écrit</Badge>}
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {a.slug && <a href={`/m/${a.slug}?apercu=1`} target="_blank" rel="noopener" className="font-medium text-shop hover:underline">Sa maquette (style chaleureux)</a>}
            {a.slug && <a href={`/m/${a.slug}?apercu=1&style=pro`} target="_blank" rel="noopener" className="font-medium text-shop hover:underline">Style sobre</a>}
            {a.siteActuel && <a href={a.siteActuel} target="_blank" rel="noopener" className="font-medium text-shop hover:underline">Son site actuel</a>}
            <Lien href={a.emailId ? `/boite?dossier=envoyes&m=e-${a.emailId}` : "/boite?dossier=envoyes"} className="font-medium text-shop hover:underline">Voir l&apos;e-mail</Lien>
            {a.email && <span className="text-muted">{a.email}{a.fournisseur ? ` (${a.fournisseur})` : ""}</span>}
          </p>
          <div className="text-sm">
            <p>
              <span className="font-medium">Ce qu&apos;il a regardé :</span> maquette ouverte {a.vues} fois
              {a.totalS > 0 && <>, {formatSecondes(a.totalS)} au total</>}, la dernière fois {formatDate(a.derniere)}.
              {premierEmail && <> Premier e-mail : version {premierEmail.type}, {formatDate(premierEmail.sent_at)}.</>}
            </p>
            <VisitesMaquette visites={a.visites} vues={a.vues} premiere={a.premiere} envois={a.envois} />
          </div>
          {appels.length > 0 && (
            <div className="text-sm">
              <p className="font-medium">Appels précédents :</p>
              <ul className="list-disc pl-5 text-muted">{appels.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Avant d'appeler">
        <ul className="list-disc space-y-1 px-9 py-4 text-sm">
          <li>Les artisans répondent surtout tôt le matin (7 h 30 – 8 h 30), le midi ou en fin de journée (17 h 30 – 19 h).</li>
          <li>Ouvre sa maquette dans un onglet : tu parleras de ce qu&apos;il a vu.</li>
          <li>Le but de l&apos;appel n&apos;est pas de vendre en 3 minutes : c&apos;est de savoir ce qu&apos;il en pense et d&apos;obtenir une prochaine étape.</li>
        </ul>
      </Panel>

      <Script a={a} />
      <Objections a={a} />

      <Panel title="Répondeur (20 secondes)">
        <div className="px-4 py-4 sm:px-5">
          <Dire aide="Puis coche « Messagerie » en bas et rappelle dans 2 ou 3 jours, à un autre moment de la journée.">
            Bonjour, c&apos;est Ambroise Le Clerc, de Devanture. Je vous ai envoyé par e-mail une maquette de site faite pour {a.nom}, et j&apos;aurais aimé avoir votre avis.
            Je vous rappelle dans quelques jours, ou vous pouvez simplement répondre à l&apos;e-mail. Bonne journée !
          </Dire>
        </div>
      </Panel>

      <Panel title="Résultat de l'appel">
        <form action={noterAppel} className="space-y-3 px-4 py-4 sm:px-5">
          <input type="hidden" name="id" value={a.prospectId} />
          <fieldset className="flex flex-wrap gap-2">
            {[
              ["interesse", "Intéressé"], ["rappeler", "À rappeler"], ["messagerie", "Messagerie / pas de réponse"],
              ["pas_interesse", "Pas intéressé"], ["mauvais_numero", "Mauvais numéro"],
            ].map(([v, l]) => (
              <label key={v} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm has-[:checked]:border-shop has-[:checked]:bg-shop-soft">
                <input type="radio" name="resultat" value={v} required /> {l}
              </label>
            ))}
          </fieldset>
          <textarea name="note" rows={3} maxLength={400} placeholder="Ce qu'il a dit, quand le rappeler, ce qu'il veut changer…"
            className="w-full rounded-lg border border-line bg-paper px-3 py-2" />
          <p className="text-xs text-muted">« Intéressé » et « Pas intéressé » arrêtent la relance automatique. Le résultat est ajouté aux notes de l&apos;artisan.</p>
          <button className="rounded-lg bg-shop px-4 py-2.5 font-semibold text-white hover:opacity-90 dark:text-[var(--paper)]">Enregistrer</button>
        </form>
      </Panel>
    </div>
  );
}
