import type { ShopGrowSettings } from '@ie-orbit/sdk';

export function readGrowMetadata(metadata?: Record<string, unknown> | null): ShopGrowSettings {
  const grow = metadata?.grow;
  if (grow && typeof grow === 'object') return grow as ShopGrowSettings;
  return {};
}

export function withGrowMetadata(
  metadata: Record<string, unknown> | null | undefined,
  patch: Partial<ShopGrowSettings>,
): Record<string, unknown> {
  const current = (metadata ?? {}) as Record<string, unknown>;
  const grow = readGrowMetadata(current);
  return {
    ...current,
    grow: {
      ...grow,
      ...patch,
    },
  };
}
