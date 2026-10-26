import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {BASE_URL,ROOT_PASSWORD,ROOT_USERNAME,login} from '../lib/helpers.mjs';

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
  const page=await browser.newPage();
  await login(page,ROOT_USERNAME,ROOT_PASSWORD);

  await page.goto(`${BASE_URL}/settings?tab=Billing`,{waitUntil:'domcontentloaded'});
  assert.equal(new URL(page.url()).pathname,'/settings/billing','legacy billing URL did not redirect to the canonical route');
  await page.getByRole('button',{name:'Current plan'}).waitFor();

  await page.goto(`${BASE_URL}/settings/billing`,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Current plan'}).waitFor();

  // Measured usage for the period and the opt-in overage settings (SaaS).
  const usage=page.getByRole('region',{name:'This billing period'});
  await usage.waitFor();
  for(const unit of ['Server-hours','Log MiB ingested','Guardian AI credits'])assert.equal(await usage.getByRole('cell',{name:new RegExp(unit)}).count(),1,`usage row missing: ${unit}`);
  const overage=page.getByRole('region',{name:'Usage beyond your plan'});
  await overage.waitFor();
  assert.equal(await overage.getByRole('checkbox',{name:'Allow usage beyond the plan allowance'}).isChecked(),false,'overage must be off by default');
  await overage.getByText(/\$0\.02 per active server-hour, \$0\.0015 per MiB of logs, and \$0\.003 per AI credit/).waitFor();
  await page.getByText('1,000 AI credits per billing period when Guardian AI is configured',{exact:true}).waitFor();
  await page.getByText('5,000 AI credits per billing period when Guardian AI is configured',{exact:true}).waitFor();

  await browser.close();
  console.log('PASS verify-billing-route');
})().catch((err)=>{
  console.error('FAIL verify-billing-route:',err.message);
  process.exit(1);
});
