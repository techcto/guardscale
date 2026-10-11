const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 let executablePath;for(const dir of fs.readdirSync('/ms-playwright')){const p='/ms-playwright/'+dir+'/chrome-linux64/chrome';if(fs.existsSync(p))executablePath=p;}
 const browser=await chromium.launch({executablePath,args:['--no-sandbox']});
 const base=process.env.GUARDSCALE_TEST_URL||'http://localhost:8083';
 try{
  const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:120000});
  assert.equal(await page.getByRole('heading',{name:/A swarm can look human/}).count(),1);
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  await page.goto(base+'/console');assert.match(page.url(),/\/login/);
  const suffix=Date.now(),users=[];
  for(const n of [1,2]){
   const c=await browser.newContext();const r=await c.request.post(base+'/api/auth/signup',{data:{username:'test'+suffix+n,displayName:'Preview '+n,password:'preview-test-password-123'}});assert.equal(r.status(),201);
   const orgs=await(await c.request.get(base+'/api/orgs')).json();assert.equal(orgs.length,1);users.push({context:c,org:orgs[0]});
  }
  assert.notEqual(users[0].org.id,users[1].org.id);
  const denied=await users[0].context.request.post(base+'/api/orgs/active',{data:{orgId:users[1].org.id}});assert.equal(denied.status(),403);
  await users[0].context.close();await users[1].context.close();
  const login=await context.request.post(base+'/api/auth/login',{data:{username:'root',password:'guardscale-local-change-me'}});assert.equal(login.status(),200);
  await page.goto(base+'/console');await page.getByRole('navigation',{name:'Console navigation'}).waitFor();assert.equal(await page.getByRole('navigation',{name:'Console navigation'}).count(),1);assert.equal(await page.locator('.side-nav').count(),0);
  await page.getByRole('navigation',{name:'Console navigation'}).getByRole('link',{name:'Servers',exact:true}).click();assert.equal(await page.getByRole('heading',{name:'Servers',exact:true}).count(),1);
  await page.getByRole('button',{name:'Connect server',exact:true}).click();
  await page.getByLabel('Hosting provider').selectOption('ec2');
  assert.match(await page.locator('code').first().textContent(),/GUARDSCALE_URL='http:\/\/localhost:8083'/);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.goto(base+'/');assert.equal(await page.getByRole('navigation',{name:'Console navigation'}).count(),0);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',responsive:[390,768,1440],isolatedSignup:true,crossOrgSwitchDenied:true,scopedEnrollment:true}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
