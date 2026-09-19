const encoder=new TextEncoder();
const b64=(v:Uint8Array|string)=>{const bytes=typeof v==='string'?encoder.encode(v):v;return Buffer.from(bytes).toString('base64url')};
const unb64=(v:string)=>Buffer.from(v,'base64url').toString('utf8');
async function signature(value:string,secret:string){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value))))}
export type Session={id:string;username:string;role:'root'|'admin'|'operator'|'viewer';expiresAt:number};
export async function createSession(value:Session,secret:string){const body=b64(JSON.stringify(value));return `${body}.${await signature(body,secret)}`}
export async function verifySession(token:string|undefined,secret:string){if(!token||!secret)return null;const [body,sig]=token.split('.');if(!body||!sig||await signature(body,secret)!==sig)return null;try{const value=JSON.parse(unb64(body)) as Session;return value.expiresAt>Date.now()?value:null}catch{return null}}
export const sessionCookie='guardian_session';
