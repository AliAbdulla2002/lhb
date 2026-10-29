import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { Languages, Menu as MenuIcon, ShoppingBag, UserRound, X } from "lucide-react";
import { setLang, useLang } from "~/i18n";
import { useAuth } from "~/features/auth/AuthProvider";
import { useCartCount } from "~/features/cart/store";
import { ButtonLink } from "~/ui/Button";
import { Wordmark } from "~/ui/Brand";
import { Container } from "~/ui/Container";
import { cn } from "~/ui/cn";

const NAV = [
  { to: "/", key: "nav.home", end: true },
  { to: "/menu", key: "nav.menu" },
  { to: "/offers", key: "nav.offers" },
  { to: "/about", key: "nav.about" },
  { to: "/contact", key: "nav.contact" },
] as const;

export function LanguageSwitch({ className }: { className?: string }) {
  const { t, lang } = useLang();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "ar" ? "en" : "ar")}
      aria-label={t("lang.label")}
      lang={lang === "ar" ? "en" : "ar"}
      className={cn("inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium hover:bg-char-900/5", className)}
    >
      <Languages className="size-4" aria-hidden />
      {t("lang.switchTo")}
    </button>
  );
}

function CartButton() {
  const { t } = useLang();
  const count = useCartCount();
  return (
    <Link
      to="/cart"
      className="relative grid size-10 place-items-center rounded-full hover:bg-char-900/5"
      aria-label={`${t("nav.cart")}${count ? ` (${count})` : ""}`}
    >
      <ShoppingBag className="size-5" aria-hidden />
      {count > 0 && (
        <span
          aria-hidden
          className="absolute -end-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-ember-500 px-1 text-[0.7rem] font-bold leading-5 text-white motion-safe:animate-fade-up"
        >
          {count}
        </span>
      )}
    </Link>
  );
}

export function SiteHeader() {
  const { t } = useLang();
  const { user } = useAuth();
  const { pathname } = useLocation();
  // The mobile menu is open only for the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const navLink = ({ isActive }: { isActive: boolean }) =>
    cn("rounded-full px-3 py-2 text-[0.95rem] font-medium transition-colors", isActive ? "text-ember-600" : "text-char-800 hover:text-ember-600");

  return (
    <header className="sticky top-0 z-40 border-b border-char-900/5 bg-cream-50/85 backdrop-blur-md">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-3 focus:rounded-full focus:bg-char-900 focus:px-4 focus:py-2 focus:text-cream-50">
        {t("nav.skipToContent")}
      </a>
      <Container className="flex h-16 items-center gap-2">
        <Link to="/" className="me-2 text-2xl" aria-label="LAHAB لهب">
          <Wordmark />
        </Link>

        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={"end" in item} className={navLink}>
              {t(item.key)}
            </NavLink>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-1">
          {/* Wrappers own visibility: the controls' own inline-flex would override "hidden". */}
          <div className="hidden sm:block">
            <LanguageSwitch />
          </div>
          <Link
            to={user ? "/account" : "/login"}
            className="grid size-10 place-items-center rounded-full hover:bg-char-900/5"
            aria-label={user ? t("nav.account") : t("nav.login")}
          >
            <UserRound className="size-5" aria-hidden />
          </Link>
          <CartButton />
          <div className="ms-1 hidden sm:block">
            <ButtonLink to="/menu" size="sm">
              {t("nav.orderNow")}
            </ButtonLink>
          </div>
          <button
            type="button"
            className="grid size-10 place-items-center rounded-full hover:bg-char-900/5 lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? t("nav.closeMenu") : t("nav.openMenu")}
            onClick={() => setOpenOn(open ? null : pathname)}
          >
            {open ? <X className="size-5" aria-hidden /> : <MenuIcon className="size-5" aria-hidden />}
          </button>
        </div>
      </Container>

      {open && (
        <nav id="mobile-nav" aria-label="Main" className="border-t border-char-900/5 bg-cream-50 lg:hidden motion-safe:animate-fade-up">
          <Container className="flex flex-col gap-1 py-4">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={"end" in item} className={({ isActive }) => cn(navLink({ isActive }), "py-3 text-lg")}>
                {t(item.key)}
              </NavLink>
            ))}
            <div className="mt-2 flex items-center justify-between border-t border-char-900/5 pt-4">
              <LanguageSwitch />
              <ButtonLink to="/menu">{t("nav.orderNow")}</ButtonLink>
            </div>
          </Container>
        </nav>
      )}
    </header>
  );
}
