import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server';
import {store} from './store';import {hashPassword} from './password';import {createSession} from './session';
import {sendMembershipEmail} from './membership-email';import {LogNotifier,type Notification} from './notifications';
import {POST as resend} from '../app/api/v1/users/[id]/invitation/route';
import {POST as addUser} from '../app/api/v1/users/route';

test('organization-access email is scoped, preserves identity, and has a bounded resend window',async()=>{
 const keys=['GUARDSCALE_SESSION_SECRET','GUARDSCALE_DEPLOYMENT_MODE','GUARDSCALE_PUBLIC_URL','GUARDSCALE_NOTIFICATION_MODE'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{GUARDSCALE_SESSION_SECRET:'membership-email-unit-secret',GUARDSCALE_DEPLOYMENT_MODE:'saas',GUARDSCALE_PUBLIC_URL:'https://guardscale.example',GUARDSCALE_NOTIFICATION_MODE:'log'});
 const id=randomUUID(),now=new Date().toISOString(),user={id,username:`member-${id}@example.test`,email:`member-${id}@example.test`,displayName:'Existing member',emailVerified:true,status:'active' as const,createdAt:now,updatedAt:now},password=hashPassword('existing-password-12345');
 const org=await store.createOrganization({name:'Workspace A',ownerId:'root',orgType:'business'}),other=await store.createOrganization({name:'Workspace B',ownerId:'root',orgType:'business'});
 await store.createUser(user,password);await store.putMembership({id:randomUUID(),orgId:org.id,userId:id,role:'operator',status:'active',createdAt:now,updatedAt:now});
 const req=new NextRequest('http://localhost/api/v1/users/'+id+'/invitation',{headers:{host:'localhost'}}),messages:Notification[]=[];
 try{
  const receipt=await sendMembershipEmail(req,org.id,id,{send:async message=>{messages.push(message);return 'provider-message';}});
  assert.equal(receipt.status,'provider_accepted');assert.equal(messages.length,1);assert.equal(messages[0].destination,user.email);assert.match(messages[0].text,/Workspace A/);assert.match(messages[0].text,/operator/);assert.match(messages[0].text,/workspace picker/);assert.match(messages[0].text,/https:\/\/guardscale.example\/login/);assert.ok(!messages[0].text.includes('existing-password'));
  await assert.rejects(sendMembershipEmail(req,org.id,id,{send:async()=>{throw Error('must not send twice')}}),/one minute/);
  await assert.rejects(sendMembershipEmail(req,other.id,id,{send:async()=>{throw Error('must not send outside org')}}),/active member/);
  assert.deepEqual(await store.userById(id),user);assert.equal(await store.password(id),password);
  const cookie='guardscale_session='+await createSession({id:'root',username:'root',role:'root',orgId:org.id,expiresAt:Date.now()+60000},process.env.GUARDSCALE_SESSION_SECRET!);
  const request=(origin='http://localhost')=>new NextRequest('http://localhost/api/v1/users/'+id+'/invitation',{method:'POST',headers:{host:'localhost',origin,cookie}});
  const params={params:Promise.resolve({id})};assert.equal((await resend(request('http://other.example'),params)).status,403);assert.equal((await resend(request(),params)).status,429);
  const wrongOrg='guardscale_session='+await createSession({id:'root',username:'root',role:'root',orgId:other.id,expiresAt:Date.now()+60000},process.env.GUARDSCALE_SESSION_SECRET!);
  assert.equal((await resend(new NextRequest('http://localhost/api/v1/users/'+id+'/invitation',{method:'POST',headers:{host:'localhost',origin:'http://localhost',cookie:wrongOrg}}),params)).status,404);
 }finally{await store.deleteOrganization(org.id);await store.deleteOrganization(other.id);await store.deleteUser(id);for(const key of keys)if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
});

test('email failure is reported separately from successful access creation',async t=>{
 const keys=['GUARDSCALE_SESSION_SECRET','GUARDSCALE_DEPLOYMENT_MODE','GUARDSCALE_PUBLIC_URL','GUARDSCALE_NOTIFICATION_MODE'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{GUARDSCALE_SESSION_SECRET:'membership-email-failure-secret',GUARDSCALE_DEPLOYMENT_MODE:'saas',GUARDSCALE_PUBLIC_URL:'https://guardscale.example',GUARDSCALE_NOTIFICATION_MODE:'log'});
 const org=await store.createOrganization({name:'Mail failure workspace',ownerId:'root',orgType:'business'}),id=randomUUID(),now=new Date().toISOString(),email=`failure-${id}@example.test`;
 await store.createUser({id,username:email,email,emailVerified:true,displayName:'Existing member',status:'active',createdAt:now,updatedAt:now},hashPassword('existing-password-12345'));
 const cookie='guardscale_session='+await createSession({id:'root',username:'root',role:'root',orgId:org.id,expiresAt:Date.now()+60000},process.env.GUARDSCALE_SESSION_SECRET!);
 t.mock.method(LogNotifier.prototype,'send',async()=>{throw Error('private-provider-detail')});
 try{
  const response=await addUser(new NextRequest('http://localhost/api/v1/users',{method:'POST',headers:{host:'localhost',origin:'http://localhost',cookie,'content-type':'application/json'},body:JSON.stringify({mode:'existing',email,role:'viewer'})}));
  assert.equal(response.status,201);const body=await response.json();assert.equal(body.invitation.status,'failed');assert.match(body.invitation.message,/Resend invitation/);assert.ok(!JSON.stringify(body).includes('private-provider-detail'));assert.equal((await store.membership(org.id,id))?.role,'viewer');
 }finally{await store.deleteOrganization(org.id);await store.deleteUser(id);for(const key of keys)if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}
});
