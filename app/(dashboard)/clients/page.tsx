// Page « Clients » (29/10) : chaque artisan qui a payé, l'étape où il en est et ce qu'il faut faire ensuite.
// Procédure complète : docs/apres-signature.md.
import type { Metadata } from "next";
import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui";
import { creerClient, ignorerPaiement, lancerPedro, majClient, rattacherPaiement } from "@/app/clients-actions";
import { Copier } from "@/components/copier";
import { lienAccueil } from "@/agents/lib/accueil";
import { LIENS_PAIEMENT } from "@/agents/lib/paiement";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { champsContenu, etapes, formules, ordreEtapes, paiements, type Client, type EtapeClient, type PaiementStripe } from "@/lib/clients";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Clients" };

const field = "w-full rounded-lg border border-line bg-paper px-3 py-2";
const button = "rounded-lg bg-shop px-4 py-2.5 font-semibold text-white hover:opacity-90 dark:text-[var(--paper)]";

const messages: Record<string, string> = {
  cree: "Fiche client créée. Première étape : l'e-mail de bienvenue.",
  enregistre: "Fiche enregistrée.",
  demo: "Mode démo : rien n'est enregistré.",
  acces: "Ton compte n'a pas les droits d'administrateur.",
  invalide: "Il manque un choix (prospect, formule ou paiement).",
  deja: "Ce prospect a déjà une fiche client.",
  rattache: "Paiement rattaché. La fiche est créée et l'e-mail de bienvenue attend ta validation (page Inès).",
  ignore: "Paiement mis de côté.",
  abonnement: "C'est un paiement d'abonnement : rattache-le à un prospect qui a déjà sa fiche client.",
  echec: "L'enregistrement a échoué. Réessaie dans un instant ; si ça continue, envoie-moi une capture.",
  pedro_lance: "Pedro prépare le site (5 minutes environ). L'aperçu apparaîtra sur la fiche, et l'e-mail d'aperçu attendra ta validation sur la page Inès.",
  pedro_en_ligne: "Pedro met le site en ligne (3 minutes environ). Le cadenas (https) peut demander encore quelques minutes.",
  cle: "La clé GitHub du tableau de bord manque (GITHUB_ACTIONS_TOKEN dans Cloudflare).",
  github: "GitHub a refusé le lancement de Pedro. Réessaie ; si ça continue, envoie-moi une capture.",
  occupe: "Pedro travaille déjà sur un site : attends qu'il ait fini (quelques minutes), puis relance.",
  domaine: "Note d'abord le nom de domaine du client sur sa fiche (et enregistre).",
  pas_valide: "Le site se met en ligne seulement après la validation écrite du client : passe d'abord la fiche à « Validé ».",
};

const statutsDevis: Record<string, string> = { a_transmettre: "en cours d'envoi", transmis: "transmise", erreur: "pas transmise", ignore: "ignorée" };

interface SiteClient { id: string; prospect_id: string; slug: string; url: string | null; status: string; updated_at: string; published_at: string | null }
interface DemandeDevis { id: string; website_id: string; nom: string | null; commune: string | null; statut: string; created_at: string; erreur: string | null }

/** Petite frise des étapes, l'étape en cours mise en avant. */
function Frise({ etape }: { etape: EtapeClient }) {
  const i = ordreEtapes.indexOf(etape);
  return (
    <ol className="flex flex-wrap gap-1.5 text-xs" aria-label="Étapes">
      {ordreEtapes.map((e, n) => (
        <li key={e} className={`rounded-full px-2 py-0.5 ${
          n === i ? "bg-shop font-semibold text-white dark:text-[var(--paper)]" : n < i ? "bg-shop-soft text-shop" : "bg-paper text-muted"
        }`}>{etapes[e].label}</li>
      ))}
    </ol>
  );
}

