import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Route } from "./+types/login";
import { useLang } from "~/i18n";
import { env } from "~/config/env";
import { requireSupabase } from "~/lib/supabase";
import { authErrorKey, loginSchema, type LoginInput } from "~/features/auth/schemas";
import { AuthCard, FormAlert } from "~/features/auth/AuthCard";
import { Button } from "~/ui/Button";
import { InputField } from "~/ui/Field";
import { BackendNotice } from "~/ui/Feedback";

export const meta: Route.MetaFunction = () => [{ title: "تسجيل الدخول | Log in — لهب LAHAB" }, { name: "robots", content: "noindex" }];

/** Only same-site relative paths are accepted as post-login redirects. */
export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/account";
}

export default function LoginPage() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    const { error } = await requireSupabase().auth.signInWithPassword({ email: values.email.trim(), password: values.password });
    if (error) return setServerError(authErrorKey(error));
    navigate(safeNext(params.get("next")), { replace: true });
  });

  return (
    <AuthCard
      title={t("auth.loginTitle")}
      footer={
        <>
          {t("auth.noAccount")}{" "}
          <Link to="/register" className="font-semibold text-ember-600 hover:underline">
            {t("auth.submitRegister")}
          </Link>
        </>
      }
    >
      {!env && <BackendNotice />}
      {params.get("next") && <FormAlert tone="success">{t("auth.loginRequired")}</FormAlert>}
      {serverError && <FormAlert>{t(serverError)}</FormAlert>}
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <InputField label={t("auth.email")} type="email" autoComplete="email" inputMode="email" dir="ltr" error={errors.email && t(errors.email.message!)} {...form.register("email")} />
        <InputField label={t("auth.password")} type="password" autoComplete="current-password" dir="ltr" error={errors.password && t(errors.password.message!)} {...form.register("password")} />
        <div className="text-end">
          <Link to="/forgot-password" className="text-sm font-medium text-ember-600 hover:underline">
            {t("auth.forgot")}
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting} disabled={!env}>
          {t("auth.submitLogin")}
        </Button>
      </form>
    </AuthCard>
  );
}
