import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
// Synthetic data only: run against a local SaaS-mode app with a non-AWS notification mode, so signup and resend return the
// verification link instead of emailing it. GuardScale has no account deletion API, so signed-up accounts stay in the
// fixture's in-memory DynamoDB until it stops; the cleanup below removes what the API can (the legacy membership).
const base=process.env.GUARDSCALE_TEST_URL||'http://localhost:8183';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error('This synthetic signup test is local-only');
const shots=process.env.GUARDSCALE_TEST_SCREENSHOTS;
const run=randomUUID().slice(0,8),username='synthetic-signup-'+run,password='synthetic-signup-'+randomUUID(),email=`Synthetic.Signup+${run}@Example.COM`;
const legacyName='synthetic-legacy-'+run,legacyPassword='synthetic-legacy-'+randomUUID();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
const shot=async(page,name)=>{if(shots)await page.screenshot({path:`${shots}/${name}.png`,fullPage:true})};
async function signIn(page,name,secret){await page.getByLabel('Username',{exact:true}).fill(name);await page.getByLabel('Password',{exact:true}).fill(secret);await page.locator('form').getByRole('button',{name:'Sign in',exact:true}).click()}
const cleanup=[];let api;
try{
 const root=await browser.newContext(),rootPage=await root.newPage();api=root.request;
 await rootPage.goto(base+'/login');await signIn(rootPage,process.env.GUARDSCALE_TEST_USER||'root',process.env.GUARDSCALE_TEST_PASSWORD||'test');await rootPage.waitForURL('**/console');
 const context=await browser.newContext(),page=await context.newPage();
 // The API refuses a signup without a valid email; the form marks the field required.
 for(const bad of [undefined,'not-an-email']){const r=await context.request.post(base+'/api/auth/signup',{data:{displayName:'Synthetic Signup',username:'synthetic-bad-'+run,password,email:bad}});assert.equal(r.status(),400,await r.text())}
 await page.goto(base+'/login');await page.waitForLoadState('networkidle');await page.getByRole('button',{name:'Create account'}).click();
 assert.equal(await page.getByLabel('Email').getAttribute('required'),'');
 const fill=async(name,address)=>{await page.getByLabel('Display name').fill('Synthetic Signup '+run);await page.getByLabel('Email').fill(address);await page.getByLabel('Username',{exact:true}).fill(name);await page.getByLabel('Password',{exact:true}).fill(password)};
 await fill(username,email);
 const created=page.waitForResponse(r=>r.url().endsWith('/api/auth/signup'));await page.getByRole('button',{name:'Create workspace'}).click();
 const signup=await created;assert.equal(signup.status(),201);const signupBody=await signup.json(),userId=signupBody.id;cleanup.unshift(`/api/v1/users/${userId}`);
 // Signup ends at "Verify your email" with no session.
 const notice=page.locator('.notice');await notice.getByText('Verify your email').waitFor();await shot(page,'signup-verify-notice');
 assert.equal((await context.cookies()).filter(c=>c.name==='guardscale_session').length,0,'signup does not sign in');
 // The same address, in another case, is refused in the form.
 await page.getByRole('button',{name:'Create account'}).click();await fill('synthetic-dupe-'+run,email.toUpperCase());await page.getByRole('button',{name:'Create workspace'}).click();
 await page.getByRole('alert').getByText('This email is already taken').waitFor();await shot(page,'signup-duplicate-email');
 // Signups racing for one address in DynamoDB: exactly one wins, and the losers leave no account behind.
 const race=`synthetic.race+${run}@example.com`,racers=[0,1,2].map(i=>`synthetic-race-${i}-${run}`);
 const raced=await Promise.all(racers.map(name=>api.post(base+'/api/auth/signup',{data:{displayName:name,username:name,email:race,password}})));
 for(const r of raced)if(r.status()===201)cleanup.unshift(`/api/v1/users/${(await r.json()).id}`);
 assert.deepEqual(raced.map(r=>r.status()).sort(),[201,409,409],'one signup claims the address');
 // Signing in before verifying shows the notice; a wrong password still gets the generic error.
 await page.goto(base+'/console');await page.waitForURL(u=>new URL(u).pathname==='/login');await page.waitForLoadState('networkidle');
 await signIn(page,username,'wrong-password-'+run);await page.getByRole('alert').getByText('Invalid username or password').waitFor();
 await signIn(page,username,password);await notice.getByText('Verify your email').waitFor();assert.equal(new URL(page.url()).pathname,'/login');
 // Resend inside Osirus's 25-minute cooldown says how long to wait.
 await notice.getByRole('button',{name:'Resend verification email'}).click();await notice.getByText(/Please wait\. We can send the email again in 2[45] minutes/).waitFor();await shot(page,'resend-cooldown');
 // A tampered link is refused.
 const verifyLink=signupBody.verifyLink;assert.match(verifyLink,/\/login\/verify-email\?token=/);
 const tampered=new URL(verifyLink);tampered.searchParams.set('token',tampered.searchParams.get('token').replace(/.$/,c=>c==='A'?'B':'A'));
 await page.goto(tampered.toString());await page.getByText('Verification link not valid').waitFor();await shot(page,'verify-invalid');
 // The emailed link verifies and signs the user in.
 const fresh=await browser.newContext(),freshPage=await fresh.newPage();
 await freshPage.goto(verifyLink);await freshPage.waitForURL(u=>new URL(u).pathname==='/console');await shot(freshPage,'verified-signed-in');
 assert.equal((await fresh.cookies()).filter(c=>c.name==='guardscale_session').length,1,'verifying signs in');
 await fresh.close();
 // Opening the link again does not sign anyone in: it lands on sign-in.
 const reuse=await browser.newContext(),reusePage=await reuse.newPage();
 await reusePage.goto(verifyLink);await reusePage.waitForURL('**/login?verify=done');await reusePage.getByText('Email verified').waitFor();await shot(reusePage,'verify-done');
 assert.equal((await reuse.cookies()).filter(c=>c.name==='guardscale_session').length,0,'an old link is not a reusable login');
 await signIn(reusePage,username,password);await reusePage.waitForURL(u=>new URL(u).pathname==='/console');await reuse.close();
 // Accounts made without the verification flag (before this feature, or by an organization admin) keep signing in.
 const legacy=await api.post(base+'/api/v1/users',{data:{username:legacyName,displayName:'Synthetic Legacy '+run,password:legacyPassword,role:'viewer'}});assert.equal(legacy.status(),201,await legacy.text());cleanup.unshift(`/api/v1/users/${(await legacy.json()).id}`);
 const legacyContext=await browser.newContext(),legacyPage=await legacyContext.newPage();
 await legacyPage.goto(base+'/login');await signIn(legacyPage,legacyName,legacyPassword);await legacyPage.waitForURL('**/console');await legacyContext.close();
 await context.close();
 console.log('PASS: signup requires a unique email (also under racing signups in DynamoDB), starts unverified without a session, blocks sign-in until verified, resend waits out the cooldown with the remaining time, tampered links are refused, the link signs in once, reused links do not sign in, legacy accounts keep signing in.');
}finally{
 if(api)for(const path of cleanup){const r=await api.delete(base+path,{headers:{Origin:base},data:{confirmation:'DELETE'}});if(![200,404].includes(r.status()))console.error(`cleanup ${path}: ${r.status()} ${await r.text()}`)}
 await browser.close();
}
