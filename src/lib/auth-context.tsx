import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getSession, getUser, signIn as doSignIn, signOut as doSignOut, signUp as doSignUp, type User } from "./forum-store";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (username: string, email: string, password: string) => Promise<User>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const s = getSession();
    setUser(s ? getUser(s.userId) ?? null : null);
    setLoading(false);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "4um:session" || e.key === "4um:users") {
        const s2 = getSession();
        setUser(s2 ? getUser(s2.userId) ?? null : null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const u = await doSignIn({ email, password });
    setUser(u);
    return u;
  }, []);
  const signUp = useCallback(async (username: string, email: string, password: string) => {
    const u = await doSignUp({ username, email, password });
    setUser(u);
    return u;
  }, []);
  const signOut = useCallback(() => {
    doSignOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
