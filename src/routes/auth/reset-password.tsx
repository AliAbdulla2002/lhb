import { useState } from "react";
import { useNavigate } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Route } from "./+types/reset-password";
import { useLang } from "~/i18n";
import { requireSupabase } from "~/lib/supabase";
import { useAuth } from "~/features/auth/AuthProvider";
import { authErrorKey, resetSchema } from "~/features/auth/schemas";
import { AuthCard, FormAlert } from "~/features/auth/AuthCard";
import { Button } from "~/ui/Button";
import { InputField } from "~/ui/Field";
import { useToast } from "~/ui/Toast";

export const meta: Route.MetaFunction = () => [{ title: "كلمة مرور جديدة | New password — لهب LAHAB" }, { name: "robots", content: "noindex" }];

/** Reached from the reset email; the Supabase client exchanges the link code for a session. */
export default function ResetPasswordPage() {
  const { t } = useLang();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<{ password: string; confirmPassword: string }>({ resolver: zodResolver(resetSchema) });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setServerError(null);
    const { error } = await requireSupabase().auth.updateUser({ password });
    if (error) return setServerError(authErrorKey(error));
    toast(t("auth.resetDone"));
    navigate("/account", { replace: true });
  });

  return (
    <AuthCard title={t("auth.resetTitle")}>
      {!loading && !session ? (
        <FormAlert>{t("auth.callbackFailed")}</FormAlert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {serverError && <FormAlert>{t(serverError)}</FormAlert>}
          <InputField label={t("auth.newPassword")} type="password" autoComplete="new-password" dir="ltr" error={errors.password && t(errors.password.message!)} {...form.register("password")} />
          <InputField
            label={t("auth.confirmPassword")}
            type="password"
            autoComplete="new-password"
            dir="ltr"
            error={errors.confirmPassword && t(errors.confirmPassword.message!)}
            {...form.register("confirmPassword")}
          />
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting} disabled={loading}>
            {t("auth.submitReset")}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
