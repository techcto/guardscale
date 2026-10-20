import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=process.env.GUARDSCALE_TEST_BASE_URL??'http://localhost:8193';
const url=new URL(base);
if(url.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('This smoke test is restricted to loopback HTTP.');
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 // First-request compilation on mounted development worktrees can be slow.
 context.setDefaultTimeout(180000);context.setDefaultNavigationTimeout(180000);
 page.on('pageerror',error=>errors.push(error.message));
 const anonymous=await context.request.get(base+'/api/admin/whatsapp',{timeout:180000,maxRedirects:0});
 assert.ok([307,308,403].includes(anonymous.status()),'unauthenticated setup must reject or redirect to login');
 if(anonymous.status()!==403)assert.ok(anonymous.headers().location?.includes('/login'));
 const login=await context.request.post(base+'/api/auth/login',{timeout:180000,data:{username:'root',password:process.env.GUARDSCALE_TEST_PASSWORD??'local-guide-test-only'}});
 assert.equal(login.status(),200,'local root login');
 await page.goto(base+'/admin/settings');
 await page.getByRole('heading',{name:'Messaging verification',exact:true}).waitFor();
 assert.equal(await page.getByLabel('AWS sender ID',{exact:true}).count(),0);
 const rejected=await context.request.post(base+'/api/admin/whatsapp',{headers:{origin:base},data:{action:'save',senderId:'phone-number-id-test',recipient:'+15550100001'}});
 assert.equal(rejected.status(),400);
 await page.getByLabel('Saved organization recipient').fill('+15550100001');
 await page.getByRole('button',{name:'Send WhatsApp reply test'}).click();
 await page.getByRole('status').filter({hasText:'disabled'}).waitFor();
 await page.reload();await page.getByRole('heading',{name:'Messaging verification',exact:true}).waitFor();
 assert.deepEqual(errors,[],'no client runtime errors');
 console.log(JSON.stringify({passed:true,launchOnlySender:true,senderWritesRejected:true,refresh:true,logModeNoDelivery:true,liveAWS:false}));
}finally{await browser.close()}
