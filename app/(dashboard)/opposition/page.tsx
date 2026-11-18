// Page « Liste d'opposition » : les commerces qui ne veulent plus recevoir d'e-mails.
import type { Metadata } from "next";
import { addOpposition } from "../../admin-actions";
import { Badge, DemoTag, EmptyState, PageHeader, Panel } from "@/components/ui";
import { getData } from "@/lib/data";
import { formatDay, oppositionReason } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Liste d'opposition" };

const notices: Record<string, { tone: "success" | "danger" | "warning"; text: string }> = {
  ajoute: { tone: "success", text: "C'est noté : cette adresse ne recevra plus rien. Ses prospects sont passés en « refusé »." },
  demo: { tone: "warning", text: "Mode démo : rien n'est enregistré. Branche Supabase pour utiliser la vraie liste." },
  format: { tone: "danger", text: "Écris une adresse (nom@commerce.fr) ou un domaine (commerce.fr)." },
  doublon: { tone: "warning", text: "Cette adresse ou ce domaine est déjà sur la liste." },
  echec: { tone: "danger", text: "L'ajout a échoué. As-tu exécuté la migration « opposition_et_budget » dans Supabase ?" },
};

const toneClass = {
  success: "bg-[var(--t-success-bg)] text-[var(--t-success-fg)]",
  danger: "bg-[var(--t-danger-bg)] text-[var(--t-danger-fg)]",
  warning: "bg-[var(--t-warning-bg)] text-[var(--t-warning-fg)]",
};

const field = "w-full rounded-lg border border-line bg-paper px-3 py-2";

export default async function OppositionPage({ searchParams }: {
  searchParams: Promise<{ info?: string; erreur?: string }>;
}) {
  const { opposition } = await getData("opposition");
  const { info, erreur } = await searchParams;
  const notice = notices[erreur ?? info ?? ""];

  return (
    <>
      <PageHeader
        title="Liste d'opposition"
        description="Les commerces qui ont demandé à ne plus être contactés. La base bloque tout e-mail vers eux, même si un agent se trompe. On n'en retire jamais personne sans sa demande écrite."
      />

      {notice && (
        <p role="status" className={`mb-6 rounded-xl px-4 py-3 text-sm ${toneClass[notice.tone]}`}>{notice.text}</p>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel title="Ajouter" className="lg:col-span-2">
          <form action={addOpposition} className="space-y-4 px-4 py-4 sm:px-5">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Adresse e-mail ou domaine</span>
              <input name="cible" required placeholder="contact@commerce.fr" className={field} />
              <span className="mt-1 block text-xs text-muted">
                Un domaine (commerce.fr) bloque toutes ses adresses. Jamais gmail.com, orange.fr…
              </span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Raison</span>
              <select name="raison" defaultValue="desinscription" className={field}>
                {Object.entries(oppositionReason).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Commerce <span className="font-normal text-muted">(facultatif)</span></span>
              <input name="commerce" className={field} />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Note <span className="font-normal text-muted">(facultatif)</span></span>
              <textarea name="notes" rows={2} className={field} />
            </label>
            <button type="submit"
              className="w-full rounded-lg bg-shop px-4 py-2.5 font-semibold text-white hover:opacity-90 dark:text-[var(--paper)]">
              Ne plus contacter
            </button>
            {!isSupabaseConfigured && <p className="text-xs text-muted">Mode démo : le formulaire n&apos;enregistre rien.</p>}
          </form>
        </Panel>

        <Panel title={`${opposition.length} adresse${opposition.length > 1 ? "s" : ""} bloquée${opposition.length > 1 ? "s" : ""}`}
          className="lg:col-span-3">
          {opposition.length === 0 ? (
            <EmptyState>Personne pour l&apos;instant. Dès qu&apos;un commerce répond « stop », ajoute-le ici.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {opposition.map((o) => (
                <li key={o.id} className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {o.email ?? <>Tout le domaine <span className="font-mono">{o.domain}</span></>}
                      <DemoTag show={o.is_demo} />
                    </p>
                    <p className="text-sm text-muted">
                      {[o.business_name, `ajouté le ${formatDay(o.created_at)}`].filter(Boolean).join(" · ")}
                    </p>
                    {o.notes && <p className="text-sm text-muted">{o.notes}</p>}
                  </div>
                  <Badge tone={o.reason === "plainte" ? "danger" : "muted"}>{oppositionReason[o.reason]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
