import { useLang } from "~/i18n";
import { env } from "~/config/env";
import { useContent } from "~/lib/api/queries";
import { BackendNotice, ErrorState, Skeleton } from "~/ui/Feedback";

/**
 * Renders owner-editable copy from site_content as plain paragraphs (no HTML is
 * interpreted, so content cannot inject markup).
 */
export function ContentBlock({ contentKey }: { contentKey: string }) {
  const { pick } = useLang();
  const content = useContent([contentKey]);
  if (!env) return <BackendNotice />;
  if (content.isError) return <ErrorState onRetry={() => content.refetch()} />;
  if (content.isPending)
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-5/6" />
        <Skeleton className="h-5 w-2/3" />
      </div>
    );
  const row = content.data[contentKey];
  const text = row ? pick(row, "value") : "";
  return (
    <div className="max-w-3xl space-y-4 text-lg leading-relaxed text-char-800">
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}
