import { Link } from "react-router";
import { ArrowLeft, ArrowRight, CarFront, Clock, Flame, MapPin } from "lucide-react";
import { restaurantJsonLd, seo } from "~/lib/seo";
import type { Route } from "./+types/home";
import { useLang } from "~/i18n";
import { env } from "~/config/env";
import { useBranches, useContent, useFeaturedProducts, usePromotions } from "~/lib/api/queries";
import { ProductCard, ProductCardSkeleton, ProductGrid } from "~/features/menu/ProductCard";
import { PromotionCard } from "~/features/content/PromotionCard";
import { BranchCard } from "~/features/content/BranchCard";
import { ButtonLink } from "~/ui/Button";
import { HeroEmblem } from "~/features/content/HeroEmblem";
import { Container } from "~/ui/Container";
import { BackendNotice, EmptyState, ErrorState } from "~/ui/Feedback";

export const meta: Route.MetaFunction = () => [
  ...seo({
    title: "لهب | LAHAB — شاورما أصلية في عالي، البحرين",
    description: "اطلب شاورما لهب أونلاين واستلم من سيارتك في عالي. Order Lahab shawarma online for car pickup in A'ali, Bahrain.",
    path: "/",
  }),
  restaurantJsonLd(),
];

const HERO_KEYS = ["home.hero.title", "home.hero.subtitle"];

function Hero() {
  const { t, lang, pick } = useLang();
  const content = useContent(HERO_KEYS);
  const title = content.data?.["home.hero.title"];
  const subtitle = content.data?.["home.hero.subtitle"];
  const Arrow = lang === "ar" ? ArrowLeft : ArrowRight;

  return (
    <section className="relative isolate overflow-hidden bg-char-950 text-cream-50">
      {/* Flame glow: decorative, no photography until licensed images are supplied. */}
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="absolute -bottom-1/3 start-1/2 size-[60rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--color-ember-500),transparent)] opacity-60 rtl:translate-x-1/2" />
        <div className="absolute -bottom-1/4 end-[-10%] size-[30rem] rounded-full bg-[radial-gradient(closest-side,var(--color-flame-400),transparent)] opacity-40 motion-safe:animate-flicker" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_60%,var(--color-char-950))]" />
      </div>

      {/* Phones and tablets: one centred column, emblem on top, sized to its content.
          Wide screens: text beside the emblem, filling most of the first screen. */}
      <Container className="grid grid-cols-1 content-center items-center gap-6 pb-12 pt-8 text-center sm:gap-8 sm:py-14 lg:min-h-[78svh] lg:grid-cols-[1.2fr_1fr] lg:gap-10 lg:text-start">
        <div className="space-y-5 motion-safe:animate-fade-up sm:space-y-7">
          <p className="inline-flex items-center gap-2 rounded-full border border-cream-50/15 bg-cream-50/5 px-4 py-1.5 text-sm text-flame-300">
            <MapPin className="size-4" aria-hidden />
            {t("home.why.localTitle")}
          </p>
          <h1 className="text-[clamp(2.75rem,13vw,4.5rem)] font-black leading-[1.05] sm:text-7xl">
            {title ? pick(title, "value") : t("home.why.flameTitle")}
          </h1>
          <p className="mx-auto max-w-md text-base text-cream-100/80 sm:max-w-xl sm:text-lg lg:mx-0">
            {subtitle ? pick(subtitle, "value") : t("home.why.pickupBody")}
          </p>
          <div className="mx-auto grid max-w-sm grid-cols-2 gap-3 [&>a]:whitespace-nowrap max-[359px]:gap-2 max-[359px]:[&>a]:px-3 max-[359px]:[&>a]:text-sm sm:flex sm:max-w-none sm:justify-center lg:justify-start">
            <ButtonLink to="/menu" size="lg">
              {t("home.heroCta")}
              <Arrow className="size-5" aria-hidden />
            </ButtonLink>
            <ButtonLink to="/menu" size="lg" variant="outline-light">
              {t("home.heroSecondary")}
            </ButtonLink>
          </div>
          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 pt-1 text-sm text-cream-100/70 lg:justify-start">
            {[
              { icon: Flame, label: t("home.steps.order") },
              { icon: Clock, label: t("home.steps.time") },
              { icon: CarFront, label: t("home.steps.car") },
            ].map(({ icon: Icon, label }) => (
              <li key={label} className="inline-flex items-center gap-1.5">
                <Icon className="size-4 text-flame-400" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative -order-1 lg:order-none">
          {/* Warm halo so the badge doesn't float on flat dark on small screens. */}
          <div aria-hidden className="absolute inset-[-20%] -z-10 rounded-full bg-[radial-gradient(closest-side,rgb(229_65_53/0.35),transparent)] lg:hidden" />
          <HeroEmblem />
          <span aria-hidden className="pointer-events-none absolute bottom-6 end-0 hidden font-display text-8xl font-black text-cream-50/10 lg:block">لهب</span>
        </div>
      </Container>
    </section>
  );
}

function Featured() {
  const { t } = useLang();
  const featured = useFeaturedProducts();
  return (
    <section aria-labelledby="featured-title" className="py-16 sm:py-20">
      <Container className="space-y-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="featured-title" className="text-3xl font-black sm:text-4xl">{t("home.featuredTitle")}</h2>
            <p className="mt-2 text-char-700">{t("home.featuredSubtitle")}</p>
          </div>
          <Link to="/menu" className="shrink-0 font-semibold text-ember-600 hover:underline">
            {t("nav.menu")}
          </Link>
        </div>
        {!env ? (
          <BackendNotice />
        ) : featured.isError ? (
          <ErrorState onRetry={() => featured.refetch()} />
        ) : featured.isPending ? (
          <ProductGrid>{Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} />)}</ProductGrid>
        ) : featured.data.length === 0 ? (
          <EmptyState title={t("menu.emptyAll")} />
        ) : (
          <ProductGrid>{featured.data.map((p) => <ProductCard key={p.id} product={p} />)}</ProductGrid>
        )}
      </Container>
    </section>
  );
}

