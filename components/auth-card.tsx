// Carte commune aux pages de connexion et de mot de passe.
import type { ReactNode } from "react";

export function AuthCard({ title, intro, message, tone = "danger", children }: {
  title: string;
  intro: string;
  message?: string | null;
  tone?: "danger" | "success";
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="awning" aria-hidden />
        <div className="space-y-4 px-6 pb-6 pt-8">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted">{intro}</p>
          </div>
          {message && (
            <p role={tone === "danger" ? "alert" : "status"}
              className={`rounded-lg px-3 py-2 text-sm ${tone === "danger"
                ? "bg-[var(--t-danger-bg)] text-[var(--t-danger-fg)]"
                : "bg-[var(--t-success-bg)] text-[var(--t-success-fg)]"}`}>
              {message}
            </p>
          )}
          {children}
        </div>
      </div>
    </main>
  );
}

export const inputClass = "w-full rounded-lg border border-line bg-paper px-3 py-2";
export const buttonClass =
  "w-full rounded-lg bg-shop px-4 py-2.5 font-semibold text-white hover:opacity-90 dark:text-[var(--paper)]";
