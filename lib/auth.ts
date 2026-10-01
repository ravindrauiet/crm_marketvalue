// Simple shared-password login. Enabled only when APP_PASSWORD is set in the environment.
// Works in both the Edge middleware and Node route handlers (uses Web Crypto).

export const AUTH_COOKIE = 'crm_auth';
export const AUTH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export function isAuthEnabled() {
  return !!process.env.APP_PASSWORD;
}

/** Cookie value = SHA-256(password + secret). Changing APP_PASSWORD logs everyone out. */
export async function authToken(): Promise<string> {
  const secret = process.env.AUTH_SECRET || 'glomin-crm';
  const data = new TextEncoder().encode(`${process.env.APP_PASSWORD}::${secret}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string comparison */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
