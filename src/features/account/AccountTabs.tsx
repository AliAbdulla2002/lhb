import { NavLink } from "react-router";
import { Heart, Receipt, UserRound } from "lucide-react";
import { useLang } from "~/i18n";
import { Container } from "~/ui/Container";
import { cn } from "~/ui/cn";

const TABS = [
  { to: "/account", key: "profile", icon: UserRound, end: true },
  { to: "/account/orders", key: "orders", icon: Receipt },
  { to: "/account/favorites", key: "favorites", icon: Heart },
] as const;

export function AccountTabs() {
  const { t } = useLang();
  return (
    <div className="border-b border-char-900/10 bg-white">
      <Container>
        <nav aria-label={t("account.title")} className="-mx-4 flex gap-1 overflow-x-auto px-4">
          {TABS.map(({ to, key, icon: Icon, ...rest }) => (
            <NavLink
              key={to}
              to={to}
              end={"end" in rest}
              className={({ isActive }) =>
                cn(
                  "inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition-colors",
                  isActive ? "border-ember-500 text-ember-600" : "border-transparent text-char-700 hover:text-char-900",
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {t(`accountNav.${key}`)}
            </NavLink>
          ))}
        </nav>
      </Container>
    </div>
  );
}
