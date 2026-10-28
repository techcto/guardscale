import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {NextRequest} from 'next/server';
import {POST as addUser} from '../app/api/v1/users/route';
import {store} from './store';
import {createSession} from './session';
import {hashPassword} from './password';

test('adding an existing account changes only the selected organization membership',async()=>{
 const secret=process.env.GUARDSCALE_SESSION_SECRET,mode=process.env.GUARDSCALE_DEPLOYMENT_MODE;
 process.env.GUARDSCALE_SESSION_SECRET='existing-user-regression';process.env.GUARDSCALE_DEPLOYMENT_MODE='saas';
 const now=new Date().toISOString(),id=randomUUID(),email=`member-${id}@example.test`,passwordHash=hashPassword('existing-password-12345');
 const home=await store.createOrganization({name:'Existing user home',ownerId:id,orgType:'personal'});
 const target=await store.createOrganization({name:'Invite destination',ownerId:'root',orgType:'business'});
 const user={id,username:email,email,emailVerified:true,displayName:'Original name',status:'active' as const,createdAt:now,updatedAt:now};
 await store.createUser(user,passwordHash);
 await store.putMembership({id:randomUUID(),orgId:home.id,userId:id,role:'admin',status:'active',createdAt:now,updatedAt:now});
 const originalOrgs=(await store.organizations()).length;
 const cookie='guardscale_session='+await createSession({id:'root',username:'root',role:'root',orgId:target.id,expiresAt:Date.now()+60000},process.env.GUARDSCALE_SESSION_SECRET);
 const req=(body:unknown,origin='http://localhost')=>new NextRequest('http://localhost/api/v1/users',{method:'POST',headers:{host:'localhost',origin,cookie,'content-type':'application/json'},body:JSON.stringify(body)});
 try{
  assert.equal((await addUser(req({mode:'existing',email,role:'viewer'},'http://other.example'))).status,403);
  assert.equal((await addUser(req({mode:'existing',email:'unknown@example.test',role:'viewer'}))).status,404);
  assert.equal(await store.userByName('unknown@example.test'),null);
  assert.equal((await addUser(req({mode:'new',email,role:'viewer',displayName:'Replacement',password:'replacement-password'}))).status,409);
  assert.equal((await addUser(req({mode:'existing',email:email.toUpperCase(),role:'operator',displayName:'Ignored replacement',password:'ignored-password'}))).status,201);
  assert.equal((await store.membership(target.id,id))?.role,'operator');
  assert.equal((await store.membership(home.id,id))?.role,'admin');
  assert.deepEqual(await store.userById(id),user);
  assert.equal(await store.password(id),passwordHash);
  assert.equal((await store.organizations()).length,originalOrgs,'no new personal organization is created');
  assert.equal((await addUser(req({mode:'existing',email,role:'admin'}))).status,409);
  assert.equal((await store.membership(target.id,id))?.role,'operator','repeat add does not escalate access');
 }finally{
  await store.deleteOrganization(target.id);await store.deleteOrganization(home.id);await store.deleteUser(id);
  if(secret===undefined)delete process.env.GUARDSCALE_SESSION_SECRET;else process.env.GUARDSCALE_SESSION_SECRET=secret;
  if(mode===undefined)delete process.env.GUARDSCALE_DEPLOYMENT_MODE;else process.env.GUARDSCALE_DEPLOYMENT_MODE=mode;
 }
});
