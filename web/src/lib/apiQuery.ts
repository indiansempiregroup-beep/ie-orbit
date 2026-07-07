export type QueryParams = Record<string, string | number | boolean | undefined | null>;

export function normalizeQuery(query?: QueryParams): QueryParams | undefined {
  if (!query) return undefined;
  return Object.entries(query).reduce((acc, [key, value]) => {
    if (value === undefined || value === null) return acc;
    acc[key] = typeof value === 'boolean' ? (value ? 'true' : 'false') : value;
    return acc;
  }, {} as QueryParams);
}

export function scopedQuery(
  businessId: string | null | undefined,
  query?: QueryParams,
  businessParam: Record<string, string> = businessId ? { business: businessId } : {},
) {
  return normalizeQuery({ ...businessParam, ...query });
}
