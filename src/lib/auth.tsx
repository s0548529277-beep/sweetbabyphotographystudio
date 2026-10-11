import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  /** True once the admin-role lookup for the current session has settled (immediately true for a signed-out visitor, since there's nothing to look up). Separate from `loading` — a restored session resolves `loading` almost instantly, but the role query itself still takes a moment, and anything gating on "this is definitely not an admin" (e.g. site-tracking.tsx) needs to wait for this, not just for `loading`. */
  adminChecked: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const applySession = (s: Session | null) => {
      if (!mounted) return;
      setSession(s);
      setIsAdmin(false);
      if (s?.user) {
        setAdminChecked(false);
        void (async () => {
          try {
            const { data } = await supabase
              .from("user_roles")
              .select("role")
              .eq("user_id", s.user.id);
            if (!mounted) return;
            setIsAdmin(!!data?.some((r) => r.role === "admin"));
          } catch {
            if (!mounted) return;
            setIsAdmin(false);
          } finally {
            if (mounted) setAdminChecked(true);
          }
        })();
      } else {
        setAdminChecked(true);
      }
    };

    supabase.auth
      .getSession()
      .then(({ data }) => applySession(data.session))
      .catch(() => applySession(null))
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      applySession(s);
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    setSession(null);
    setIsAdmin(false);
    setAdminChecked(true);
    await supabase.auth.signOut();
  };

  return (
    <Ctx.Provider value={{ user: session?.user ?? null, session, isAdmin, adminChecked, loading, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
