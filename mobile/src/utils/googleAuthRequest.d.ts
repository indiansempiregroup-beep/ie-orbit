export function googleReversedClientScheme(clientId?: string): string;
export function isNativeGoogleAuthPlatform(platform: string): boolean;
export function googleNativeRedirectUri(input?: {
  androidClientId?: string;
  applicationId?: string;
}): string;
export function googleAuthSchemes(input?: {
  appSlug?: string;
  applicationId?: string;
  androidClientId?: string;
}): string[];
export function shouldForceImplicitIdToken(platform: string): boolean;
