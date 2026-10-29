import { BadgePercent } from "lucide-react";
import type { Route } from "./+types/offers";
import { useLang } from "~/i18n";
import { env } from "~/config/env";
import { usePromotions } from "~/lib/api/queries";
import { PromotionCard } from "~/features/content/PromotionCard";
import { Container, PageHeader } from "~/ui/Container";
import { BackendNotice, EmptyState, ErrorState, Skeleton } from "~/ui/Feedback";

export const meta: Route.MetaFunction = () => [
  { title: "العروض | Offers — لهب LAHAB" },
  { name: "description", content: "عروض مطعم لهب الحالية. Current Lahab offers." },
];

export default function OffersPage() {
  const { t } = useLang();
  const promotions = usePromotions();
  return (
    <>
      <PageHeader title={t("offers.title")} />
      <Container className="py-10">
        {!env ? (
          <BackendNotice />
        ) : promotions.isError ? (
          <ErrorState onRetry={() => promotions.refetch()} />
        ) : promotions.isPending ? (
          <div className="grid gap-5 md:grid-cols-2">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        ) : promotions.data.length === 0 ? (
          <EmptyState title={t("offers.empty")} icon={<BadgePercent className="size-6" aria-hidden />} />
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {promotions.data.map((p) => <PromotionCard key={p.id} promotion={p} />)}
          </div>
        )}
      </Container>
    </>
  );
}
