import { Link } from "react-router";
import { BadgePercent } from "lucide-react";
import { useLang } from "~/i18n";
import type { Promotion } from "~/lib/api/types";
import { mediaUrl } from "~/lib/supabase";
import { formatDateTime } from "~/lib/time";

export function PromotionCard({ promotion }: { promotion: Promotion }) {
  const { t, lang, pick } = useLang();
  const image = mediaUrl(promotion.image_path);
  const body = (
    <article className="relative flex h-full min-h-48 overflow-hidden rounded-[var(--radius-card)] bg-[linear-gradient(135deg,var(--color-ember-600),var(--color-ember-800)_55%,var(--color-char-950))] p-6 text-cream-50 shadow-[var(--shadow-card)]">
      {image && <img src={image} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-35" />}
      <div className="relative flex flex-col gap-2">
        <BadgePercent className="size-7 text-flame-300" aria-hidden />
        <h3 className="text-2xl font-black">{pick(promotion, "title")}</h3>
        {pick(promotion, "body") && <p className="text-cream-100/85">{pick(promotion, "body")}</p>}
        {promotion.ends_at && (
          <p className="mt-auto pt-2 text-sm text-flame-300">{t("offers.until", { date: formatDateTime(promotion.ends_at, lang) })}</p>
        )}
        {pick(promotion, "cta_label") && <span className="mt-2 font-semibold underline underline-offset-4">{pick(promotion, "cta_label")}</span>}
      </div>
    </article>
  );
  return promotion.link_path ? (
    <Link to={promotion.link_path} className="block rounded-[var(--radius-card)] transition hover:-translate-y-0.5">
      {body}
    </Link>
  ) : (
    body
  );
}
