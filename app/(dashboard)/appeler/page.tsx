// Page « À appeler » (24/11) : les artisans qui ont ouvert leur maquette, du plus chaud au plus froid, avec leur
// téléphone et un lien vers leur fiche d'appel personnalisée. Données : lib/a-appeler.ts.
import type { Metadata } from "next";
import Lien from "@/components/lien";
import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui";
import { aAppeler, telAffiche, telLien, type AAppeler } from "@/lib/a-appeler";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { formatDate, formatSecondes } from "@/lib/format";

export const metadata: Metadata = { title: "À appeler" };

function Ligne({ a }: { a: AAppeler }) {
  const tel = telLien(a.telephone);
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <Lien href={`/appeler/${a.prospectId}`} className="font-semibold hover:underline">{a.nom}</Lien>
          {a.chaud && !a.dernierAppel && <Badge tone="warning">chaud</Badge>}
          {a.statut === "interesse" && <Badge tone="success">intéressé</Badge>}
          {a.statut === "refuse" && <Badge tone="muted">refusé</Badge>}
          {a.aEcrit && <Badge tone="info">a déjà écrit</Badge>}
        </p>
        <p className="text-sm text-muted">{[a.metier, a.ville].filter(Boolean).join(" · ")}</p>
        <p className="tabular text-xs text-muted">
          {a.vues}× ouverte{a.totalS > 0 && <> · {formatSecondes(a.totalS)} au total</>} · dernière fois {formatDate(a.derniere)}
        </p>
        {a.dernierAppel && <p className="mt-0.5 text-xs text-ink">{a.dernierAppel}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {tel
          ? <a href={tel} className="tabular rounded-lg border border-line px-3 py-2 text-sm font-semibold hover:bg-shop-soft">📞 {telAffiche(a.telephone)}</a>
          : <span className="text-sm text-muted">pas de numéro</span>}
        <Lien href={`/appeler/${a.prospectId}`}
          className="rounded-lg bg-shop px-3 py-2 text-sm font-semibold text-white hover:opacity-90 dark:text-[var(--paper)]">Script d&apos;appel</Lien>
      </div>
    </li>
  );
}

export default async function AppelerPage() {
  let liste: AAppeler[] = [];
  let erreur: string | null = null;
  if (isSupabaseConfigured) {
    try {
      liste = await aAppeler(await createClient());
    } catch (e) {
      erreur = e instanceof Error ? e.message : String(e);
    }
  }
  // 24/11 (demande de Broise) : seulement ceux qu'on peut appeler (avec un numéro), et seulement les « chauds ».
  const appelables = liste.filter((a) => telLien(a.telephone));
  // 24/11 (demande de Broise) : pas ceux qui n'ont pas encore reçu leur relance (ils réapparaissent une fois relancés).
  const relance = (a: AAppeler) => a.envois.some((e) => e.type === "relance");
  const chaudsTous = appelables.filter((a) => a.chaud && !a.dernierAppel && a.statut !== "refuse");
  const chauds = chaudsTous.filter(relance);
  const attendentRelance = chaudsTous.length - chauds.length;
  const faits = appelables.filter((a) => a.dernierAppel || a.statut === "refuse");

  return (
    <div className="space-y-6">
      <PageHeader title="À appeler"
        description="Les artisans qui ont ouvert leur maquette 2 fois ou plus, ou 45 s au total, et dont on a le numéro, une fois leur relance par e-mail partie. Du plus intéressé au moins intéressé : appelle-les dans l'ordre. Chaque fiche a un script d'appel préparé pour l'artisan." />
      {erreur && <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">Lecture impossible : {erreur}</p>}
      <Panel title={`À appeler, dans l'ordre (${chauds.length})`}>
        {chauds.length ? <ul className="divide-y divide-line">{chauds.map((a) => <Ligne key={a.prospectId} a={a} />)}</ul>
          : <EmptyState>Personne pour l&apos;instant.</EmptyState>}
        {attendentRelance > 0 && (
          <p className="border-t border-line px-4 py-3 text-sm text-muted sm:px-5">
            {attendentRelance} autre{attendentRelance > 1 ? "s" : ""} attend{attendentRelance > 1 ? "ent" : ""} encore {attendentRelance > 1 ? "leur" : "sa"} relance par e-mail : {attendentRelance > 1 ? "ils apparaîtront" : "il apparaîtra"} ici une fois relancé{attendentRelance > 1 ? "s" : ""}.
          </p>
        )}
      </Panel>
      {faits.length > 0 && (
        <Panel title={`Déjà appelés (${faits.length})`}>
          <ul className="divide-y divide-line">{faits.map((a) => <Ligne key={a.prospectId} a={a} />)}</ul>
        </Panel>
      )}
    </div>
  );
}
