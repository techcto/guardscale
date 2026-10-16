import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {POST} from '../app/mcp/route';
import {store} from './store';
import {signToken} from './session';
test('MCP read credentials cannot inspect or protect; response tools cannot invent an approval',async()=>{
 process.env.GUARDSCALE_ROOT_USER='unit-root';process.env.GUARDSCALE_SESSION_SECRET='unit-only-secret-not-a-deployment-credential';
 const org=await store.createOrganization({name:'MCP unit org',ownerId:'root',orgType:'business'}),now=new Date().toISOString();
 await store.putMembership({id:'unit-root-member',orgId:org.id,userId:'root',role:'admin',status:'active',createdAt:now,updatedAt:now});
 const call=async(purpose:string,method:string,params:unknown={})=>{
  const token=await signToken({purpose,userId:'root',orgId:org.id,expiresAt:Date.now()+60000},process.env.GUARDSCALE_SESSION_SECRET!);
  return (await POST(new NextRequest('http://localhost/mcp',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}))).json();
 };
 const read=await call('integration-read','tools/list');assert.ok(!read.result.tools.some((t:{name:string})=>t.name==='protect'));
 assert.equal((await call('integration-read','tools/call',{name:'protect',arguments:{approvalCommandId:'invented'}})).error.code,-32602);
 const response=await call('integration-response','tools/list');assert.ok(response.result.tools.some((t:{name:string})=>t.name==='inspect_server'));assert.ok(response.result.tools.some((t:{name:string})=>t.name==='protect'));
 assert.equal((await call('integration-response','tools/call',{name:'protect',arguments:{approvalCommandId:'invented'}})).result.isError,true);
});
