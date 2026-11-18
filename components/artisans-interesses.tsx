// Artisans qui ont cliqué « Oui, ça m'intéresse » sur leur maquette (13/11), en tête de la vue d'ensemble.
import { formatDate } from "@/lib/format";
import { marquerInteretTraite } from "@/app/interets-actions";
import type { Interet } from "@/lib/interets";

export function ArtisansInteresses({ interets }: { interets: Interet[] }) {
  const aTraiter = interets.filter((i) => !i.traite_le);
  if (!interets.length) return null;
  return (
    <section id="interesses" className={`mb-6 rounded-xl border px-4 py-3 sm:px-5 ${aTraiter.length ? "border-[var(--t-warning-fg)] bg-[var(--t-warning-bg)]" : "border-line bg-panel"}`}>
      <h2 className="text-sm font-semibold">
        {aTraiter.length ? `🔔 ${aTraiter.length} artisan(s) intéressé(s) à recontacter` : "Artisans intéressés"}
      </h2>
      <ul className="mt-2 divide-y divide-line text-sm">
        {interets.slice(0, 8).map((i) => (
          <li key={i.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2">
            <div className="min-w-0">
              <p>
                <span className="font-medium">{i.nom ?? "?"}</span>{i.ville && <span className="text-muted"> · {i.ville}</span>}
                {i.metier && <span className="text-muted"> · {i.metier}</span>}
              </p>
              <p className="tabular text-muted">
                {formatDate(i.cree_le)} · {i.telephone ? <a className="font-medium text-shop hover:underline" href={`tel:${i.telephone.replace(/[^0-9+]/g, "")}`}>{i.telephone}</a> : "pas de numéro"}
                {i.email && <> · {i.email}</>}
              </p>
              {i.message && <p className="text-muted">« {i.message} »</p>}
              {i.slug && <a className="text-xs text-shop hover:underline" href={`/m/${i.slug}?apercu=1`} target="_blank" rel="noopener noreferrer">Voir sa maquette</a>}
            </div>
            {i.traite_le ? (
              <span className="text-xs text-muted">traité</span>
            ) : (
              <form action={marquerInteretTraite}>
                <input type="hidden" name="id" value={i.id} />
                <button type="submit" className="rounded-lg border border-line bg-panel px-3 py-1 text-xs font-medium hover:bg-paper">Marquer traité</button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
