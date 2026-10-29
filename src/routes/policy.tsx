import { useMatches } from "react-router";
import { seo } from "~/lib/seo";
import type { Route } from "./+types/policy";
import { useLang } from "~/i18n";
import { ContentBlock } from "~/features/content/ContentBlock";
import { Container, PageHeader } from "~/ui/Container";

// Mounted twice in routes.ts with ids "privacy" and "terms".
export const meta: Route.MetaFunction = ({ location }) =>
  location.pathname === "/terms"
    ? seo({ title: "الشروط والأحكام | Terms — لهب LAHAB", path: "/terms" })
    : seo({ title: "سياسة الخصوصية | Privacy — لهب LAHAB", path: "/privacy" });

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
