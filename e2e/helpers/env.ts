/** QA env vars for post-deploy Playwright runs. Copy e2e/.env.example → e2e/.env */
export function qaEnv() {
  return {
    baseUrl: process.env.QA_BASE_URL ?? 'https://ie-orbit.com',
    opsUrl: process.env.QA_OPS_URL ?? 'https://ops.ie-orbit.com',
    apiUrl: process.env.QA_API_URL ?? 'https://api.ie-orbit.com/api/v1',
    ownerEmail: process.env.QA_OWNER_EMAIL ?? '',
    ownerPassword: process.env.QA_OWNER_PASSWORD ?? '',
    customerEmail: process.env.QA_CUSTOMER_EMAIL ?? '',
    customerPassword: process.env.QA_CUSTOMER_PASSWORD ?? '',
    platformAdminEmail: process.env.QA_PLATFORM_ADMIN_EMAIL ?? '',
    platformAdminPassword: process.env.QA_PLATFORM_ADMIN_PASSWORD ?? '',
  };
}

export function requireCredentials(email: string, password: string, label: string) {
  if (!email || !password) {
    throw new Error(
      `Missing ${label} credentials. Set QA_* env vars in e2e/.env (see e2e/.env.example).`,
    );
  }
}
