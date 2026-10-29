import { z } from "zod";

const schema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
  VITE_SITE_URL: z.url().default("http://localhost:5173"),
});

export type Env = z.infer<typeof schema>;

const parsed = schema.safeParse(import.meta.env);

/** Null when the app is built without backend configuration (shows a setup notice). */
export const env: Env | null = parsed.success ? parsed.data : null;

export const siteUrl = (import.meta.env.VITE_SITE_URL as string | undefined) ?? "http://localhost:5173";
