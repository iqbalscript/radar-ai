import type { Metadata } from "next";
import "./globals.css";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { HeaderNav } from "@/components/HeaderNav";

export const metadata: Metadata = {
  title: "RADAR AI — Brain CT Review Research Prototype",
  description:
    "Research prototype for brain CT review assistance (Meta Global AI Developer Hackathon 2026). Not for clinical use.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <DisclaimerBanner />
        <HeaderNav />
        <main id="main-content" className="main-container">
          {children}
        </main>
        <footer className="app-footer">
          <p style={{ margin: "0 0 6px 0" }}>
            <strong>RADAR AI</strong> • Meta Global AI Developer Hackathon 2026 • Sprint 1 (Epic
            RDA-4)
          </p>
          <p style={{ margin: 0 }} role="note">
            Research and demonstration prototype only. Not for clinical use. Never commit patient
            data or credentials.
          </p>
        </footer>
      </body>
    </html>
  );
}
