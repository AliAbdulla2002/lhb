import type { Route } from "./+types/not-found";
import { useLang } from "~/i18n";
import { ButtonLink } from "~/ui/Button";
import { Container } from "~/ui/Container";

export const meta: Route.MetaFunction = () => [{ title: "404 — لهب LAHAB" }, { name: "robots", content: "noindex" }];

export default function NotFound() {
  const { t } = useLang();
  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center gap-4 py-16 text-center">
      <p className="font-display text-7xl font-black text-ember-500">404</p>
      <h1 className="text-3xl font-black">{t("notFound.title")}</h1>
      <p className="text-char-700">{t("notFound.body")}</p>
      <ButtonLink to="/">{t("notFound.home")}</ButtonLink>
    </Container>
  );
}
