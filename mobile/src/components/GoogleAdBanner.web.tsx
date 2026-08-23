/**
 * AdMob ships native-only specs that Metro cannot bundle for web, and the runtime
 * guard in the native file is not enough because the `require` is still traversed.
 * Web resolves this variant instead, so the package never enters the web graph.
 */
export const GOOGLE_AD_BANNER_HEIGHT = 0;

export function isGoogleAdMobAvailable(): boolean {
  return false;
}

export function GoogleAdBanner(_props: { onClose: () => void }) {
  return null;
}
