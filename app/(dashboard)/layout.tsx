// Mise en page commune à toutes les pages du tableau de bord.
import { connection } from "next/server";
import { Suspense } from "react";
import { DefilerVers } from "@/components/defiler-vers";
import { Nav } from "@/components/nav";
import { signOut } from "../actions";
import { getAccess, getBudgetIa, getLoicSettings, getMailCount, getMenuData } from "@/lib/data";
import { aiBudget, formatEur, niveauBudget } from "@/lib/format";
import { diagnostiquer } from "@/lib/erreurs";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await connection(); // toujours afficher des données fraîches (pas de page figée au build)
  const access = await getAccess(); // null = mode démo
  // 30/10 : le menu ne charge plus toute la base (erreur Cloudflare 1102) : seulement des comptes et les tâches récentes.
  const [result, loic, mail, budgetBase] = await Promise.all([getMenuData(), getLoicSettings(), getMailCount(), getBudgetIa()]);
  // Pastille « Tâches » : seulement les échecs qui demandent une action, ces 14 derniers jours,
  // et pas déjà réglés (le même agent a retravaillé normalement depuis).
  const failedTasks = result.mode === "error" ? 0 : (() => {
    const tasks = result.data.tasks;
    const depuis = new Date(Date.now() - 14 * 86_400_000).toISOString();
    return tasks.filter((t) => {
      const date = t.finished_at ?? t.created_at;
      if (t.status !== "echouee" || date < depuis) return false;
      if (diagnostiquer(t.error_message, t.agent).gravite !== "agir") return false;
      return !tasks.some((u) => u.agent === t.agent && u.status === "terminee" && (u.finished_at ?? "") > date);
    }).length;
  })();
  // Budget du mois calculé par la base (juste, même avec des milliers de petites dépenses) ; repli en mode démo.
  const budget = budgetBase ? niveauBudget(budgetBase.spent, budgetBase.budget, budgetBase.alerte)
    : result.mode === "error" ? null
    : aiBudget(result.data.costs, result.data.settings, result.mode === "demo");

  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-b-0 lg:border-r">
        <div className="awning" aria-hidden />
        <div className="px-6 pb-4 pt-6 lg:shrink-0 lg:pb-3 lg:pt-6">
          <p className="font-display text-2xl font-semibold tracking-tight">Devanture</p>
          <p className="text-sm text-muted">Pilotage de l&apos;agence</p>
        </div>
        {/* Sur ordinateur, si l'écran est trop bas, seul le menu défile : le bloc du compte reste en bas sans le recouvrir. */}
        <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-3">
          <Nav alerts={failedTasks} agentName={loic.settings.display_name} mail={mail} />
        </div>
        <div className="hidden border-line px-6 py-4 text-sm lg:block lg:shrink-0 lg:border-t">
          {access ? (
            <form action={signOut} className="space-y-1">
              <p className="truncate text-muted" title={access.email ?? undefined}>{access.email}</p>
              <button className="font-medium text-shop hover:underline">Se déconnecter</button>
            </form>
          ) : (
            <p className="text-muted">Mode démo, sans connexion.</p>
          )}
        </div>
      </aside>

      <Suspense fallback={null}><DefilerVers /></Suspense>
      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-8 lg:px-10">
        <div className="mx-auto max-w-6xl">
          {!access && (
            <div role="status" className="mb-6 rounded-xl border border-dashed border-[var(--t-warning-fg)] bg-[var(--t-warning-bg)] px-4 py-3 text-sm text-[var(--t-warning-fg)]">
              <strong>Mode démo.</strong> Supabase n&apos;est pas encore branché : tout ce que tu vois vient
              de données fictives (lib/demo-data.ts). Remplis .env.local pour utiliser ta vraie base.
            </div>
          )}
          {access && !access.isAdmin && (
            <div role="alert" className="mb-6 rounded-xl bg-[var(--t-danger-bg)] px-4 py-3 text-sm text-[var(--t-danger-fg)]">
              <strong>Ce compte n&apos;a pas accès aux données.</strong> Ajoute-le à la table app_admins
              (voir le README, étape « Devenir administrateur »). En attendant, les listes restent vides.
            </div>
          )}
          {budget && budget.level !== "ok" && (
            <div role="alert" className={`mb-6 rounded-xl px-4 py-3 text-sm ${budget.level === "depasse"
              ? "bg-[var(--t-danger-bg)] text-[var(--t-danger-fg)]"
              : "bg-[var(--t-warning-bg)] text-[var(--t-warning-fg)]"}`}>
              <strong>{budget.level === "depasse" ? "Budget IA dépassé." : "Budget IA bientôt atteint."}</strong>{" "}
              {formatEur(budget.spent)} dépensés ce mois-ci sur {formatEur(budget.budget)} prévus
              ({Math.round(budget.ratio * 100)} %).{" "}
              {budget.level === "depasse"
                ? "Les agents doivent s'arrêter jusqu'au mois prochain, ou augmente le budget."
                : "Garde un œil sur les prochaines campagnes."}{" "}
              <a href="/#budget" className="font-medium underline">Voir le budget</a>
            </div>
          )}
          {result.mode === "error" ? (
            <div role="alert" className="rounded-xl bg-[var(--t-danger-bg)] px-4 py-3 text-sm text-[var(--t-danger-fg)]">
              <strong>Impossible de lire la base Supabase.</strong> Message : {result.message}
              <br />As-tu bien exécuté les fichiers SQL de supabase/migrations dans Supabase, dans l&apos;ordre ?
            </div>
          ) : (
            children
          )}
          {access && (
            <form action={signOut} className="mt-10 text-sm lg:hidden">
              <button className="font-medium text-shop hover:underline">Se déconnecter ({access.email})</button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
