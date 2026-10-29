import { Clock, MapPin, Navigation, Phone } from "lucide-react";
import { useLang } from "~/i18n";
import type { Branch } from "~/lib/api/types";
import { formatTime } from "~/lib/time";
import { buttonClass } from "~/ui/Button";

/** weekday values are Sunday = 0; the list is shown starting from Saturday. */
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

export function BranchCard({ branch }: { branch: Branch }) {
  const { t, lang, pick } = useLang();
  const weekdays = t("weekday", { returnObjects: true }) as string[];
  // Only the owner-verified Maps link is used; no guessed search URLs.
  const mapsHref = branch.maps_url;

  return (
    <article className="rounded-[var(--radius-card)] bg-white p-6 shadow-[var(--shadow-card)]">
      <h3 className="text-2xl font-black">{pick(branch, "name")}</h3>
      {pick(branch, "address") && (
        <p className="mt-2 flex items-start gap-2 text-char-700">
          <MapPin className="mt-1 size-4 shrink-0 text-ember-500" aria-hidden />
          {pick(branch, "address")}
        </p>
      )}

      <div className="mt-5">
        <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-char-700">
          <Clock className="size-4 text-ember-500" aria-hidden />
          {t("contact.hours")}
        </h4>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          {WEEK_ORDER.map((day) => {
            const shifts = branch.business_hours.filter((h) => h.weekday === day);
            return (
              <div key={day} className="contents">
                <dt className="text-char-700">{weekdays[day]}</dt>
                <dd className="tabular-nums">
                  {shifts.length === 0
                    ? t("contact.closed")
                    : shifts.map((s, i) => (
                        <span key={i}>
                          {i > 0 && (lang === "ar" ? "، " : ", ")}
                          {/* bdi keeps "5:00 م" intact inside the opposite-direction range */}
                          <bdi>{formatTime(s.opens_at, lang)}</bdi> – <bdi>{formatTime(s.closes_at, lang)}</bdi>
                        </span>
                      ))}
                </dd>
              </div>
            );
          })}
        </dl>
        <p className="mt-3 text-xs text-char-700">{t("contact.hoursUnconfirmed")}</p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {mapsHref && (
          <a href={mapsHref} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "md")}>
            <Navigation className="size-4" aria-hidden />
            {t("contact.directions")}
          </a>
        )}
        {branch.phone && (
          <a href={`tel:${branch.phone}`} className={buttonClass("secondary", "md")}>
            <Phone className="size-4" aria-hidden />
            <span dir="ltr">{t("contact.call", { phone: branch.phone.replace(/^\+973/, "") })}</span>
          </a>
        )}
      </div>
    </article>
  );
}
