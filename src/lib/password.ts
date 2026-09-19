import{randomBytes,scryptSync,timingSafeEqual}from'node:crypto';
export function hashPassword(password:string){const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(password,salt,64).toString('hex')}`}
export function verifyPassword(password:string,stored:string){const [salt,hash]=stored.split(':');if(!salt||!hash)return false;const actual=scryptSync(password,salt,64),expected=Buffer.from(hash,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected)}
export function verifyLaunchPassword(password:string,expected:string,secret:string){const actual=scryptSync(password,secret,64),wanted=scryptSync(expected,secret,64);return timingSafeEqual(actual,wanted)}
