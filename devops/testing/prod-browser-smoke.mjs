import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';

const base='https://guardscale.org';
const file=process.env.GUARDSCALE_SESSION_FILE;if(!file)throw Error('Private session file required');
const token=(await readFile(file,'utf8')).trim();if(!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))throw Error('Invalid cookie file format');
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addCookies([{name:'guardscale_session',value:token,url:base,httpOnly:true,secure:true,sameSite:'Lax'}]);
const page=await context.newPage();let failures=0;const errors=[];
page.on('pageerror',()=>errors.push('uncaught browser error'));
try{
 for(const route of ['/console','/servers','/incidents','/settings','/billing','/api-reference','/docs/mcp']){
  const before=errors.length;
  const response=await page.goto(base+route,{waitUntil:'domcontentloaded'});
  await page.locator('main').waitFor();await page.waitForTimeout(1200);
  const passed=response?.status()===200&&!page.url().includes('/login')&&errors.length===before&&await page.getByRole('link',{name:'Demo',exact:true}).count()===0;
  console.log(passed?'PASS':'FAIL',route);if(!passed)failures++;
 }
 console.log(JSON.stringify({passed:failures===0,failures,browserErrors:errors.length}));
}finally{await context.close();await browser.close();}
if(failures)process.exitCode=1;
