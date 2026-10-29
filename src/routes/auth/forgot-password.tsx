import { useState } from "react";
import { Link } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Route } from "./+types/forgot-password";
import { useLang } from "~/i18n";
import { env, siteUrl } from "~/config/env";
import { requireSupabase } from "~/lib/supabase";
import { authErrorKey, forgotSchema } from "~/features/auth/schemas";
import { AuthCard, FormAlert } from "~/features/auth/AuthCard";
import { Button } from "~/ui/Button";
import { InputField } from "~/ui/Field";
import { BackendNotice } from "~/ui/Feedback";

export const meta: Route.MetaFunction = () => [{ title: "استعادة كلمة المرور | Reset — لهب LAHAB" }, { name: "robots", content: "noindex" }];

export default function ForgotPasswordPage() {
  const { t } = useLang();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<{ email: string }>({ resolver: zodResolver(forgotSchema) });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ email }) => {
    setServerError(null);
    const { error } = await requireSupabase().auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl}/reset-password` });
    // Same message whether or not the account exists (no account enumeration).
    if (error && error.code === "over_request_rate_limit") return setServerError(authErrorKey(error));
    setSentTo(email);
  });

  return (
    <AuthCard
      title={t("auth.forgotTitle")}
      footer={
        <Link to="/login" className="font-semibold text-ember-600 hover:underline">
          {t("auth.submitLogin")}
        </Link>
      }
    >
      {!env && <BackendNotice />}
      {sentTo ? (
        <FormAlert tone="success">{t("auth.resetSent", { email: sentTo })}</FormAlert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {serverError && <FormAlert>{t(serverError)}</FormAlert>}
          <InputField label={t("auth.email")} type="email" autoComplete="email" dir="ltr" error={errors.email && t(errors.email.message!)} {...form.register("email")} />
          <Button type="submit" size="lg" className="w-full" loading={isSubmitting} disabled={!env}>
            {t("auth.submitForgot")}
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
