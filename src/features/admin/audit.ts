const IGNORED = new Set(["updated_at", "created_at"]);

/** Field names that differ between an audit entry's before and after snapshots. */
export function changedFields(row: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }): string[] {
  if (!row.before || !row.after) return [];
  const keys = new Set([...Object.keys(row.before), ...Object.keys(row.after)]);
  return [...keys].filter((k) => !IGNORED.has(k) && JSON.stringify(row.before![k]) !== JSON.stringify(row.after![k]));
}
