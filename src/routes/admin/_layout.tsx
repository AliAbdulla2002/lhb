import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { ExternalLink, LogOut, Menu as MenuIcon, ShieldAlert, X } from "lucide-react";
import type { Route } from "./+types/_layout";
import { useLang } from "~/i18n";
import { env } from "~/config/env";
import { useAuth } from "~/features/auth/AuthProvider";
import { ADMIN_NAV, minRoleFor } from "~/features/admin/nav";
import { LanguageSwitch } from "~/features/layout/SiteHeader";
import { Wordmark } from "~/ui/Brand";
import { BackendNotice, Skeleton } from "~/ui/Feedback";
import { ButtonLink } from "~/ui/Button";
import { cn } from "~/ui/cn";

export const meta: Route.MetaFunction = () => [{ title: "Admin — لهب LAHAB" }, { name: "robots", content: "noindex, nofollow" }];

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useLang();
  const { hasRole } = useAuth();
  return (
    <nav aria-label={t("admin.title")} className="flex flex-col gap-1">
      {ADMIN_NAV.filter((n) => hasRole(n.min)).map(({ to, key, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              isActive ? "bg-ember-500 text-white" : "text-cream-100/80 hover:bg-cream-50/10 hover:text-cream-50",
            )
          }
        >
          <Icon className="size-4 shrink-0" aria-hidden />
          {t(`admin.nav.${key}`)}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AdminLayout() {
  const { t } = useLang();
  const { user, loading, rolesLoading, hasRole, signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [navOpenOn, setNavOpenOn] = useState<string | null>(null);
  const navOpen = navOpenOn === pathname;

  useEffect(() => {
    if (!env || loading) return;
    if (!user) navigate(`/login?next=${encodeURIComponent(pathname)}`, { replace: true });
  }, [loading, user, navigate, pathname]);

  if (!env)
    return (
      <div className="p-8">
        <BackendNotice />
      </div>
    );

  if (loading || !user || rolesLoading)
    return (
      <div className="grid min-h-dvh place-items-center bg-cream-50">
        <Skeleton className="h-10 w-40" />
      </div>
    );

  // UI gate only: every query and mutation behind these pages is authorised by RLS and
  // server-side role checks.
  const allowed = hasRole("staff") && hasRole(minRoleFor(pathname));

  return (
    <div className="min-h-dvh bg-cream-50 lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="hidden flex-col gap-6 bg-char-950 p-4 lg:flex lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto">
        <Link to="/admin" className="px-2 pt-2 text-2xl">
          <Wordmark tone="light" />
        </Link>
        <Sidebar />
        <div className="mt-auto space-y-2 border-t border-cream-50/10 pt-4 text-xs text-cream-100/60">
          <p className="truncate px-2">{t("admin.signedInAs", { email: user.email })}</p>
          <Link to="/" className="flex items-center gap-2 rounded-xl px-2 py-2 hover:text-cream-50">
            <ExternalLink className="size-4" aria-hidden />
            {t("admin.backToSite")}
          </Link>
          <button type="button" onClick={() => void signOut()} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:text-cream-50">
            <LogOut className="size-4" aria-hidden />
            {t("auth.logout")}
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-char-900/10 bg-cream-50/90 px-3 backdrop-blur lg:px-6">
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full hover:bg-char-900/5 lg:hidden"
            aria-label={navOpen ? t("admin.closeNav") : t("admin.openNav")}
            aria-expanded={navOpen}
            onClick={() => setNavOpenOn(navOpen ? null : pathname)}
          >
            {navOpen ? <X className="size-5" aria-hidden /> : <MenuIcon className="size-5" aria-hidden />}
          </button>
          <span className="font-display font-black lg:hidden">{t("admin.title")}</span>
          <div className="ms-auto">
            <LanguageSwitch />
          </div>
        </header>

        {navOpen && (
          <div className="border-b border-char-900/10 bg-char-950 p-3 lg:hidden">
            <Sidebar onNavigate={() => setNavOpenOn(null)} />
          </div>
        )}

        <main id="main">
          {allowed ? (
            <Outlet />
          ) : (
            <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-10 text-center">
              <ShieldAlert className="size-10 text-ember-500" aria-hidden />
              <h1 className="text-2xl font-black">{t("admin.noAccess")}</h1>
              <p className="text-char-700">{t("admin.noAccessBody")}</p>
              <ButtonLink to="/" variant="secondary">
                {t("admin.backToSite")}
              </ButtonLink>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
