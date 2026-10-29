import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Loader2 } from "lucide-react";
import type { Route } from "./+types/callback";
import { useLang } from "~/i18n";
import { useAuth } from "~/features/auth/AuthProvider";
import { AuthCard, FormAlert } from "~/features/auth/AuthCard";

export const meta: Route.MetaFunction = () => [{ title: "لهب LAHAB" }, { name: "robots", content: "noindex" }];

/** Email-confirmation landing page. The Supabase client completes the PKCE exchange. */
export default function AuthCallbackPage() {
  const { t } = useLang();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (session) navigate("/account", { replace: true });
  }, [session, navigate]);

  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(id);
  }, []);

  const failed = !loading && !session && (timedOut || new URLSearchParams(window.location.search).has("error"));

  return (
    <AuthCard title={failed ? t("auth.callbackFailed") : t("auth.callbackWorking")}>
      {failed ? (
        <FormAlert>{t("auth.callbackFailed")}</FormAlert>
      ) : (
        <div className="flex justify-center py-4">
          <Loader2 className="size-8 animate-spin text-ember-500" aria-label={t("common.loading")} />
        </div>
      )}
    </AuthCard>
  );
}
