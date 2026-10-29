import { Link, useLocation } from "react-router";
import { ShoppingBag } from "lucide-react";
import { useLang } from "~/i18n";
import { useCart } from "~/features/cart/store";
import { Price } from "~/ui/Price";

const HIDDEN_ON = ["/cart", "/checkout", "/login", "/register"];

/** Sticky mobile cart access. Totals shown are estimates; the cart page asks the server. */
export function MobileCartBar() {
  const { t } = useLang();
  const lines = useCart();
  const { pathname } = useLocation();
  const count = lines.reduce((n, l) => n + l.quantity, 0);
  if (count === 0 || HIDDEN_ON.includes(pathname)) return null;
  const estimate = lines.reduce((sum, l) => sum + l.unitEstimate * l.quantity, 0);

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 p-3 sm:hidden">
      <Link
        to="/cart"
        className="flex h-14 items-center justify-between gap-3 rounded-full bg-ember-600 px-5 font-semibold text-white shadow-[var(--shadow-glow)] motion-safe:animate-fade-up"
      >
        <span className="inline-flex items-center gap-2">
          <ShoppingBag className="size-5" aria-hidden />
          {t("cart.viewCart")} · {t("cart.itemCount", { count })}
        </span>
        <Price value={estimate} />
      </Link>
    </div>
  );
}
