export function googleReversedClientScheme(clientId?: string): string;
export function isNativeGoogleAuthPlatform(platform: string): boolean;
export function googleNativeRedirectUri(input?: {
  androidClientId?: string;
  appSlug?: string;
  applicationId?: string;
}): string;
export function googleAuthSchemes(input?: {
  appSlug?: string;
  applicationId?: string;
  androidClientId?: string;
}): string[];
export function googleSignInConfigured(input?: {
  platform?: string;
  androidClientId?: string;
  webClientId?: string;
}): boolean;
export function shouldForceImplicitIdToken(platform: string): boolean;
