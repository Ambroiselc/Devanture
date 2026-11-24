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
  const aFaire = liste.filter((a) => !a.dernierAppel && a.statut !== "refuse");
  const chauds = aFaire.filter((a) => a.chaud);
  const tiedes = aFaire.filter((a) => !a.chaud);
  const faits = liste.filter((a) => a.dernierAppel || a.statut === "refuse");

  return (
    <div className="space-y-6">
      <PageHeader title="À appeler"
        description="Les artisans qui ont ouvert leur maquette. Les « chauds » (ouverte 2 fois ou plus, ou 45 s au total) d'abord. Chaque fiche a un script d'appel préparé pour l'artisan." />
      {erreur && <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm">Lecture impossible : {erreur}</p>}
      <Panel title={`À appeler en premier (${chauds.length})`}>
        {chauds.length ? <ul className="divide-y divide-line">{chauds.map((a) => <Ligne key={a.prospectId} a={a} />)}</ul>
          : <EmptyState>Personne pour l&apos;instant.</EmptyState>}
      </Panel>
      <Panel title={`Ouverte une fois, rapidement (${tiedes.length})`}>
        {tiedes.length ? <ul className="divide-y divide-line">{tiedes.map((a) => <Ligne key={a.prospectId} a={a} />)}</ul>
          : <EmptyState>Personne.</EmptyState>}
      </Panel>
      {faits.length > 0 && (
        <Panel title={`Déjà appelés (${faits.length})`}>
          <ul className="divide-y divide-line">{faits.map((a) => <Ligne key={a.prospectId} a={a} />)}</ul>
        </Panel>
      )}
    </div>
  );
}