function Offers() {
  const { t } = useLang();
  const promotions = usePromotions();
  if (!promotions.data?.length) return null;
  return (
    <section aria-labelledby="offers-title" className="bg-cream-100 py-16">
      <Container className="space-y-8">
        <h2 id="offers-title" className="text-3xl font-black sm:text-4xl">{t("home.offersTitle")}</h2>
        <div className="grid gap-5 md:grid-cols-2">
          {promotions.data.slice(0, 2).map((p) => <PromotionCard key={p.id} promotion={p} />)}
        </div>
      </Container>
    </section>
  );
}

function WhyLahab() {
  const { t } = useLang();
  const items = [
    { icon: Flame, title: t("home.why.flameTitle"), body: t("home.why.flameBody") },
    { icon: CarFront, title: t("home.why.pickupTitle"), body: t("home.why.pickupBody") },
    { icon: MapPin, title: t("home.why.localTitle"), body: t("home.why.localBody") },
  ];
  return (
    <section aria-labelledby="why-title" className="bg-char-950 py-16 text-cream-50 sm:py-20">
      <Container className="space-y-10">
        <h2 id="why-title" className="text-3xl font-black sm:text-4xl">{t("home.whyTitle")}</h2>
        <ul className="grid gap-5 md:grid-cols-3">
          {items.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-[var(--radius-card)] border border-cream-50/10 bg-cream-50/[0.03] p-6">
              <span className="grid size-12 place-items-center rounded-2xl bg-ember-500/15 text-flame-400">
                <Icon className="size-6" aria-hidden />
              </span>
              <h3 className="mt-4 text-xl font-bold">{title}</h3>
              <p className="mt-2 text-cream-100/70">{body}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

function Visit() {
  const { t } = useLang();
  const branches = useBranches();
  if (!branches.data?.length) return null;
  return (
    <section aria-labelledby="visit-title" className="py-16 sm:py-20">
      <Container className="space-y-8">
        <h2 id="visit-title" className="text-3xl font-black sm:text-4xl">{t("home.visitTitle")}</h2>
        <div className="grid gap-5 md:grid-cols-2">
          {branches.data.map((b) => <BranchCard key={b.id} branch={b} />)}
        </div>
      </Container>
    </section>
  );
}

export default function Home() {
  return (
    <>
      <Hero />
      <Featured />
      <Offers />
      <WhyLahab />
      <Visit />
    </>
  );
}
