import Link from "@/components/lien";
import type { ReactNode } from "react";
import type { Tone } from "@/lib/format";

const toneClass: Record<Tone, string> = {
  neutral: "bg-[var(--t-neutral-bg)] text-[var(--t-neutral-fg)]",
  info: "bg-[var(--t-info-bg)] text-[var(--t-info-fg)]",
  progress: "bg-[var(--t-progress-bg)] text-[var(--t-progress-fg)]",
  success: "bg-[var(--t-success-bg)] text-[var(--t-success-fg)]",
  warning: "bg-[var(--t-warning-bg)] text-[var(--t-warning-fg)]",
  danger: "bg-[var(--t-danger-bg)] text-[var(--t-danger-fg)]",
  muted: "bg-[var(--t-muted-bg)] text-[var(--t-muted-fg)]",
};

const dotClass: Record<Tone, string> = {
  neutral: "bg-[var(--t-neutral-fg)]",
  info: "bg-[var(--t-info-fg)]",
  progress: "bg-[var(--t-progress-fg)]",
  success: "bg-[var(--t-success-fg)]",
  warning: "bg-[var(--t-warning-fg)]",
  danger: "bg-[var(--t-danger-fg)]",
  muted: "bg-[var(--t-muted-fg)]",
};

/** Pastille de statut colorée. */
export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClass[tone]}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${dotClass[tone]}`} />
      {children}
    </span>
  );
}

/** Petite étiquette pour repérer les données fictives. */
export function DemoTag({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span title="Donnée fictive de test" className="ml-2 rounded border border-dashed border-line px-1.5 py-px align-middle text-[11px] font-medium text-muted">
      fictif
    </span>
  );
}

export function PageHeader({ title, description, children }: {
  title: string; description?: string; children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-muted">{description}</p>}
      </div>
      {children}
    </header>
  );
}

export function Panel({ title, action, children, className = "" }: {
  title?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-xl border border-line bg-surface ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-5 py-10 text-center text-sm text-muted">{children}</p>;
}

/** Onglets de filtre basés sur l'URL (?statut=…), sans JavaScript. */
export function FilterTabs({ basePath, param, current, options }: {
  basePath: string; param: string; current: string | undefined;
  options: { value: string | undefined; label: string; count: number }[];
}) {
  return (
    <nav aria-label="Filtres" className="-mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
      {options.map((o) => {
        const active = o.value === current;
        const href = o.value ? `${basePath}?${param}=${o.value}` : basePath;
        return (
          <Link
            key={o.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors ${
              active
                ? "border-shop bg-shop text-white dark:text-[var(--paper)]"
                : "border-line bg-surface text-ink hover:border-shop"
            }`}
          >
            {o.label} <span className={`tabular ml-1 ${active ? "opacity-80" : "text-muted"}`}>{o.count}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Ligne « libellé : valeur » pour les petites fiches. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
