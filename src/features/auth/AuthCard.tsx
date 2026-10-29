import type { ReactNode } from "react";
import { Wordmark } from "~/ui/Brand";
import { Container } from "~/ui/Container";

export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <Container className="flex justify-center py-12 sm:py-20">
      <div className="w-full max-w-md space-y-6 rounded-[var(--radius-card)] bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
        <div className="space-y-3 text-center">
          <Wordmark className="text-3xl" />
          <h1 className="text-2xl font-black">{title}</h1>
        </div>
        {children}
        {footer && <div className="border-t border-char-900/10 pt-4 text-center text-sm text-char-700">{footer}</div>}
      </div>
    </Container>
  );
}

export function FormAlert({ tone = "error", children }: { tone?: "error" | "success"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={tone === "error" ? "rounded-xl bg-ember-50 px-4 py-3 text-sm text-ember-800" : "rounded-xl bg-cream-100 px-4 py-3 text-sm text-char-800"}
    >
      {children}
    </p>
  );
}
