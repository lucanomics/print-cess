export function normalizeEntityTag(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  let normalized = value.trim();
  if (normalized.startsWith("W/")) normalized = normalized.slice(2).trim();
  if (normalized.startsWith('"') && normalized.endsWith('"')) {
    normalized = normalized.slice(1, -1);
  }
  return normalized || undefined;
}
