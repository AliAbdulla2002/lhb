import { Phone } from "lucide-react";
import { InstagramIcon } from "~/ui/Brand";
import { seo } from "~/lib/seo";
import type { Route } from "./+types/contact";
import { useLang } from "~/i18n";
import { env } from "~/config/env";
import { brand } from "~/config/brand";
import { useBranches, useSettings } from "~/lib/api/queries";
import { BranchCard } from "~/features/content/BranchCard";
import { buttonClass } from "~/ui/Button";
import { Container, PageHeader } from "~/ui/Container";
import { BackendNotice, EmptyState, ErrorState, Skeleton } from "~/ui/Feedback";

export const meta: Route.MetaFunction = () =>
  seo({ title: "التواصل والموقع | Contact — لهب LAHAB", description: "موقع مطعم لهب في عالي وأرقام التواصل. Lahab location and phone numbers.", path: "/contact" });

export default function ContactPage() {
  const { t } = useLang();
  const branches = useBranches();
  const settings = useSettings();

  return (
    <>
      <PageHeader title={t("contact.title")} />
      <Container className="grid gap-8 py-10 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-5">
          {!env ? (
            <BackendNotice />
          ) : branches.isError ? (
            <ErrorState onRetry={() => branches.refetch()} />
          ) : branches.isPending ? (
            <Skeleton className="h-80" />
          ) : branches.data.length === 0 ? (
            <EmptyState title={t("contact.noBranches")} />
          ) : (
            branches.data.map((b) => <BranchCard key={b.id} branch={b} />)
          )}
        </div>

        <aside className="space-y-3 rounded-[var(--radius-card)] bg-char-950 p-6 text-cream-50">
          {settings.data?.phones.map((phone) => (
            <a key={phone} href={`tel:${phone}`} className={buttonClass("outline-light", "md", "w-full justify-start")}>
              <Phone className="size-4" aria-hidden />
              <span dir="ltr">{phone.replace(/^\+973/, "")}</span>
            </a>
          ))}
          <a
            href={settings.data?.instagram_url ?? brand.social.instagram}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass("outline-light", "md", "w-full justify-start")}
          >
            <InstagramIcon className="size-4" aria-hidden />
            {t("contact.instagram")} · <bdi>@lahab.bh</bdi>
          </a>
        </aside>
      </Container>
    </>
  );
}
