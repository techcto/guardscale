const encoder=new TextEncoder();
const b64=(v:Uint8Array|string)=>{const bytes=typeof v==='string'?encoder.encode(v):v;return Buffer.from(bytes).toString('base64url')};
const unb64=(v:string)=>Buffer.from(v,'base64url').toString('utf8');
async function signature(value:string,secret:string){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value))))}
export async function signToken<T>(value:T,secret:string){const body=b64(JSON.stringify(value));return `${body}.${await signature(body,secret)}`}
export async function verifyToken<T extends {expiresAt:number}>(token:string|undefined,secret:string){if(!token||!secret)return null;const [body,sig]=token.split('.');if(!body||!sig||await signature(body,secret)!==sig)return null;try{const value=JSON.parse(unb64(body)) as T;return value.expiresAt>Date.now()?value:null}catch{return null}}
export type Session={id:string;username:string;role:'root'|'admin'|'operator'|'viewer';expiresAt:number};
export const createSession=(value:Session,secret:string)=>signToken(value,secret);
export const verifySession=(token:string|undefined,secret:string)=>verifyToken<Session>(token,secret);
export const sessionCookie='guardian_session';
export function isSecureRequest(req:{nextUrl:{protocol:string};headers:{get(name:string):string|null}}){return req.nextUrl.protocol==='https:'||req.headers.get('x-forwarded-proto')==='https'}
export function requestOrigin(req:{nextUrl:{protocol:string};headers:{get(name:string):string|null}}){const host=req.headers.get('x-forwarded-host')??req.headers.get('host');const protocol=isSecureRequest(req)?'https:':'http:';return `${protocol}//${host}`}
export type ResetToken={purpose:'password-reset';userId:string;expiresAt:number};
export const createResetToken=(userId:string,secret:string)=>signToken<ResetToken>({purpose:'password-reset',userId,expiresAt:Date.now()+900000},secret);
export const verifyResetToken=(token:string|undefined,secret:string)=>verifyToken<ResetToken>(token,secret);
