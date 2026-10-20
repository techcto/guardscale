import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NextRequest} from 'next/server';
import {GET,POST} from '../app/api/admin/whatsapp/route';
import {createSession,sessionCookie} from './session';
import {store} from './store';

test('WhatsApp admin API requires root and same origin, rejects sender changes',async()=>{
 const secret='unit-whatsapp-admin-session-not-production';process.env.GUARDSCALE_SESSION_SECRET=secret;process.env.GUARDSCALE_NOTIFICATION_MODE='log';
 const org=await store.createOrganization({name:'Setup admin API',ownerId:'root',orgType:'business'}),other=await store.createOrganization({name:'Unrelated org',ownerId:'root',orgType:'business'});
 const token=async(role:'root'|'admin'|'viewer')=>createSession({id:'unit-user',username:'unit',role,orgId:org.id,expiresAt:Date.now()+60000},secret);
 const request=(cookie?:string,body?:unknown,origin='http://localhost')=>new NextRequest('http://localhost/api/admin/whatsapp',{method:body?'POST':'GET',headers:{host:'localhost',origin,...(cookie?{cookie:`${sessionCookie}=${cookie}`}:{})},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await GET(request())).status,403);assert.equal((await GET(request(await token('admin')))).status,403);assert.equal((await GET(request(await token('viewer')))).status,403);
 const root=await token('root');assert.equal((await POST(request(root,{action:'save'},'https://evil.example'))).status,403);
 assert.equal((await POST(request(root,{action:'save',senderId:'+15550100000',recipient:'+15550100001'}))).status,400);
 const response=await POST(request(root,{action:'save',senderId:'phone-number-id-test',recipient:'+15550100001'}));assert.equal(response.status,400);
 assert.notEqual((await store.settings(org.id)).notifications.whatsappSenderId,'phone-number-id-test');assert.notEqual((await store.settings(other.id)).notifications.whatsappSenderId,'phone-number-id-test');
 const status=await GET(request(root));assert.equal(status.headers.get('cache-control'),'private, no-store');const data=await status.json();assert.equal(data.mode,'log');assert.equal(data.verifiedAt,null);assert.ok(!JSON.stringify(data).includes(secret));
 assert.equal((await POST(request(root,{action:'test',recipient:'+15550100001'}))).status,400,'log mode cannot claim a live test');
});
