import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import type { Route } from "./+types/index";
import { readStoredLang, setLang, useLang } from "~/i18n";
import { requireSupabase } from "~/lib/supabase";
import type { Profile } from "~/lib/api/types";
import { RequireAuth } from "~/features/auth/RequireAuth";
import { useAuth } from "~/features/auth/AuthProvider";
import { profileSchema, type ProfileInput } from "~/features/auth/schemas";
import { FormAlert } from "~/features/auth/AuthCard";
import { Button } from "~/ui/Button";
import { Container, PageHeader } from "~/ui/Container";
import { ErrorState, Skeleton } from "~/ui/Feedback";
import { InputField, SelectField } from "~/ui/Field";
import { useToast } from "~/ui/Toast";

export const meta: Route.MetaFunction = () => [{ title: "حسابي | Account — لهب LAHAB" }, { name: "robots", content: "noindex" }];

function ProfileForm({ profile }: { profile: Profile }) {
  const { t } = useLang();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState(false);
  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: profile.full_name ?? "", phone: profile.phone ?? "", preferredLanguage: profile.preferred_language },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (raw) => {
    setServerError(false);
    const values = profileSchema.parse(raw);
    const { error } = await requireSupabase()
      .from("profiles")
      .update({ full_name: values.fullName, phone: values.phone, preferred_language: values.preferredLanguage })
      .eq("id", profile.id);
    if (error) return setServerError(true);
    setLang(values.preferredLanguage);
    await queryClient.invalidateQueries({ queryKey: ["profile"] });
    toast(t("account.saved"));
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {serverError && <FormAlert>{t("common.error")}</FormAlert>}
      <InputField label={t("auth.fullName")} autoComplete="name" error={errors.fullName && t(errors.fullName.message!)} {...form.register("fullName")} />
      <InputField label={t("auth.phone")} type="tel" dir="ltr" hint={t("auth.phoneHint")} error={errors.phone && t(errors.phone.message!)} {...form.register("phone")} />
      <SelectField label={t("account.language")} {...form.register("preferredLanguage")}>
        <option value="ar">العربية</option>
        <option value="en">English</option>
      </SelectField>
      <Button type="submit" loading={isSubmitting}>
        {isSubmitting ? t("common.saving") : t("common.save")}
      </Button>
    </form>
  );
}

function AccountContent() {
  const { t } = useLang();
  const { user, signOut } = useAuth();
  const profile = useQuery({
    queryKey: ["profile", user!.id],
    queryFn: async () => {
      const { data, error } = await requireSupabase()
        .from("profiles")
        .select("id, full_name, phone, preferred_language")
        .eq("id", user!.id)
        .single();
      if (error) throw error;
      return data as Profile;
    },
  });

  // Respect the saved preference on first load of the account page.
  const preferred = profile.data?.preferred_language;
  useEffect(() => {
    if (preferred && !readStoredLang()) setLang(preferred);
  }, [preferred]);

  return (
    <>
      <PageHeader title={t("account.title")} subtitle={user!.email} />
      <Container className="py-10">
        <section aria-labelledby="profile-title" className="max-w-lg space-y-5 rounded-[var(--radius-card)] bg-white p-6 shadow-[var(--shadow-card)]">
          <h2 id="profile-title" className="text-xl font-black">{t("account.profile")}</h2>
          {profile.isError ? (
            <ErrorState onRetry={() => profile.refetch()} />
          ) : profile.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : (
            <ProfileForm profile={profile.data} />
          )}
        </section>
        <Button variant="ghost" className="mt-6" onClick={() => void signOut()}>
          <LogOut className="size-4" aria-hidden />
          {t("auth.logout")}
        </Button>
      </Container>
    </>
  );
}

export default function AccountPage() {
  return (
    <RequireAuth>
      <AccountContent />
    </RequireAuth>
  );
}
