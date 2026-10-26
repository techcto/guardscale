import {createHmac} from 'node:crypto';
import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient,UpdateCommand} from '@aws-sdk/lib-dynamodb';
import {localEmulation} from './local-emulation';
export class SignupError extends Error{constructor(message:string,public status=400,public retryAfter?:number){super(message);}}
export const localAuthLinks=()=>process.env.NODE_ENV!=='production'||localEmulation()||process.env.GUARDSCALE_DEPLOYMENT_MODE!=='saas'&&process.env.GUARDSCALE_LOCAL_REPLAY==='true';
export function checkEmailDomain(email:string){
 const domain=email.split('@')[1];
 const blocked=(process.env.GUARDSCALE_BLOCKED_SIGNUP_DOMAINS??'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
 if(blocked.some(v=>domain===v||domain.endsWith('.'+v)))throw new SignupError('This email domain is not eligible for account registration.');
}
export function requireEmailDelivery(){
 if(!process.env.GUARDSCALE_SESSION_SECRET||(!localAuthLinks()&&(process.env.GUARDSCALE_NOTIFICATION_MODE!=='aws'||!process.env.GUARDSCALE_SES_FROM||!process.env.GUARDSCALE_PUBLIC_URL)))throw new SignupError('Email verification is temporarily unavailable. Please try again later.',503);
}
const memory=new Map<string,{count:number;expires:number}>();
const db=DynamoDBDocumentClient.from(new DynamoDBClient({endpoint:process.env.GUARDSCALE_DYNAMODB_ENDPOINT}));
export async function limitAuthRequests(headers:Headers,action:'signup'|'resend'){
 const windowSeconds=900,now=Math.floor(Date.now()/1000),bucket=Math.floor(now/windowSeconds),expires=(bucket+1)*windowSeconds;
 // The ALB appends the real client address. Never trust the caller-supplied first entry.
 const address=headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()||'unknown';
 const digest=createHmac('sha256',process.env.GUARDSCALE_SESSION_SECRET??'local').update(address).digest('hex');
 const key={pk:'AUTH_RATE#'+digest,sk:action+'#'+bucket},maximum=action==='signup'?20:10;
 const limited=()=>new SignupError('Too many requests. Please try again later.',429,expires-now);
 const table=process.env.GUARDSCALE_TABLE;
 if(table){try{await db.send(new UpdateCommand({TableName:table,Key:key,UpdateExpression:'SET #ttl=if_not_exists(#ttl,:ttl) ADD #count :one',ConditionExpression:'attribute_not_exists(#count) OR #count<:maximum',ExpressionAttributeNames:{'#ttl':'ttl','#count':'count'},ExpressionAttributeValues:{':ttl':expires,':one':1,':maximum':maximum}}));}catch(e){if(e instanceof Error&&e.name==='ConditionalCheckFailedException')throw limited();throw new SignupError('Account registration is temporarily unavailable.',503);}}
 else{
  if(!localAuthLinks())throw new SignupError('Account registration is temporarily unavailable.',503);
  for(const [id,row]of memory)if(row.expires<=now)memory.delete(id);
  const id=key.pk+key.sk,row=memory.get(id)??{count:0,expires};if(row.count>=maximum)throw limited();row.count++;memory.set(id,row);
 }
}
