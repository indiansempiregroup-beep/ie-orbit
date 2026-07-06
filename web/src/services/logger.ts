export const logger = {
  debug: (...args: unknown[]) => console.debug('[ie]', ...args),
  info: (...args: unknown[]) => console.info('[ie]', ...args),
  warn: (...args: unknown[]) => console.warn('[ie]', ...args),
  error: (...args: unknown[]) => console.error('[ie]', ...args),
};