/** Le site du client (Pedro) : aperçu ou adresse en ligne, boutons Préparer / Mettre en ligne, demandes de devis. */
function SitePedro({ client: c, site, devis }: { client: Client; site?: SiteClient; devis: DemandeDevis[] }) {
  if (c.etape === "abandonne" || c.etape === "resilie") return null;
  const contenuArrive = Object.keys(c.contenu ?? {}).length > 0 || (c.fichiers ?? []).length > 0;
  const peutMettreEnLigne = site && c.domaine && ["valide", "domaine_achete", "en_ligne", "abonne"].includes(c.etape);
  const enLigne = site?.status === "publie";
  const petit = "rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:border-shop";
  return (
    <div className="rounded-lg border border-line px-3 py-2 text-sm">
      <p className="font-medium">Son site (Pedro)</p>
      {site ? (
        <p className="mt-1">
          {enLigne ? "En ligne : " : "Aperçu : "}
          <a href={site.url ?? "#"} target="_blank" rel="noreferrer" className="break-all font-medium text-shop hover:underline">{site.url}</a>
          {site.url && <> <Copier texte={site.url} label="Copier" /></>}
          <span className="text-muted"> · mis à jour le {formatDate(site.updated_at)}</span>
        </p>
      ) : (
        <p className="mt-1 text-muted">
          {contenuArrive ? "Pas encore de site : Pedro le prépare à partir de sa maquette, de ses infos et de ses photos." : "Pedro attend ses infos et ses photos (sa page d'accueil)."}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {(contenuArrive || site) && (
          <form action={lancerPedro}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="action" value="preparer" />
            <button type="submit" className={site ? petit : button}>{site ? "Refaire le site" : "Préparer le site"}</button>
          </form>
        )}
        {peutMettreEnLigne && (
          <form action={lancerPedro}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="action" value="en_ligne" />
            <button type="submit" className={enLigne ? petit : button}>{enLigne ? "Republier sur " : "Mettre en ligne sur "}{c.domaine}</button>
          </form>
        )}
      </div>
      {site && !c.domaine && ["valide", "domaine_achete"].includes(c.etape) && (
        <p className="mt-2 text-xs text-muted">Pour le bouton « Mettre en ligne » : note son domaine ci-dessous et enregistre.</p>
      )}
      {devis.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-muted">{devis.length} demande(s) de devis reçue(s) par son site</summary>
          <ul className="mt-1 space-y-0.5">
            {devis.slice(0, 10).map((x) => (
              <li key={x.id}>
                {formatDate(x.created_at)} · {x.nom ?? "sans nom"}{x.commune && ` (${x.commune})`} ·{" "}
                <span className={x.statut === "erreur" ? "text-[var(--t-danger-fg)]" : "text-muted"}>{statutsDevis[x.statut] ?? x.statut}</span>
                {x.erreur && <span className="text-muted"> : {x.erreur}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export default async function ClientsPage({ searchParams }: {
  searchParams: Promise<{ info?: string; erreur?: string }>;
}) {
  const { info, erreur } = await searchParams;
  const notice = messages[erreur ?? info ?? ""];

  let clients: Client[] = [];
  let candidats: { id: string; name: string; city: string | null; status: string }[] = [];
  let tablePrete = true;
  let aRattacher: PaiementStripe[] = [];
  const liensFichiers = new Map<string, string>();
  const sites = new Map<string, SiteClient>();
  const devisParSite = new Map<string, DemandeDevis[]>();
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const [c, p, pay, w, d] = await Promise.all([
      supabase.from("clients").select("*, prospects(name, city, email, category)").order("updated_at", { ascending: false }).limit(200),
      // Prospects qui peuvent devenir clients : ceux qui ont répondu ou au moins été contactés.
      supabase.from("prospects").select("id, name, city, status").in("status", ["interesse", "contacte"])
        .order("updated_at", { ascending: false }).limit(300),
      supabase.from("paiements_stripe").select("*").eq("statut", "a_rattacher").order("paye_le", { ascending: false }).limit(50),
      // Sites définitifs (Pedro) et dernières demandes de devis reçues par ces sites.
      supabase.from("websites").select("id, prospect_id, slug, url, status, updated_at, published_at")
        .eq("kind", "production").neq("status", "archive").limit(300),
      supabase.from("demandes_devis").select("id, website_id, nom, commune, statut, created_at, erreur")
        .order("created_at", { ascending: false }).limit(100),
    ]);
    for (const site of (w.data ?? []) as SiteClient[]) sites.set(site.prospect_id, site);
    for (const dem of (d.data ?? []) as DemandeDevis[]) devisParSite.set(dem.website_id, [...(devisParSite.get(dem.website_id) ?? []), dem]);
    if (c.error) tablePrete = false;
    clients = (c.data ?? []) as Client[];
    aRattacher = (pay.data ?? []) as PaiementStripe[];
    // Liens de téléchargement (valables 1 heure) des fichiers déposés par les clients en cours.
    const chemins = clients.filter((x) => x.etape !== "abandonne" && x.etape !== "resilie")
      .flatMap((x) => (x.fichiers ?? []).map((f) => f.chemin)).slice(0, 300);
    if (chemins.length > 0) {
      const { data: signes } = await supabase.storage.from("clients").createSignedUrls(chemins, 3600);
      for (const sgn of signes ?? []) if (sgn.path && sgn.signedUrl) liensFichiers.set(sgn.path, sgn.signedUrl);
    }
    candidats = (p.data ?? []).sort((a, b) => (a.status === "interesse" ? -1 : 0) - (b.status === "interesse" ? -1 : 0));
  }

  const actifs = clients.filter((c) => c.etape !== "abandonne" && c.etape !== "resilie");
  const aFaire = actifs.filter((c) => etapes[c.etape].qui === "Broise").length;

  return (
    <>
      <PageHeader
        title="Clients"
        description="Les artisans qui ont payé, de l'accueil à l'abonnement. Les paiements Stripe créent les fiches tout seuls (relève toutes les 2 heures en journée) ; chaque fiche dit quoi faire ensuite."
      />
      {notice && <p className={`mb-4 rounded-lg px-4 py-3 text-sm ${erreur ? "bg-[var(--t-danger-bg)] text-[var(--t-danger-fg)]" : "bg-shop-soft text-ink"}`}>{notice}</p>}

      {!tablePrete && (
        <Panel className="mb-6">
          <p className="px-5 py-4 text-sm">
            La table des clients n&apos;existe pas encore dans la base. Sur GitHub : <strong>Actions → « Appliquer une migration »
            → Run workflow</strong>, avec le fichier <code>20261029000000_clients.sql</code>.
          </p>
        </Panel>
      )}

      {actifs.length > 0 && (
        <p className="mb-4 text-sm text-muted">
          <span className="tabular font-medium text-ink">{actifs.length}</span> client(s) en cours, dont{" "}
          <span className="tabular font-medium text-ink">{aFaire}</span> qui attendent quelque chose de toi.
        </p>
      )}

      <Panel title="Fiches clients" className="mb-6">
        {clients.length === 0 ? (
          <EmptyState>Pas encore de client. Dès qu&apos;un artisan paie, crée sa fiche juste en dessous.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {clients.map((c) => {
              const e = etapes[c.etape];
              return (
                <li key={c.id} id={c.id} className="scroll-mt-4 space-y-3 px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{c.prospects?.name ?? "Prospect supprimé"}</p>
                      <p className="text-sm text-muted">
                        {[c.prospects?.category, c.prospects?.city].filter(Boolean).join(" · ")}
                        {c.prospects?.email && <> · <span className="break-all">{c.prospects.email}</span></>}
                      </p>
                      <p className="text-sm text-muted">
                        {formules[c.formule]} · {paiements[c.paiement]}{c.lancement && " · offre de lancement"} · payé le {formatDate(c.signe_le)}
                        {c.en_ligne_le && <> · en ligne le {formatDate(c.en_ligne_le)}</>}
                        {c.fin_engagement && <> · engagement jusqu&apos;au {formatDate(c.fin_engagement)}</>}
                      </p>
                    </div>
                    <Badge tone={e.tone}>{e.label}</Badge>
                  </div>
                  {ordreEtapes.includes(c.etape) && <Frise etape={c.etape} />}
                  {c.jeton && (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-muted">Sa page d&apos;accueil :</span>
                      <a href={lienAccueil(c.jeton)} target="_blank" rel="noreferrer" className="font-medium text-shop hover:underline">Ouvrir</a>
                      <Copier texte={lienAccueil(c.jeton)} label="Copier le lien" />
                    </div>
                  )}
                  {(Object.keys(c.contenu ?? {}).length > 0 || (c.fichiers ?? []).length > 0) && (
                    <div className="rounded-lg border border-line px-3 py-2 text-sm">
                      <p className="font-medium">
                        Ce qu&apos;il a envoyé{c.contenu_recu_le && <span className="font-normal text-muted"> (dernier envoi le {formatDate(c.contenu_recu_le)})</span>}
                      </p>
                      <dl className="mt-1 space-y-1">
                        {champsContenu.filter(([k]) => c.contenu?.[k]).map(([k, label]) => (
                          <div key={k}><dt className="inline text-muted">{label} : </dt><dd className="inline whitespace-pre-line">{c.contenu[k]}</dd></div>
                        ))}
                      </dl>
                      {(c.fichiers ?? []).length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-2">
                          {c.fichiers.map((f) => (
                            <li key={f.chemin}>
                              {liensFichiers.get(f.chemin) ? (
                                <a href={liensFichiers.get(f.chemin)} target="_blank" rel="noreferrer"
                                  className="inline-block rounded-full border border-line px-2.5 py-0.5 text-xs hover:border-shop">
                                  {f.sorte === "logo" ? "Logo" : "Photo"} · {f.legende ? `« ${f.legende} »` : f.nom}
                                </a>
                              ) : (
                                <span className="text-xs text-muted">{f.nom}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                  <SitePedro client={c} site={sites.get(c.prospect_id)} devis={devisParSite.get(sites.get(c.prospect_id)?.id ?? "") ?? []} />
                  <p className="rounded-lg bg-paper px-3 py-2 text-sm">
                    <span className="font-medium">À faire ({e.qui === "Broise" ? "toi" : e.qui === "Claude" ? "moi, Claude" : "le client"}) :</span> {e.faire}
                  </p>
                  <form action={majClient} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <input type="hidden" name="id" value={c.id} />
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium">Étape</span>
                      <select name="etape" defaultValue={c.etape} className={field}>
                        {(Object.keys(etapes) as EtapeClient[]).map((k) => <option key={k} value={k}>{etapes[k].label}</option>)}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium">Nom de domaine</span>
                      <input name="domaine" defaultValue={c.domaine ?? ""} placeholder="ex. hebert-couverture.fr" className={field} />
                    </label>
                    <label className="block text-sm sm:col-span-3">
                      <span className="mb-1 block font-medium">Notes</span>
                      <textarea name="notes" rows={2} maxLength={2000} defaultValue={c.notes ?? ""} className={field}
                        placeholder="Ex. : style chaleureux choisi, photos envoyées par WhatsApp, rappeler mardi…" />
                    </label>
                    <button type="submit" className={`${button} sm:col-start-3`}>Enregistrer</button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {aRattacher.length > 0 && (
        <Panel title="Paiements à rattacher" className="mb-6">
          <div id="paiements" className="scroll-mt-4" />
          <p className="px-4 pt-3 text-sm text-muted sm:px-5">
            Stripe a reçu ces paiements, mais l&apos;adresse e-mail ne correspond à aucun prospect. Choisis qui a payé.
          </p>
          <ul className="divide-y divide-line">
            {aRattacher.map((pay) => {
              const lien = LIENS_PAIEMENT.find((l) => l.cle === pay.cle);
              return (
                <li key={pay.id} className="space-y-3 px-4 py-4 sm:px-5">
                  <p className="text-sm">
                    <span className="font-medium">{pay.entreprise ?? "Entreprise non indiquée"}</span>
                    {pay.email && <> · <span className="break-all">{pay.email}</span></>} · {(pay.montant_cents / 100).toLocaleString("fr-FR")} €
                    {lien && <> · {lien.formule}, {lien.titre.toLowerCase()}</>} · le {formatDate(pay.paye_le)}
                  </p>
                  <div className="flex flex-wrap items-end gap-3">
                    <form action={rattacherPaiement} className="flex flex-1 flex-wrap items-end gap-3">
                      <input type="hidden" name="paiement" value={pay.id} />
                      <select name="prospect" required defaultValue="" className={`${field} min-w-56 flex-1`}>
                        <option value="" disabled>Qui a payé ?</option>
                        {[...clients.map((x) => ({ id: x.prospect_id, name: `${x.prospects?.name ?? "?"} (déjà client)` })), ...candidats]
                          .map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                      <button type="submit" className={button}>Rattacher</button>
                    </form>
                    <form action={ignorerPaiement}>
                      <input type="hidden" name="paiement" value={pay.id} />
                      <button type="submit" className="rounded-lg border border-line px-4 py-2.5 text-sm hover:bg-paper">Ignorer</button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <Panel title="Nouveau client">
        <form action={creerClient} className="grid gap-4 px-4 py-4 sm:grid-cols-2 sm:px-5">
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">Quel artisan a payé ?</span>
            <select name="prospect" required defaultValue="" className={field}>
              <option value="" disabled>Choisir dans la liste</option>
              {candidats.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.city ? ` (${p.city})` : ""}{p.status === "interesse" ? " · intéressé" : ""}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted">
              À la main, seulement si le paiement n&apos;a pas été relevé tout seul. Les intéressés d&apos;abord, puis les
              prospects contactés. L&apos;e-mail de bienvenue est préparé en même temps, à valider sur la page Inès.
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Formule</span>
            <select name="formule" required defaultValue="essentiel" className={field}>
              {Object.entries(formules).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Paiement</span>
            <select name="paiement" required defaultValue="creation" className={field}>
              {Object.entries(paiements).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="lancement" className="mt-1 h-4 w-4 accent-[var(--shop)]" />
            <span>Offre de lancement (l&apos;un des 5 premiers clients)</span>
          </label>
          <div className="sm:col-span-2">
            <button type="submit" className={button}>Créer la fiche client</button>
          </div>
        </form>
      </Panel>
    </>
  );
}
