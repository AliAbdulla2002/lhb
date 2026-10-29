import { formatBHD } from "~/lib/money";
import { useLang } from "~/i18n";
import { cn } from "./cn";

export function Price({ value, className }: { value: number | string; className?: string }) {
  const { lang } = useLang();
  return <span className={cn("tabular-nums whitespace-nowrap", className)}>{formatBHD(value, lang)}</span>;
}
