import { useMatches } from "react-router";
import type { Route } from "./+types/policy";
import { useLang } from "~/i18n";
import { ContentBlock } from "~/features/content/ContentBlock";
import { Container, PageHeader } from "~/ui/Container";

// Mounted twice in routes.ts with ids "privacy" and "terms".
export const meta: Route.MetaFunction = ({ location }) => [
  { title: location.pathname === "/terms" ? "الشروط والأحكام | Terms — لهب LAHAB" : "سياسة الخصوصية | Privacy — لهب LAHAB" },
];

export default function PolicyPage() {
  const { t } = useLang();
  const isTerms = useMatches().some((m) => m.id === "terms");
  return (
    <>
      <PageHeader title={isTerms ? t("policy.termsTitle") : t("policy.privacyTitle")} />
      <Container className="py-12">
        <ContentBlock contentKey={isTerms ? "policy.terms" : "policy.privacy"} />
      </Container>
    </>
  );
}
