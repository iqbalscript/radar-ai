"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import {
  isFirebaseConfigured,
  isWebAuthRequired,
  loadStoredSession,
  refreshFirebaseSession,
  signInWithEmailPassword,
  signInWithGooglePopup,
  signOutFirebase,
} from "@/lib/firebase-auth";
import type { AuthUser } from "@/lib/firebase-auth";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  firebaseConfigured: boolean;
  authRequired: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const firebaseConfigured = isFirebaseConfigured();
  const authRequired = isWebAuthRequired();

  useEffect(() => {
    let ignore = false;
    async function restoreSession() {
      const stored = loadStoredSession();
      if (!stored) {
        if (!ignore) setLoading(false);
        return;
      }
      if (Date.now() < stored.expiresAt) {
        if (!ignore) {
          setUser(stored);
          setLoading(false);
        }
        return;
      }
      const refreshed = await refreshFirebaseSession(stored);
      if (!ignore) {
        setUser(refreshed);
        setLoading(false);
      }
    }
    void restoreSession();
    return () => {
      ignore = true;
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const signedIn = await signInWithGooglePopup();
    setUser(signedIn);
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const signedIn = await signInWithEmailPassword(email, password);
    setUser(signedIn);
  }, []);

  const signOut = useCallback(async () => {
    await signOutFirebase();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      firebaseConfigured,
      authRequired,
      signInWithGoogle,
      signInWithEmail,
      signOut,
    }),
    [
      user,
      loading,
      firebaseConfigured,
      authRequired,
      signInWithGoogle,
      signInWithEmail,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth harus digunakan di dalam AuthProvider.");
  }
  return ctx;
}

