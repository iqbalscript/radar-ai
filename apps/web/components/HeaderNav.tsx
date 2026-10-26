"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Triage Dashboard" },
  { href: "/studies/00000000-0000-4000-8000-000000000001", label: "Slice Viewer" },
  { href: "/system", label: "System & Model Status" },
];

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="brand-group">
          <Link href="/" className="brand-group" aria-label="RADAR AI Home">
            <div className="brand-mark" aria-hidden="true">
              R
            </div>
            <div>
              <span className="brand-title">
                RADAR AI
                <span className="badge badge-neutral mono">CT Research</span>
              </span>
              <span className="brand-subtitle">
                Brain CT Review Assistance • Meta AI Hackathon 2026
              </span>
            </div>
          </Link>
        </div>

        <nav aria-label="Primary navigation">
          <ul className="nav-links">
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href.split("/").slice(0, 2).join("/"));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`nav-link ${isActive ? "nav-link-active" : ""}`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="header-meta">
          <span className="badge badge-success">
            <span aria-hidden="true">●</span> muse-spark-1.3
          </span>
          <span>Reviewer: Bryan C. Shine</span>
        </div>
      </div>
    </header>
  );
}
