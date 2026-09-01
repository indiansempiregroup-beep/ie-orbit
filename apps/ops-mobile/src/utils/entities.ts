type NamedEntity = { id: string; full_name?: string | null; display_name?: string | null; name?: string | null; email?: string | null };

export function buildNameMap<T extends NamedEntity>(items: T[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items ?? []) {
    const label =
      item.full_name?.trim() ||
      item.display_name?.trim() ||
      item.name?.trim() ||
      item.email?.trim() ||
      item.id;
    map.set(String(item.id), label);
  }
  return map;
}

export function entityLabel(map: Map<string, string>, id?: string | null, fallback = '—') {
  if (!id) return fallback;
  return map.get(String(id)) ?? fallback;
}
