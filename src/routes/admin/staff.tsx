import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useLang } from "~/i18n";
import { errorMessage, must } from "~/lib/errors";
import { getSupabase } from "~/lib/supabase";
import type { AppRole } from "~/features/auth/AuthProvider";
import { useAdminBranches } from "~/features/admin/hooks";
import { AdminPage, ConfirmButton, Panel, Pill } from "~/features/admin/ui";
import { Button } from "~/ui/Button";
import { ErrorState, Skeleton } from "~/ui/Feedback";
import { InputField, SelectField } from "~/ui/Field";
import { useToast } from "~/ui/Toast";

interface StaffRow {
  id: string;
  email: string;
  full_name: string | null;
  roles: AppRole[];
  branch_ids: string[];
}

const ROLES: AppRole[] = ["staff", "manager", "super_admin"];
const sb = () => getSupabase()!;

export default function AdminStaff() {
  const { t, pick } = useLang();
  const toast = useToast();
  const queryClient = useQueryClient();
  const branches = useAdminBranches();
  const staff = useQuery({ queryKey: ["admin", "staff"], queryFn: async () => must(await sb().rpc("admin_list_staff")) as StaffRow[] });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("staff");
  const [busy, setBusy] = useState(false);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast(success);
      refresh();
      return true;
    } catch (e) {
      toast(errorMessage(e, t), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const setRoleFor = (targetEmail: string, r: AppRole, grant: boolean) =>
    run(async () => must(await sb().rpc("admin_set_role", { p_email: targetEmail, p_role: r, p_grant: grant })), grant ? t("admin.staff.granted") : t("admin.staff.revoked"));
  const branchName = (id: string) => {
    const b = branches.data?.find((x) => x.id === id);
    return b ? pick(b, "name") : id.slice(0, 8);
  };

  return (
    <AdminPage title={t("admin.staff.title")}>
      <Panel title={t("admin.staff.grantTitle")}>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await setRoleFor(email.trim(), role, true)) setEmail("");
          }}
        >
          <div className="min-w-64 flex-1">
            <InputField label={t("admin.staff.email")} type="email" dir="ltr" hint={t("admin.staff.emailHint")} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="w-48">
            <SelectField label={t("admin.staff.role")} value={role} onChange={(e) => setRole(e.target.value as AppRole)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`admin.staff.roles.${r}`)}
                </option>
              ))}
            </SelectField>
          </div>
          <Button type="submit" loading={busy} disabled={!email.includes("@")}>
            {t("admin.staff.grant")}
          </Button>
        </form>
        <p className="mt-3 text-xs text-char-700/70">{t("admin.staff.staffNeedsBranch")}</p>
      </Panel>

      {staff.isError ? (
        <ErrorState message={errorMessage(staff.error, t)} onRetry={() => staff.refetch()} />
      ) : staff.isPending ? (
        <Skeleton className="h-48" />
      ) : staff.data.length === 0 ? (
        <p className="text-char-700">{t("admin.staff.none")}</p>
      ) : (
        <ul className="space-y-3">
          {staff.data.map((s) => {
            const unassigned = (branches.data ?? []).filter((b) => !s.branch_ids.includes(b.id));
            return (
              <li key={s.id} className="space-y-3 rounded-2xl border border-char-900/10 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{s.full_name ?? "—"}</p>
                  <p className="text-sm text-char-700" dir="ltr">
                    {s.email}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {s.roles
                    .filter((r) => r !== "customer")
                    .map((r) => (
                      <span key={r} className="inline-flex items-center gap-1 rounded-full bg-cream-200 py-1 ps-3 pe-1 text-xs font-semibold">
                        {t(`admin.staff.roles.${r}`)}
                        <ConfirmButton
                          label={t("admin.staff.revoke", { role: t(`admin.staff.roles.${r}`) })}
                          message={t("admin.staff.revoke", { role: t(`admin.staff.roles.${r}`) }) + ` — ${s.email}`}
                          icon={<X className="size-3.5" aria-hidden />}
                          onConfirm={() => setRoleFor(s.email, r, false)}
                        />
                      </span>
                    ))}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-char-700">{t("admin.staff.branches")}:</span>
                  {s.branch_ids.length === 0 && <Pill tone="warn">—</Pill>}
                  {s.branch_ids.map((b) => (
                    <span key={b} className="inline-flex items-center gap-1 rounded-full bg-cream-100 py-1 ps-3 pe-1 text-xs">
                      {branchName(b)}
                      <button
                        type="button"
                        aria-label={t("admin.common.delete")}
                        className="grid size-6 place-items-center rounded-full hover:bg-ember-50 hover:text-ember-700"
                        onClick={() =>
                          void run(
                            async () => must(await sb().from("staff_branch_assignments").delete().eq("user_id", s.id).eq("branch_id", b).select("user_id").single()),
                            t("admin.common.saved"),
                          )
                        }
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </span>
                  ))}
                  {unassigned.length > 0 && (
                    <select
                      aria-label={t("admin.staff.assign")}
                      className="h-8 rounded-full border border-char-900/15 bg-white px-2 text-xs"
                      value=""
                      onChange={(e) =>
                        e.target.value &&
                        void run(
                          async () => must(await sb().from("staff_branch_assignments").insert({ user_id: s.id, branch_id: e.target.value }).select("user_id").single()),
                          t("admin.common.saved"),
                        )
                      }
                    >
                      <option value="">+ {t("admin.staff.assign")}</option>
                      {unassigned.map((b) => (
                        <option key={b.id} value={b.id}>
                          {pick(b, "name")}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AdminPage>
  );
}
