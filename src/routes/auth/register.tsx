import { useState } from "react";
import { Link } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Route } from "./+types/register";
import { useLang } from "~/i18n";
import { env, siteUrl } from "~/config/env";
import { requireSupabase } from "~/lib/supabase";
import { authErrorKey, registerSchema, type RegisterInput } from "~/features/auth/schemas";
import { AuthCard, FormAlert } from "~/features/auth/AuthCard";
import { Button } from "~/ui/Button";
import { InputField } from "~/ui/Field";
import { BackendNotice } from "~/ui/Feedback";

export const meta: Route.MetaFunction = () => [{ title: "إنشاء حساب | Register — لهب LAHAB" }, { name: "robots", content: "noindex" }];

export default function RegisterPage() {
  const { t, lang } = useLang();
  const [serverError, setServerError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (raw) => {
    setServerError(null);
    const values = registerSchema.parse(raw);
    // Only profile fields go in metadata; roles are assigned server-side (always "customer").
    const { error } = await requireSupabase().auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { full_name: values.fullName, phone: values.phone, preferred_language: lang },
        emailRedirectTo: `${siteUrl}/auth/callback`,
      },
    });
    if (error) return setServerError(authErrorKey(error));
    setSentTo(values.email);
  });

  const err = (key?: string) => (key ? t(key) : undefined);

  return (
    <AuthCard
      title={t("auth.registerTitle")}
      footer={
        <>
          {t("auth.haveAccount")}{" "}
          <Link to="/login" className="font-semibold text-ember-600 hover:underline">
            {t("auth.submitLogin")}
          </Link>
        </>
      }
    >
      {!env && <BackendNotice />}
      {sentTo ? (
        <FormAlert tone="success">{t("auth.checkEmail", { email: sentTo })}</FormAlert>
      ) : (
        <>
          {serverError && <FormAlert>{t(serverError)}</FormAlert>}
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <InputField label={t("auth.fullName")} autoComplete="name" error={err(errors.fullName?.message)} {...form.register("fullName")} />
            <InputField label={t("auth.email")} type="email" autoComplete="email" inputMode="email" dir="ltr" error={err(errors.email?.message)} {...form.register("email")} />
            <InputField
              label={t("auth.phone")}
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              dir="ltr"
              hint={t("auth.phoneHint")}
              error={err(errors.phone?.message)}
              {...form.register("phone")}
            />
            <InputField label={t("auth.password")} type="password" autoComplete="new-password" dir="ltr" error={err(errors.password?.message)} {...form.register("password")} />
            <InputField
              label={t("auth.confirmPassword")}
              type="password"
              autoComplete="new-password"
              dir="ltr"
              error={err(errors.confirmPassword?.message)}
              {...form.register("confirmPassword")}
            />
            <Button type="submit" size="lg" className="w-full" loading={isSubmitting} disabled={!env}>
              {t("auth.submitRegister")}
            </Button>
          </form>
        </>
      )}
    </AuthCard>
  );
}
