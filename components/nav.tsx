"use client";
// Menu de navigation : barre latérale sur ordinateur, bandeau défilant sur téléphone.
import Link from "@/components/lien";
import { usePathname } from "next/navigation";

// Ordre choisi par Broise (27/10) : vue d'ensemble, prospects, boîte mail, les agents, puis le reste.
// `groupe` : petit titre affiché (sur ordinateur) au début d'un groupe.
const links: { href: string; label: string; groupe?: string }[] = [
  { href: "/", label: "Vue d'ensemble" },
  { href: "/prospects", label: "Prospects" },
  { href: "/clients", label: "Clients" },
  { href: "/boite", label: "Boîte mail" },
  { href: "/coco", label: "Coco", groupe: "Agents" },
  { href: "/loic", label: "Loïc" },
  { href: "/sid", label: "Sid" },
  { href: "/valerie", label: "Valérie" },
  { href: "/ines", label: "Inès" },
  { href: "/pedro", label: "Pedro" },
  { href: "/campagnes", label: "Campagnes" },
  { href: "/taches", label: "Tâches" },
  { href: "/opposition", label: "Liste d'opposition" },
];

/**
 * `agentName` : le nom choisi pour l'agent de prospection (page « Loïc »).
 * `mail` : réponses à valider et messages à regarder (pastille sur la page d'Inès).
 */
export function Nav({ alerts, agentName = "Loïc", mail = 0 }: { alerts: number; agentName?: string; mail?: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigation principale" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0">
      {links.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        const lienNav = (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center justify-between gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-[15px] lg:py-1.5 transition-colors ${
              active ? "bg-shop-soft font-semibold text-shop" : "text-ink hover:bg-shop-soft/60"
            }`}
          >
            {l.href === "/loic" ? agentName : l.label}
            {l.href === "/ines" && mail > 0 && (
              <span title={`${mail} message(s) qui t'attendent`}
                className="tabular rounded-full bg-[var(--t-warning-bg)] px-1.5 text-xs font-semibold text-[var(--t-warning-fg)]">
                {mail}
              </span>
            )}
            {l.href === "/taches" && alerts > 0 && (
              <span
                title={`${alerts} erreur(s) qui demandent une action`}
                className="tabular rounded-full bg-[var(--t-danger-bg)] px-1.5 text-xs font-semibold text-[var(--t-danger-fg)]"
              >
                {alerts}
              </span>
            )}
          </Link>
        );
        if (!l.groupe) return lienNav;
        return (
          <div key={l.href} className="contents">
            <p aria-hidden className="mt-3 hidden px-3 pb-0.5 text-xs font-semibold uppercase tracking-wider text-muted lg:block">{l.groupe}</p>
            {lienNav}
          </div>
        );
      })}
    </nav>
  );
}
