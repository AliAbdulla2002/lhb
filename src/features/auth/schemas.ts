import { z } from "zod";

// Messages are i18n keys; forms translate them at render time.

/** Accepts 8-digit Bahrain numbers (adds +973) or international numbers with +. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s()-]/g, "");
  if (/^[0-9]{8}$/.test(digits)) return `+973${digits}`;
  if (/^(00|\+)?973[0-9]{8}$/.test(digits)) return `+973${digits.slice(-8)}`;
  if (/^\+[0-9]{8,15}$/.test(digits)) return digits;
  return null;
}

const email = z.string().trim().toLowerCase().pipe(z.email("validation.email"));
const password = z
  .string()
  .min(10, "validation.passwordMin")
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), "validation.passwordMix");
const fullName = z.string().trim().min(2, "validation.nameRequired").max(120, "validation.nameMax");
const phone = z
  .string()
  .transform((v, ctx) => {
    const normalized = normalizePhone(v);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "validation.phone" });
      return z.NEVER;
    }
    return normalized;
  });

export const loginSchema = z.object({ email, password: z.string().min(1, "validation.passwordMin") });

export const registerSchema = z
  .object({ fullName, email, phone, password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "validation.passwordMatch" });

export const forgotSchema = z.object({ email });

export const resetSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "validation.passwordMatch" });

export const profileSchema = z.object({ fullName, phone, preferredLanguage: z.enum(["ar", "en"]) });

export type LoginInput = z.input<typeof loginSchema>;
export type RegisterInput = z.input<typeof registerSchema>;
export type ProfileInput = z.input<typeof profileSchema>;

const KNOWN_AUTH_ERRORS = ["invalid_credentials", "email_not_confirmed", "user_already_exists", "weak_password", "over_request_rate_limit"];

/** Map a Supabase AuthError to a translated-message key without leaking server text. */
export function authErrorKey(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  return code && KNOWN_AUTH_ERRORS.includes(code) ? `auth.errors.${code}` : "auth.errors.generic";
}
