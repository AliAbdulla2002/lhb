import { useEffect, useState, type ReactNode } from "react";
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import type { Route } from "./+types/root";
import i18n, { dirOf, readStoredLang, setLang, useLang } from "~/i18n";
import { AuthProvider } from "~/features/auth/AuthProvider";
import { ToastProvider } from "~/ui/Toast";
import { Wordmark } from "~/ui/Brand";
import { ButtonLink } from "~/ui/Button";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Alexandria:wght@500;700;800;900&family=Readex+Pro:wght@300;400;500;600;700&display=swap",
  },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
];

export function Layout({ children }: { children: ReactNode }) {
  const { lang } = useLang();
  return (
    <html lang={lang} dir={dirOf(lang)}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#17100d" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } } }),
  );

  // Apply the visitor's saved language after hydration (prerendered HTML is Arabic).
  useEffect(() => {
    const stored = readStoredLang();
    if (stored && stored !== i18n.language) setLang(stored);
  }, []);

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <Outlet />
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}

export function HydrateFallback() {
  return (
    <div className="grid min-h-dvh place-items-center bg-char-950">
      <Wordmark tone="light" className="text-5xl" />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t } = useLang();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  if (import.meta.env.DEV && !notFound) console.error(error);
  return (
    <main className="grid min-h-dvh place-items-center bg-char-950 px-4 text-center text-cream-50">
      <div className="space-y-5">
        <Wordmark tone="light" className="text-4xl" />
        <h1 className="text-3xl font-black">{notFound ? t("notFound.title") : t("common.error")}</h1>
        {notFound && <p className="text-cream-100/70">{t("notFound.body")}</p>}
        <ButtonLink to="/">{t("notFound.home")}</ButtonLink>
      </div>
    </main>
  );
}
