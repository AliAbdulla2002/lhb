import type { ReactNode } from "react";
import { cn } from "./cn";

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="bg-char-950 pb-10 pt-12 text-cream-50 sm:pt-16">
      <Container>
        <h1 className="text-3xl font-black sm:text-5xl">{title}</h1>
        {subtitle && <p className="mt-3 max-w-2xl text-cream-100/75">{subtitle}</p>}
      </Container>
    </header>
  );
}
