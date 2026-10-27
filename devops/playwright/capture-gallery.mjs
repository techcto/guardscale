import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

// Capture existing local records only. Never seed incidents or send messages.
const base=process.env.GALLERY_BASE_URL??'http://web:3000';
if(!/^http:\/\/(web:3000|localhost:8185)$/.test(base))throw Error('Local gallery only');
const out=process.env.GALLERY_OUTPUT??'/gallery';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:860},timezoneId:'America/New_York',deviceScaleFactor:1});
const login=await context.request.post(base+'/api/auth/login',{data:{username:'root',password:'test'}});
if(!login.ok())throw Error('Local fixture login failed');
const page=await context.newPage();
const slide=await context.newPage();await slide.setViewportSize({width:1500,height:1000});
const captures=[];
async function capture(file,title,caption,path,focus){
 await page.goto(base+path,{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(1600);
 if(focus)await focus(page);
 // Mask contact details and signed response tokens if present in visible text.
 await page.evaluate(()=>{const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){if(n.parentElement?.closest('script,style'))continue;n.textContent=n.textContent.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email hidden]').replace(/\+1[\d ()-]{10,18}/g,'[phone hidden]').replace(/eyJ[A-Za-z0-9_-]{30,}(?:\.[A-Za-z0-9_-]+)?/g,'[signed token hidden]');}});
 const shot=await page.screenshot({type:'png'});
 const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
 await slide.setContent(`<html><style>*{box-sizing:border-box}body{margin:0;background:#eaf2fa;color:#07111e;font-family:Arial}header{height:104px;padding:22px 30px;background:#07111e;color:white}small{color:#6bc9fa;letter-spacing:2px;font-size:12px}h1{font-size:27px;margin:9px 0}img{display:block;width:1440px;height:860px;margin:0 30px;border:1px solid #cbd9e7}footer{height:36px;padding:10px 30px;font-size:12px}</style><header><small>GUARDSCALE / REAL LOCAL CONSOLE</small><h1>${esc(title)}</h1></header><img src="data:image/png;base64,${shot.toString('base64')}"><footer>${esc(caption)}</footer></html>`);
 await slide.screenshot({path:out+'/'+file,type:'png'});
 captures.push({file,title,caption,path});
 console.log('Captured '+file);
}
try{
 await capture('01-operations-console.png','One place to understand origin-server activity','Real local fixture: enrolled Go agent, existing incidents and sanitized activity.','/console');
 await capture('02-server-activity.png','Watch the server, without opening a shell','Server detail: actual Apache activity and agent heartbeat from the isolated fixture.','/servers/local-php-fixture');
 await capture('03-grouped-incidents.png','Organize incidents by observed source','Existing development incidents; source grouping does not identify a person or establish intent.','/incidents');
 const list=await(await context.request.get(base+'/api/v1/incidents')).json();
 let selected,protectedId;
 for(const item of list){const d=await(await context.request.get(base+'/api/v1/incidents/'+item.incidentId)).json();if(!selected&&d.incident?.payload?.analysis?.status==='complete')selected=item.incidentId;if(!protectedId&&d.commands?.some(c=>['cancelled','expired','applied'].includes(c.status)))protectedId=item.incidentId;}
 selected??=list[0]?.incidentId;
 if(!selected)throw Error('Existing incident required; no invented records');
 await capture('04-incident-evidence.png','Start with measured findings','Existing incident evidence from the development test; historical approvals may have expired.','/incidents/'+selected);
 await capture('05-guardian-review.png','Inspect real evidence before recommending action','Actual saved Guardian review and tool results; no fresh inference is implied.','/incidents/'+selected,async p=>{const h=p.getByRole('heading',{name:'Guardian review',exact:true});await h.scrollIntoViewIfNeeded();const details=p.locator('details').filter({has:p.locator('summary',{hasText:'Inspection tools and results'})});if(await details.count())await details.evaluate(el=>el.open=true);await h.evaluate(el=>window.scrollTo(0,el.getBoundingClientRect().top+window.scrollY-100));});
 if(protectedId)await capture('06-protection-removed.png','Dismiss requests removal. The host confirms it.','Historical real protection result: removal confirmed by the agent; no fresh approval was issued.','/incidents/'+protectedId,async p=>{await p.getByRole('region',{name:'Incident actions',exact:true}).scrollIntoViewIfNeeded();});
 await writeFile(out+'/captures.json',JSON.stringify({capturedAt:new Date().toISOString(),source:'Existing local fixture records; no data seeded, no messaging sent.',captures},null,2));
}finally{await browser.close();}
