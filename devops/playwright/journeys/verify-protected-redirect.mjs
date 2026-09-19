// An unauthenticated visitor must be bounced to /login for any protected
// page, and must not be bounced for /login itself.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { BASE_URL } from '../lib/helpers.mjs';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).pathname, '/login', 'unauthenticated visit to / did not redirect to /login');

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).pathname, '/login', '/login itself should not redirect');

  await context.close();
  await browser.close();
  console.log('PASS verify-protected-redirect');
})().catch((err) => {
  console.error('FAIL verify-protected-redirect:', err.message);
  process.exit(1);
});
