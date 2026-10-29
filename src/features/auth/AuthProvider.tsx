import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { env } from "~/config/env";
import { getSupabase } from "~/lib/supabase";

export type AppRole = "customer" | "staff" | "manager" | "super_admin";

interface AuthState {
  /** True until the stored session has been read on the client. */
  loading: boolean;
  session: Session | null;
  user: User | null;
  /** For showing/hiding UI only. Every privileged action is re-checked server-side. */
  roles: AppRole[];
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  loading: true,
  session: null,
  user: null,
  roles: [],
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [rolesFor, setRolesFor] = useState<{ userId: string; roles: AppRole[] } | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  // Without backend configuration there is no session to wait for.
  const loading = env ? sessionLoading : false;

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let active = true;
    void sb.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data } = sb.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setSessionLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !userId) return;
    let active = true;
    void sb.rpc("my_roles").then(({ data }) => {
      if (active) setRolesFor({ userId, roles: ((data as AppRole[] | null) ?? []).filter(Boolean) });
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const signOut = async () => {
    await getSupabase()?.auth.signOut();
  };

  const roles = rolesFor && rolesFor.userId === userId ? rolesFor.roles : [];

  return (
    <AuthContext.Provider value={{ loading, session, user: session?.user ?? null, roles, signOut }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
