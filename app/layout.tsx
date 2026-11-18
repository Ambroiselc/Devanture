import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Devanture", template: "%s · Devanture" },
  description: "Tableau de bord de l'agence web Devanture",
  robots: { index: false, follow: false }, // outil interne : pas de référencement
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
