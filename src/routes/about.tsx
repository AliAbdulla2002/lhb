import { seo } from "~/lib/seo";
import type { Route } from "./+types/about";
import { useLang } from "~/i18n";
import { ContentBlock } from "~/features/content/ContentBlock";
import { Container, PageHeader } from "~/ui/Container";

export const meta: Route.MetaFunction = () =>
  seo({ title: "عن لهب | About — لهب LAHAB", description: "تعرّف على مطعم لهب في عالي، البحرين. About Lahab restaurant in A'ali, Bahrain.", path: "/about" });

export default function AboutPage() {
  const { t } = useLang();
  return (
    <>
      <PageHeader title={t("about.title")} subtitle={t("brand.tagline")} />
      <Container className="py-12">
        <ContentBlock contentKey="about.body" />
      </Container>
    </>
  );
}
