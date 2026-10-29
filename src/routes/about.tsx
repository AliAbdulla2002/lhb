import type { Route } from "./+types/about";
import { useLang } from "~/i18n";
import { ContentBlock } from "~/features/content/ContentBlock";
import { Container, PageHeader } from "~/ui/Container";

export const meta: Route.MetaFunction = () => [
  { title: "عن لهب | About — لهب LAHAB" },
  { name: "description", content: "تعرّف على مطعم لهب في عالي، البحرين. About Lahab restaurant in A'ali, Bahrain." },
];

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
