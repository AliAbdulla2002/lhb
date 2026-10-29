import { Link } from "react-router";
import { Phone } from "lucide-react";
import { useLang } from "~/i18n";
import { useBranches, useSettings } from "~/lib/api/queries";
import { brand } from "~/config/brand";
import { InstagramIcon, Wordmark } from "~/ui/Brand";
import { Container } from "~/ui/Container";

export function SiteFooter() {
  const { t, pick } = useLang();
  const settings = useSettings();
  const branches = useBranches();
  const instagram = settings.data?.instagram_url ?? brand.social.instagram;

  return (
    <footer className="bg-char-950 pb-28 pt-14 text-cream-100/80 sm:pb-10">
      <Container className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Wordmark tone="light" className="text-3xl" />
          <p className="text-sm">{settings.data ? pick(settings.data, "tagline") : t("brand.tagline")}</p>
        </div>

        <nav aria-label="Footer" className="flex flex-col gap-2 text-sm">
          <Link className="hover:text-flame-400" to="/menu">{t("nav.menu")}</Link>
          <Link className="hover:text-flame-400" to="/offers">{t("nav.offers")}</Link>
          <Link className="hover:text-flame-400" to="/about">{t("nav.about")}</Link>
          <Link className="hover:text-flame-400" to="/contact">{t("nav.contact")}</Link>
        </nav>

        <address className="flex flex-col gap-2 text-sm not-italic">
          {branches.data?.map((b) => (
            <span key={b.id}>
              <strong className="font-semibold text-cream-50">{pick(b, "name")}</strong>
              {b.address_ar || b.address_en ? ` — ${pick(b, "address")}` : null}
            </span>
          ))}
          {settings.data?.phones.map((phone) => (
            <a key={phone} href={`tel:${phone}`} className="inline-flex items-center gap-2 hover:text-flame-400" dir="ltr">
              <Phone className="size-4" aria-hidden />
              {phone.replace(/^\+973/, "")}
            </a>
          ))}
        </address>

        <div className="space-y-3 text-sm">
          <p className="font-semibold text-cream-50">{t("footer.follow")}</p>
          <a href={instagram} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 hover:text-flame-400">
            <InstagramIcon className="size-4" aria-hidden /> <bdi>@lahab.bh</bdi>
          </a>
        </div>
      </Container>

      <Container className="mt-12 flex flex-col gap-3 border-t border-cream-50/10 pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
        <p>{t("footer.rights", { year: new Date().getFullYear() })}</p>
        <div className="flex gap-4">
          <Link to="/privacy" className="hover:text-flame-400">{t("footer.privacy")}</Link>
          <Link to="/terms" className="hover:text-flame-400">{t("footer.terms")}</Link>
        </div>
      </Container>
    </footer>
  );
}
