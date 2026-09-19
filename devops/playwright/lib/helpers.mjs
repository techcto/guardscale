import path from 'node:path';
import fs from 'node:fs';

export const BASE_URL = process.env.GUARDIAN_BASE_URL || 'http://127.0.0.1';
export const ROOT_USERNAME = process.env.GUARDIAN_ROOT_USER || 'root';
export const ROOT_PASSWORD = process.env.GUARDIAN_ROOT_PASSWORD || 'guardian-local-change-me';

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
  await form.getByLabel('Username').fill(username);
  await form.getByLabel('Password').fill(password);
  await form.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000, waitUntil: 'domcontentloaded' });
}

export async function signup(page, { displayName, username, password }) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Create account' }).click();
  const form = page.locator('form.login-form');
  await form.getByLabel('Display name').fill(displayName);
  await form.getByLabel('Username').fill(username);
  await form.getByLabel('Password').fill(password);
  await form.getByRole('button', { name: 'Create workspace' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000, waitUntil: 'domcontentloaded' });
}

export function randomUsername(prefix = 'qa') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
