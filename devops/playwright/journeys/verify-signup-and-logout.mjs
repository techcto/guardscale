// Self-service signup should stop at email verification, the emailed link should
// land the new user on a protected page, the session should survive a reload
// (same cookie bug this suite guards against), and logout should hand the
// browser back to /login. Needs a local SaaS-mode stack that returns the link.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { BASE_URL, signup, randomEmail } from '../lib/helpers.mjs';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const verifyLink = await signup(page, { displayName: 'Playwright QA', email: randomEmail('signup'), password: 'correct horse battery staple' });
  assert.equal(new URL(page.url()).pathname, '/login', 'signup must not sign in before the email is verified');
  assert.equal((await context.cookies()).filter((c) => c.name === 'guardscale_session').length, 0);
  assert.ok(verifyLink, 'the local stack must return the verification link');
  await page.goto(verifyLink, { waitUntil: 'domcontentloaded' });
  await page.waitForURL((url) => url.pathname === '/console', { timeout: 15000 });

  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.ok(!new URL(page.url()).pathname.startsWith('/login'), 'signup session did not survive a reload');

  await page.request.post(`${BASE_URL}/api/auth/logout`);
  await page.goto(`${BASE_URL}/console`, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).pathname, '/login', 'logout did not force a redirect back to /login');

  await context.close();
  await browser.close();
  console.log('PASS verify-signup-and-logout');
})().catch((err) => {
  console.error('FAIL verify-signup-and-logout:', err.message);
  process.exit(1);
});
