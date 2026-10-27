"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "@/components/AuthContext";

const NAV_ITEMS = [
  { href: "/", label: "Triage Dashboard" },
  { href: "/system", label: "System & Security Status" },
];

export function HeaderNav() {
  const pathname = usePathname();
  const {
    user,
    loading,
    firebaseConfigured,
    authRequired,
    signInWithGoogle,
    signInWithEmail,
    signOut,
  } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setSubmitting(true);
    try {
      await signInWithEmail(email, password);
      setPassword("");
      setShowAuthModal(false);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : "Gagal masuk dengan email."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleLogin() {
    setAuthError("");
    setSubmitting(true);
    try {
      await signInWithGoogle();
      setShowAuthModal(false);
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : "Gagal masuk dengan Google OAuth."
      );
    } finally {
      setSubmitting(false);
    }
  }

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
          {loading ? (
            <span className="badge badge-neutral">Memeriksa sesi…</span>
          ) : user ? (
            <>
              <span className="badge badge-neutral" title={user.email ?? user.uid}>
                OAuth: {user.email ?? user.displayName ?? user.uid.slice(0, 8)}
              </span>
              <button
                type="button"
                className="button-secondary"
                onClick={() => void signOut()}
              >
                Keluar
              </button>
            </>
          ) : (
            <>
              <span className="badge badge-neutral">
                {authRequired
                  ? "Wajib Login OAuth"
                  : firebaseConfigured
                    ? "Firebase Siap"
                    : "Mode Riset Lokal"}
              </span>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setAuthError("");
                  setShowAuthModal((prev) => !prev);
                }}
              >
                {showAuthModal ? "Tutup Login" : "Login Peneliti"}
              </button>
            </>
          )}
          <span>Research prototype</span>
        </div>
      </div>

      {showAuthModal && !user && (
        <section
          aria-label="Autentikasi Peneliti Firebase OAuth"
          style={{
            maxWidth: "1200px",
            margin: "0.75rem auto 0",
            padding: "1rem 1.25rem",
            borderRadius: "0.75rem",
            border: "1px solid rgba(148, 163, 184, 0.25)",
            background: "rgba(15, 23, 42, 0.92)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "1rem",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <strong>Autentikasi Peneliti (Firebase OAuth)</strong>
              <p className="muted-copy" style={{ margin: "0.25rem 0 0" }}>
                {firebaseConfigured
                  ? "Masuk menggunakan akun Google institusi atau kredensial Firebase untuk mencatat audit trail reviewer."
                  : "Variabel NEXT_PUBLIC_FIREBASE_API_KEY belum diatur di .env.local. Tambahkan kredensial Firebase untuk mengaktifkan login OAuth penuh."}
              </p>
            </div>
            <button
              type="button"
              className="button-primary"
              disabled={submitting || !firebaseConfigured}
              onClick={() => void handleGoogleLogin()}
            >
              {submitting ? "Memproses…" : "Masuk dengan Google OAuth"}
            </button>
          </div>

          <form
            onSubmit={handleEmailSubmit}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              alignItems: "flex-end",
              marginTop: "0.85rem",
            }}
          >
            <div>
              <label htmlFor="firebase-email" style={{ display: "block", fontSize: "0.82rem" }}>
                Email Peneliti
              </label>
              <input
                id="firebase-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@telkomuniversity.ac.id"
                style={{
                  padding: "0.45rem 0.65rem",
                  borderRadius: "0.4rem",
                  border: "1px solid rgba(148, 163, 184, 0.35)",
                  background: "#0f172a",
                  color: "#f8fafc",
                }}
              />
            </div>
            <div>
              <label htmlFor="firebase-password" style={{ display: "block", fontSize: "0.82rem" }}>
                Kata Sandi
              </label>
              <input
                id="firebase-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  padding: "0.45rem 0.65rem",
                  borderRadius: "0.4rem",
                  border: "1px solid rgba(148, 163, 184, 0.35)",
                  background: "#0f172a",
                  color: "#f8fafc",
                }}
              />
            </div>
            <button
              type="submit"
              className="button-secondary"
              disabled={submitting || !firebaseConfigured}
            >
              Masuk dengan Email
            </button>
          </form>

          {authError && (
            <div className="notice notice-error" role="alert" style={{ marginTop: "0.75rem" }}>
              {authError}
            </div>
          )}
        </section>
      )}
    </header>
  );
}

