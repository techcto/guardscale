// Primes/refreshes the shared cached root session at .auth/root.json.
// Run by hand with --force to ignore a still-valid cached session.
import { chromium } from 'playwright';
import { ensureAuthState, AUTH_STATE_PATH } from '../lib/auth.mjs';

const force = process.argv.includes('--force');

(async () => {
  const browser = await chromium.launch();
  await ensureAuthState(browser, { force });
  await browser.close();
  console.log('Ready:', AUTH_STATE_PATH);
})();
