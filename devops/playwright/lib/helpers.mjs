import path from 'node:path';
import fs from 'node:fs';

export const BASE_URL = process.env.GUARDSCALE_BASE_URL || 'http://127.0.0.1';
export const ROOT_USERNAME = process.env.GUARDSCALE_ROOT_USER || 'root';
export const ROOT_PASSWORD = process.env.GUARDSCALE_ROOT_PASSWORD || 'guardscale-local-change-me';

export function makeShot(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  let i = 0;
  return async function shot(page, label, { fullPage = false } = {}) {
    i += 1;
    const file = path.join(outDir, `${String(i).padStart(2, '0')}-${label}.png`);
    await page.screenshot({ path: file, fullPage });
    console.log('screenshot:', file);
    return file;
  };
}

// Drives the real /login form (not the API directly) so this exercises the
// same cookie the browser actually stores -- a raw fetch/curl POST to
// /api/auth/login can return 200 while the browser silently drops the
// session cookie (e.g. a Secure cookie on a plain-http origin), which is
// exactly the kind of bug this suite exists to catch.
export async function login(page, username, password) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  const form = page.locator('form.login-form');
  await form.getByLabel('Email (or root username)').fill(username);
  await form.getByLabel('Password').fill(password);
  await form.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000, waitUntil: 'domcontentloaded' });
}

// Signup ends at "Verify your email" without a session. Outside AWS notification mode the API returns the
// verification link, which is returned here so a journey can open it like the emailed link.
export async function signup(page, { displayName, email, password }) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Create account' }).click();
  const form = page.locator('form.login-form');
  await form.getByLabel('Display name').fill(displayName);
  await form.getByLabel('Email', { exact: true }).fill(email);
  await form.getByLabel('Password').fill(password);
  const created = page.waitForResponse((r) => r.url().endsWith('/api/auth/signup'));
  await form.getByRole('button', { name: 'Create workspace' }).click();
  const response = await created;
  if (response.status() !== 201) throw new Error(`signup failed: ${response.status()} ${await response.text()}`);
  await page.locator('.notice', { hasText: 'Verify your email' }).waitFor();
  return (await response.json()).verifyLink;
}

export const randomEmail = (prefix = 'qa') => `${randomUsername(prefix)}@example.com`;

export function randomUsername(prefix = 'qa') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
