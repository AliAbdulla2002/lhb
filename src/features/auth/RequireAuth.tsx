import { useEffect, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAuth } from "./AuthProvider";
import { Container } from "~/ui/Container";
import { Skeleton } from "~/ui/Feedback";

/**
 * Client-side gate for signed-in pages. This is a UX convenience only: the data behind
 * these pages is protected by RLS and server-side checks.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !user) navigate(`/login?next=${encodeURIComponent(location.pathname)}`, { replace: true });
  }, [loading, user, navigate, location.pathname]);

  if (loading || !user)
    return (
      <Container className="space-y-4 py-12">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </Container>
    );
  return <>{children}</>;
}
