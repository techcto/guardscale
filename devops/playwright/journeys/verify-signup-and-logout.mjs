// Self-service signup should land the new user on a protected page, the
// session should survive a reload (same cookie bug this suite guards
// against), and logout should hand the browser back to /login.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { BASE_URL, signup, randomUsername } from '../lib/helpers.mjs';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const username = randomUsername('signup');
  await signup(page, { displayName: 'Playwright QA', username, password: 'correct horse battery staple' });
  assert.ok(!new URL(page.url()).pathname.startsWith('/login'), 'signup did not leave the login page');

  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.ok(!new URL(page.url()).pathname.startsWith('/login'), 'signup session did not survive a reload');

  await page.request.post(`${BASE_URL}/api/auth/logout`);
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).pathname, '/login', 'logout did not force a redirect back to /login');

  await context.close();
  await browser.close();
  console.log('PASS verify-signup-and-logout');
})().catch((err) => {
  console.error('FAIL verify-signup-and-logout:', err.message);
  process.exit(1);
});
