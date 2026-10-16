import {NextRequest} from 'next/server';
import {operator} from './operator';
import {verifyToken} from './session';
import {store} from './store';
export type IntegrationToken={purpose:'integration-read'|'integration-response';userId:string;orgId:string;expiresAt:number};
export async function integrationIdentity(req:NextRequest){
 const bearer=req.headers.get('authorization');
 const token=bearer?await verifyToken<IntegrationToken>(bearer.replace(/^Bearer /,''),process.env.GUARDSCALE_SESSION_SECRET??''):null;
 const session=bearer?null:await operator(req);
 const valid=token?.purpose==='integration-read'||token?.purpose==='integration-response';
 const userId=valid?token.userId:session?.id;
 const orgId=valid?token.orgId:session?.orgId;
 if(!userId||!orgId)return null;
 const membership=await store.membership(orgId,userId);
 const canRespond=(token?.purpose==='integration-response'||session?.role==='root'||session?.role==='admin')&&(membership?.role==='admin'||userId==='root');
 if(userId==='root'&&process.env.GUARDSCALE_ROOT_USER&&membership?.status==='active')return {orgId,userId,canRespond};
 const user=await store.userById(userId);
 if(!user||user.status!=='active')return null;
 if(session?.role!=='root'&&(!membership||membership.status!=='active'))return null;
 return {orgId,userId,canRespond};
}
