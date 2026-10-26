import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
// Synthetic data only: run against the local SaaS-mode fixture with a non-AWS notification mode, so signup and
// forgot-password return their links instead of emailing them.
const base=process.env.GUARDSCALE_TEST_URL??'http://localhost:8183';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('This synthetic admin test is local-only');
const shots=process.env.GUARDSCALE_TEST_SCREENSHOTS;
const run=randomUUID().slice(0,8),orgName='Synthetic admin E2E '+run,userName='synthetic-admin-viewer-'+run+'@example.com',userPassword='synthetic-viewer-'+randomUUID();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH});
async function login(page,username,password){await page.goto(base+'/login');await page.getByLabel('Email (or root username)',{exact:true}).fill(username);await page.getByLabel('Password',{exact:true}).fill(password);await page.locator('form').getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/console')}
const shot=async(page,name)=>{if(shots)await page.screenshot({path:`${shots}/${name}.png`,fullPage:true})};
const token=link=>new URL(link).searchParams.get('token');
const context=await browser.newContext(),api=context.request;
// Everything the run creates; a failed run deletes what is left through the same Delete APIs (users first, then the organization).
const cleanup=[];
try{
 const page=await context.newPage();
 await login(page,process.env.GUARDSCALE_TEST_USER??'root',process.env.GUARDSCALE_TEST_PASSWORD??'test');
 await page.goto(base+'/admin');await page.waitForURL('**/admin/organizations');
 const nav=page.getByRole('navigation',{name:'Admin navigation'});
 for(const item of ['Organizations','Users','Servers','Settings'])await nav.getByRole('link',{name:item,exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:/Add organization/}).count(),0,'admin only views and deletes organizations');
 // Seed an organization, a verified member and a server through the product's own APIs.
 const created=await api.post(base+'/api/orgs',{data:{name:orgName}});assert.equal(created.status(),201,await created.text());
 const orgId=(await created.json()).id;cleanup.push(`/api/orgs/${orgId}`);
 assert.equal((await api.post(base+'/api/orgs/active',{data:{orgId}})).status(),200);
 const seed=await browser.newContext();
 const seeded=await seed.request.post(base+'/api/auth/signup',{data:{displayName:'Synthetic Admin Viewer',email:userName,password:userPassword}});assert.equal(seeded.status(),201,await seeded.text());const seededBody=await seeded.json();cleanup.unshift(`/api/v1/users/${seededBody.id}`);
 assert.equal((await seed.request.post(base+'/api/auth/verify-email',{data:{token:token(seededBody.verifyLink)}})).status(),200);
 await seed.close();
 // Add user admits an existing account by email.
 const member=await api.post(base+'/api/v1/users',{headers:{Origin:base},data:{email:userName,role:'viewer'}});assert.equal(member.status(),201,await member.text());const userId=(await member.json()).id;
 assert.equal(userId,seededBody.id);
 const {tenantId,enrollmentToken}=await (await api.get(base+'/api/v1/nodes/enrollment')).json();assert.equal(tenantId,orgId);
 const serverId='synthetic-srv-'+run,serverName='Synthetic server '+run,agent=`Bearer ${tenantId}.synthetic-agent-${run}.${enrollmentToken}`;
 assert.equal((await api.post(base+'/api/v1/agents/heartbeat',{headers:{authorization:agent},data:{server_id:serverId,platform:'amd64',display_name:serverName}})).status(),202);
 // Organization detail.
 await page.goto(base+'/admin/organizations');await page.getByRole('link',{name:new RegExp(orgName)}).click();await page.waitForURL(`**/admin/organizations/${orgId}`);
 await page.getByRole('link',{name:/Synthetic Admin Viewer/}).waitFor();await page.getByRole('link',{name:new RegExp(serverName)}).first().waitFor();await shot(page,'organization-detail');
 // Users: list -> detail.
 await nav.getByRole('link',{name:'Users',exact:true}).click();await page.waitForURL('**/admin/users');
 await page.getByRole('link',{name:/Synthetic Admin Viewer/}).first().click();await page.waitForURL('**/admin/users/'+userId);
 await page.locator('.admin-header-title',{hasText:'Synthetic Admin Viewer'}).waitFor();await page.getByRole('link',{name:new RegExp(orgName)}).first().waitFor();await shot(page,'user-detail');
 // Servers: list -> detail.
 await nav.getByRole('link',{name:'Servers',exact:true}).click();await page.waitForURL('**/admin/servers');
 await page.getByRole('link',{name:new RegExp(serverName)}).first().click();await page.waitForURL(`**/admin/servers/${orgId}/*`);
 await page.locator('.admin-header-title',{hasText:serverName}).waitFor();await shot(page,'server-detail');
 const serverPath=new URL(page.url()).pathname;
 for(const path of ['/admin/servers',serverPath,`/admin/organizations/${orgId}`,`/admin/users/${userId}`]){await page.goto(base+path);assert.ok(!(await page.content()).includes(enrollmentToken),path+' must not expose the enrollment token')}
 await nav.getByRole('link',{name:'Settings',exact:true}).click();await page.waitForURL('**/admin/settings');await page.locator('.admin-header-title',{hasText:'Settings'}).waitFor();
 // Non-root members cannot open admin pages.
 const viewer=await browser.newContext(),viewerPage=await viewer.newPage();
 await login(viewerPage,userName,userPassword);
 for(const path of ['/admin/organizations',serverPath]){await viewerPage.goto(base+path);await viewerPage.waitForURL('**/settings')}
 await viewer.close();
 // Every internal link on the admin and settings pages resolves.
 const seen=new Set();
 for(const path of ['/admin/organizations',`/admin/organizations/${orgId}`,'/admin/users',`/admin/users/${userId}`,'/admin/servers',serverPath,'/admin/settings','/settings']){
  await page.goto(base+path);
  for(const href of await page.locator('a[href^="/"]').evaluateAll(as=>as.map(a=>a.getAttribute('href')))){if(seen.has(href))continue;seen.add(href);const r=await api.get(base+href,{maxRedirects:0});assert.ok(r.status()<400,`${path} links to ${href}: ${r.status()}`)}
 }
 // Forgot password: login link -> request -> reset link -> new password works; a page without a token offers a new link.
 const selfName='synthetic-self-'+run+'@example.com',selfPassword='synthetic-self-'+randomUUID(),newPassword='synthetic-reset-'+randomUUID();
 const self=await browser.newContext(),selfPage=await self.newPage();
 const signup=await self.request.post(base+'/api/auth/signup',{data:{displayName:'Synthetic Self Delete '+run,email:selfName,password:selfPassword}});assert.equal(signup.status(),201);const signupBody=await signup.json();cleanup.unshift(`/api/v1/users/${signupBody.id}`);
 assert.equal((await self.request.post(base+'/api/auth/verify-email',{data:{token:token(signupBody.verifyLink)}})).status(),200,'verify the new account before signing in');
 await self.clearCookies();
 await selfPage.goto(base+'/login');await selfPage.getByRole('link',{name:'Forgot password?'}).click();await selfPage.waitForURL('**/login/forgot-password');await selfPage.waitForLoadState('networkidle');
 await selfPage.getByLabel('Email',{exact:true}).fill(selfName);await selfPage.getByRole('button',{name:'Send reset link'}).click();
 await selfPage.getByText('Check your email').waitFor();await selfPage.locator('.notice a').click();await selfPage.waitForURL('**/login/reset-password?token=*');await selfPage.waitForLoadState('networkidle');
 await selfPage.getByLabel('New password').fill(newPassword);await selfPage.getByRole('button',{name:'Set new password'}).click();await selfPage.waitForURL(u=>new URL(u).pathname==='/login');
 await login(selfPage,selfName,newPassword);
 assert.equal((await self.request.post(base+'/api/auth/login',{data:{email:selfName,password:selfPassword}})).status(),401,'the old password stops working');
 await selfPage.goto(base+'/login/reset-password');await selfPage.getByRole('link',{name:'Request a new one.'}).click();await selfPage.waitForURL('**/login/forgot-password');
 await selfPage.getByRole('link',{name:'Back to sign in'}).click();await selfPage.waitForURL('**/login');
 await login(selfPage,selfName,newPassword);
 // Self-service account deletion: Cloud-style confirmation, then the account and its unshared personal organization are gone.
 await selfPage.goto(base+'/settings');await selfPage.getByRole('button',{name:'Delete',exact:true}).click();
 const selfDrawer=selfPage.locator('.offcanvas.show');await selfDrawer.getByText(`Synthetic Self Delete ${run} (Personal)`).waitFor();
 const selfConfirm=selfDrawer.getByRole('button',{name:'Delete',exact:true});assert.ok(await selfConfirm.isDisabled(),'confirmation is required');
 await selfDrawer.getByLabel('Type DELETE to confirm').fill('DELETE');await shot(selfPage,'account-delete');await selfConfirm.click();await selfPage.waitForURL('**/login');
 assert.equal((await self.request.post(base+'/api/auth/login',{data:{email:selfName,password:newPassword}})).status(),401,'deleted account cannot sign in');
 await self.close();
 await page.goto(base+'/admin/organizations');assert.equal(await page.getByRole('link',{name:new RegExp(`Synthetic Self Delete ${run}`)}).count(),0,'unshared personal organization is deleted with the account');
 // The operator workspace cannot be deleted.
 await page.getByRole('link',{name:/^GuardScale guardscale(-[a-z0-9]{6})?$/}).first().click();await page.waitForURL('**/admin/organizations/*');await page.getByRole('button',{name:'Open organization console'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Delete',exact:true}).count(),0,'the operator workspace offers no Delete');
 // Admin user deletion from the detail page: the viewer's own personal organization goes, the shared membership is removed.
 await page.goto(base+`/admin/users/${userId}`);await page.getByRole('button',{name:'Delete',exact:true}).click();
 const userDrawer=page.locator('.offcanvas.show');await userDrawer.getByText('Memberships removed').waitFor();await userDrawer.getByText(orgName).waitFor();
 await userDrawer.getByLabel('Type DELETE to confirm').fill('DELETE');await shot(page,'user-delete');await userDrawer.getByRole('button',{name:'Delete',exact:true}).click();await page.waitForURL(u=>new URL(u).pathname==='/admin/users');
 assert.equal((await api.get(base+`/admin/users/${userId}`)).status(),404);
 assert.equal((await api.post(base+'/api/auth/login',{data:{email:userName,password:userPassword}})).status(),401,'deleted user cannot sign in');
 // Admin organization deletion from the detail page.
 assert.equal((await api.delete(base+`/api/orgs/${orgId}`,{headers:{Origin:base},data:{}})).status(),400,'API requires the typed confirmation');
 // A member whose only organization is this one: the account is deleted with it.
 const lastEmail='synthetic-last-member-'+run+'@example.com',lastMember=await api.post(base+'/api/v1/users',{headers:{Origin:base},data:{email:lastEmail,displayName:'Synthetic Last Member',password:'synthetic-last-'+randomUUID(),role:'viewer'}});assert.equal(lastMember.status(),201,await lastMember.text());const lastMemberId=(await lastMember.json()).id;cleanup.unshift(`/api/v1/users/${lastMemberId}`);
 await page.goto(base+`/admin/organizations/${orgId}`);await page.getByRole('button',{name:'Delete',exact:true}).click();
 const orgDrawer=page.locator('.offcanvas.show');await orgDrawer.getByText(serverName).waitFor();
 await orgDrawer.getByText('Accounts deleted').waitFor();await orgDrawer.getByText('Synthetic Last Member').waitFor();
 await orgDrawer.getByLabel('Type DELETE to confirm').fill('delete');assert.ok(await orgDrawer.getByRole('button',{name:'Delete',exact:true}).isDisabled(),'confirmation is case-sensitive');
 await orgDrawer.getByLabel('Type DELETE to confirm').fill('DELETE');await shot(page,'organization-delete');await orgDrawer.getByRole('button',{name:'Delete',exact:true}).click();await page.waitForURL(u=>new URL(u).pathname==='/admin/organizations');
 assert.equal(await page.getByRole('link',{name:new RegExp(orgName)}).count(),0);
 assert.equal((await api.get(base+`/admin/organizations/${orgId}`)).status(),404);
 assert.equal((await api.get(base+`/admin/users/${lastMemberId}`)).status(),404,'the member with no other organization is deleted');
 const anonymous=await browser.newContext();assert.ok([401,403,404].includes((await anonymous.request.post(base+'/api/v1/agents/heartbeat',{headers:{authorization:agent},data:{server_id:serverId,platform:'amd64'}})).status()),'the deleted organization enrollment stops authenticating agents');await anonymous.close();
 console.log('PASS: admin sidenav, organization/user/server list and detail pages, privacy limits, root-only access, links, add user by email, forgot password, account/user/organization deletion.');
}finally{
 for(const path of cleanup){const r=await api.delete(base+path,{headers:{Origin:base},data:{confirmation:'DELETE'}});if(![200,404].includes(r.status()))console.error(`cleanup ${path}: ${r.status()} ${await r.text()}`)}
 await browser.close();
}
