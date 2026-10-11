import {NextRequest} from 'next/server';
import {operator} from './operator';
import {verifyToken} from './session';
import {store} from './store';
export type IntegrationToken={purpose:'integration-read';userId:string;orgId:string;expiresAt:number};
export async function integrationIdentity(req:NextRequest){
 const bearer=req.headers.get('authorization');
 const token=bearer?await verifyToken<IntegrationToken>(bearer.replace(/^Bearer /,''),process.env.GUARDSCALE_SESSION_SECRET??''):null;
 const session=bearer?null:await operator(req);
 const userId=token?.purpose==='integration-read'?token.userId:session?.id;
 const orgId=token?.purpose==='integration-read'?token.orgId:session?.orgId;
 if(!userId||!orgId)return null;
 const membership=await store.membership(orgId,userId);
 if(userId==='root'&&process.env.GUARDSCALE_ROOT_USER&&membership?.status==='active')return {orgId,userId};
 const user=await store.userById(userId);
 if(!user||user.status!=='active')return null;
 if(session?.role!=='root'&&(!membership||membership.status!=='active'))return null;
 return {orgId,userId};
}
