import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {BASE_URL,ROOT_PASSWORD,ROOT_USERNAME,login} from '../lib/helpers.mjs';

(async()=>{
  const browser=await chromium.launch();
  const page=await browser.newPage();
  await login(page,ROOT_USERNAME,ROOT_PASSWORD);

  await page.goto(`${BASE_URL}/settings?tab=Billing`,{waitUntil:'domcontentloaded'});
  assert.equal(new URL(page.url()).pathname,'/settings/billing','legacy billing URL did not redirect to the canonical route');
  await page.getByRole('button',{name:'Current plan'}).waitFor();

  await page.goto(`${BASE_URL}/settings/billing`,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Current plan'}).waitFor();

  await browser.close();
  console.log('PASS verify-billing-route');
})().catch((err)=>{
  console.error('FAIL verify-billing-route:',err.message);
  process.exit(1);
});
