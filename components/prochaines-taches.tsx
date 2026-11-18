// Bloc « Prochaines tâches », affiché sur la vue d'ensemble (version courte) et sur la page Tâches (version complète).
import Link from "@/components/lien";
import { Badge, EmptyState, Panel } from "@/components/ui";
import { quandLisible, type ProchaineTache } from "@/lib/prochaines-taches";
import { agentLabel, formatDate, type Tone } from "@/lib/format";
import type { Task } from "@/lib/types";

export function ProchainesTaches({ taches, enAttente = [], compact = false, className = "" }: {
  taches: ProchaineTache[];
  /** Tâches déjà créées dans la base et pas encore commencées (statut « en attente »). */
  enAttente?: Task[];
  compact?: boolean;
  className?: string;
}) {
  const maintenant = new Date();
  const actives = taches.filter((t) => t.active);
  const coupees = taches.filter((t) => !t.active);

  return (
    <Panel title="Prochaines tâches" className={className}
      action={compact ? <Link href="/taches#prochaines" className="text-sm font-medium text-shop hover:underline">Détail</Link> : undefined}>
      <div id="prochaines" className="scroll-mt-6">
        {enAttente.length > 0 && (
          <ul className="divide-y divide-line border-b border-line">
            {enAttente.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.title}</p>
                  <p className="text-sm text-muted">{agentLabel[t.agent]} · prévue le {formatDate(t.scheduled_at)}</p>
                </div>
                <Badge tone="neutral">En attente</Badge>
              </li>
            ))}
          </ul>
        )}

        {actives.length === 0 && enAttente.length === 0 ? (
          <EmptyState>Aucune tâche automatique prévue : tous les agents sont en pause.</EmptyState>
        ) : (
          <ul className="divide-y divide-line">
            {actives.map((t) => (
              <Ligne key={t.cle} t={t} maintenant={maintenant} compact={compact} />
            ))}
          </ul>
        )}

        {coupees.length > 0 && (
          compact ? (
            <p className="border-t border-line px-4 py-2 text-xs text-muted sm:px-5">
              Coupé{coupees.length > 1 ? "s" : ""} : {coupees.map((t) => t.titre).join(", ")}.
            </p>
          ) : (
            <div className="border-t border-line">
              <p className="px-4 pt-3 text-sm font-medium text-muted sm:px-5">Ne feront rien tant qu&apos;ils sont coupés</p>
              <ul className="divide-y divide-line">
                {coupees.map((t) => (
                  <Ligne key={t.cle} t={t} maintenant={maintenant} compact={false} />
                ))}
              </ul>
            </div>
          )
        )}
      </div>
    </Panel>
  );
}

function Ligne({ t, maintenant, compact }: { t: ProchaineTache; maintenant: Date; compact: boolean }) {
  const tone: Tone = !t.active ? "muted" : t.etape === "en_cours" ? "success" : t.etape === "retard" ? "warning"
    : new Date(t.prochaine).getTime() - maintenant.getTime() < 3_600_000 ? "progress" : "info";
  const badge = !t.active ? "Coupé" : t.etape === "en_cours" ? "En cours"
    : t.etape === "retard" ? `En retard · ${quandLisible(t.prochaine, maintenant)}` : quandLisible(t.prochaine, maintenant);
  const titre = t.href
    ? <Link href={t.href} className="hover:text-shop hover:underline">{t.titre}</Link>
    : t.titre;
  return (
    <li className={`flex items-start justify-between gap-3 px-4 py-3 sm:px-5 ${t.active ? "" : "opacity-70"}`}>
      <div className="min-w-0">
        <p className="font-medium">{titre}</p>
        {!compact && <p className="text-sm">{t.description}</p>}
        <p className="text-sm text-muted">{t.active ? t.rythme : t.raison}</p>
        {t.active && t.detail && <p className="text-sm text-muted">{t.detail}</p>}
        {t.active && t.etape === "retard" && (
          <p className="text-sm text-muted">GitHub ne l&apos;a pas encore lancée : elle reste ici jusqu&apos;à son vrai passage.</p>
        )}
        {t.active && t.sautee && <p className="text-sm text-muted">Le passage précédent n&apos;a pas eu lieu (GitHub l&apos;a sauté).</p>}
      </div>
      <Badge tone={tone}>{badge}</Badge>
    </li>
  );
}
