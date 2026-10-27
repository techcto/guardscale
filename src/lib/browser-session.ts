import {cookies} from 'next/headers';
import {sessionCookie,verifySession} from './session';

export async function browserSession(){
 const jar=await cookies();
 return verifySession(jar.get(sessionCookie)?.value,process.env.GUARDSCALE_SESSION_SECRET??'');
}
