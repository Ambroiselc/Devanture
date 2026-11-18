// Une ligne du panneau « Maquettes ouvertes » (vue d'ensemble et page Valérie).
// 9/11 : fournisseur de la boîte de l'artisan, et liens vers son e-mail (boîte mail) et sa maquette (aperçu non compté).
import Lien from "@/components/lien";
import { VisitesMaquette } from "@/components/visites-maquette";
import { formatDate } from "@/lib/format";
import type { Ouverte } from "@/lib/visites-maquettes";

export function LigneOuverture({ o }: { o: Ouverte }) {
  return (
    <li className="px-4 py-2 sm:px-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate">{o.name}{o.city && <span className="text-muted"> · {o.city}</span>}</span>
        <span className="tabular whitespace-nowrap text-xs text-muted">{o.vues}× · {formatDate(o.derniere)}</span>
      </div>
      {!!(o.fournisseur || o.emailId || o.slug || o.envois?.length) && (
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-3 text-xs text-muted">
          {o.envois && o.envois.length > 0 && (
            <span>E-mails reçus : <span className="text-ink">{o.envois.map((e) => `${e.type === "relance" ? "relance" : e.type} (${formatDate(e.sent_at)})`).join(" → ")}</span></span>
          )}
          {o.fournisseur && <span>Boîte : <span className="text-ink">{o.fournisseur}</span></span>}
          {o.emailId && <Lien href={`/boite?dossier=envoyes&m=e-${o.emailId}`} className="font-medium text-shop hover:underline">Voir l&apos;e-mail</Lien>}
          {o.slug && <a href={`/m/${o.slug}?apercu=1`} target="_blank" rel="noopener" className="font-medium text-shop hover:underline">Voir la maquette</a>}
        </p>
      )}
      <VisitesMaquette visites={o.visites} vues={o.vues} premiere={o.premiere} envois={o.envois} />
    </li>
  );
}
