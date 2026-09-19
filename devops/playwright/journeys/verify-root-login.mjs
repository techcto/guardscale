// Regression check for the "login succeeds but doesn't stick" bug: a fresh,
// cookie-less browser context logs in through the real /login form, then
// reloads. A reload forces the browser to send back whatever it actually
// persisted -- if the session cookie got marked Secure while the app was
// served over plain http, the browser silently drops it and the reload
// bounces back to /login even though the original login POST returned 200.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { BASE_URL, ROOT_USERNAME, ROOT_PASSWORD, login } from '../lib/helpers.mjs';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await login(page, ROOT_USERNAME, ROOT_PASSWORD);
  assert.ok(!new URL(page.url()).pathname.startsWith('/login'), 'login did not leave the login page');

  const cookies = await context.cookies(BASE_URL);
  const session = cookies.find((c) => c.name === 'guardian_session');
  assert.ok(session, 'guardian_session cookie was not set after login');
  assert.equal(session.httpOnly, true, 'session cookie must be HttpOnly');
  if (!BASE_URL.startsWith('https:')) {
    assert.equal(session.secure, false, 'session cookie must not be Secure on a plain-http origin, or browsers drop it');
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.ok(!new URL(page.url()).pathname.startsWith('/login'), 'session did not survive a reload -- cookie was dropped by the browser');

  await context.close();
  await browser.close();
  console.log('PASS verify-root-login');
})().catch((err) => {
  console.error('FAIL verify-root-login:', err.message);
  process.exit(1);
});
