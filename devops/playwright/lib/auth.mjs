import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { login, BASE_URL, ROOT_USERNAME, ROOT_PASSWORD } from './helpers.mjs';

// One shared root session, reused by journeys that just need to be
// authenticated and aren't themselves testing the login flow.
const AUTH_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.auth');
export const AUTH_STATE_PATH = path.join(AUTH_DIR, 'root.json');

export async function ensureAuthState(browser, { username = ROOT_USERNAME, password = ROOT_PASSWORD, force = false } = {}) {
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  if (!force && fs.existsSync(AUTH_STATE_PATH)) {
    const probe = await browser.newContext({ storageState: AUTH_STATE_PATH });
    const page = await probe.newPage();
    try {
      await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const stillLoggedIn = !page.url().includes('/login');
      if (stillLoggedIn) {
        console.log('auth: reusing cached session ->', AUTH_STATE_PATH);
        await probe.close();
        return AUTH_STATE_PATH;
      }
      console.log('auth: cached session expired, logging in again');
    } catch {
      console.log('auth: cached session probe failed, logging in again');
    } finally {
      await probe.close();
    }
  }

  const fresh = await browser.newContext();
  const page = await fresh.newPage();
  await login(page, username, password);
  await fresh.storageState({ path: AUTH_STATE_PATH });
  await fresh.close();
  console.log('auth: saved fresh session ->', AUTH_STATE_PATH);
  return AUTH_STATE_PATH;
}

export async function getAuthedContext(browser, { username, password, force, ...contextOptions } = {}) {
  await ensureAuthState(browser, { username, password, force });
  const context = await browser.newContext({ storageState: AUTH_STATE_PATH, ...contextOptions });
  const page = await context.newPage();
  return { context, page };
}
